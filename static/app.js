/* =========================================================================
 *  Maple M Viewer — Import/Export 지원 버전
 *  - Import from JSON: API 없이 스냅샷 렌더
 *  - Export to JSON: 현재 화면 데이터를 그대로 파일로 저장
 *  - 오프라인 모드: 스냅샷 사용 중에는 검색시 API 호출을 건너뜀
 *  들여쓰기 4칸, 주석 자세히.
 * ========================================================================= */

const $ = (sel) => document.querySelector(sel);

/* 전역 상태 */
let inFlight = null;                     // 진행 중 요청 취소용 AbortController
let currentPayload = null;               // 마지막으로 렌더한 원시 데이터(/api/character 결과 또는 스냅샷 payload)
let currentWorldLabel = null;            // 현재 표시중인 월드명 (UI 라벨)
let offlineSnapshot = null;              // import 로드된 스냅샷 전체(JSON)
let offlineMode = false;                 // 오프라인 모드 플래그

/* UI 핸들 */
const statusEl = $("#status");
const btnSearch = $("#btn");
const btnExport = $("#export-json");
const inputWorld = $("#world");
const inputName = $("#q");
const inputImport = $("#import-json");
const offlineBadge = $("#offline-badge");
const offlineClear = $("#offline-clear");

/* 페이지 준비 */
document.addEventListener("DOMContentLoaded", () => {
    btnSearch.addEventListener("click", onSearch);
    inputName.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
    inputWorld.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });

    inputImport.addEventListener("change", onImportFromFile);
    offlineClear.addEventListener("click", clearOfflineMode);
    btnExport.addEventListener("click", onExportSnapshot);
});

/* 상태 메시지 표시 */
function setStatus(msg) {
    statusEl.classList.remove("hidden");
    statusEl.textContent = msg;
}

/* 오프라인 배지 표시/숨김 */
function setOfflineBadge(show) {
    offlineBadge.classList.toggle("hidden", !show);
}

/* ───────────────────────────────────────────────────────────
 *  검색 흐름
 *  - 오프라인 모드면 API 호출을 건너뛰고, 스냅샷으로 렌더
 * ─────────────────────────────────────────────────────────── */
async function onSearch() {
    const world = inputWorld.value;
    const name = inputName.value.trim();

    if (!world) { setStatus("월드를 선택하세요."); return; }
    if (!name) { setStatus("캐릭터명을 입력하세요."); return; }

    // 오프라인 모드: 스냅샷 바로 렌더 (API 호출 없음)
    if (offlineMode && offlineSnapshot && offlineSnapshot.payload) {
        const payload = offlineSnapshot.payload;
        currentPayload = payload;
        currentWorldLabel = snapshotWorldLabel(offlineSnapshot) || world;
        renderAll(payload, currentWorldLabel);
        statusEl.classList.add("hidden");
        return;
    }

    // 진행 중이면 취소
    if (inFlight) inFlight.abort();
    inFlight = new AbortController();

    btnSearch.disabled = true;
    btnSearch.textContent = "조회 중…";
    setStatus("조회 중…");

    const url = new URL("/api/character", location.origin);
    url.searchParams.set("q", name);
    url.searchParams.set("world_name", world);

    try {
        const res = await fetch(url.toString(), { signal: inFlight.signal });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(`${res.status} ${t}`);
        }
        const payload = await res.json();

        currentPayload = payload;
        currentWorldLabel = world;

        renderAll(payload, world);
        statusEl.classList.add("hidden");
    } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setStatus("조회 실패: " + err.message);
    } finally {
        btnSearch.disabled = false;
        btnSearch.textContent = "검색";
        inFlight = null;
    }
}

/* ───────────────────────────────────────────────────────────
 *  Import from JSON
 *  - 스냅샷 포맷
 *    {
 *      "_type": "maplem.viewer.snapshot",
 *      "version": 1,
 *      "saved_at": "ISO-8601",
 *      "meta": { "world_name": "...", "character_name": "..." },
 *      "payload": { basic: {...}, stat: {...}, ... }  // /api/character 결과 그대로
 *    }
 *  - 과거에 Export가 아닌 원본 API 응답(JSON)만 있을 수도 있으므로
 *    그런 경우도 최소 검증 후 그대로 payload로 취급.
 * ─────────────────────────────────────────────────────────── */
async function onImportFromFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const json = JSON.parse(text);

        let snapshot;
        if (isSnapshotFormat(json)) {
            // 권장 스냅샷 포맷
            snapshot = json;
        } else if (looksLikePayload(json)) {
            // /api/character 결과만 있는 JSON도 허용
            snapshot = {
                _type: "maplem.viewer.snapshot",
                version: 1,
                saved_at: new Date().toISOString(),
                meta: inferMetaFromPayload(json),
                payload: json
            };
        } else {
            throw new Error("알 수 없는 JSON 형식입니다.");
        }

        // 최소 키 검증
        validatePayload(snapshot.payload);

        offlineSnapshot = snapshot;
        offlineMode = true;
        setOfflineBadge(true);

        currentPayload = snapshot.payload;
        currentWorldLabel = snapshotWorldLabel(snapshot) || snapshot?.payload?.basic?.world_name || "(unknown)";

        renderAll(currentPayload, currentWorldLabel);
        statusEl.classList.add("hidden");
        setStatus("JSON 스냅샷이 로드되었습니다.");
    } catch (err) {
        console.error(err);
        setStatus("Import 실패: " + err.message);
    } finally {
        // 동일 파일 다시 선택 가능하도록 초기화
        e.target.value = "";
    }
}

/* 스냅샷 형식 판별 */
function isSnapshotFormat(obj) {
    return obj && obj._type === "maplem.viewer.snapshot" && obj.payload && typeof obj.payload === "object";
}

/* API payload 추정 */
function looksLikePayload(obj) {
    if (!obj || typeof obj !== "object") return false;
    const needed = ["basic", "stat", "item_equipment", "set_effect", "symbol", "jewel", "android_equipment", "pet_equipment", "skill_equipment", "link_skill", "vmatrix"];
    return needed.some((k) => k in obj);
}

/* payload에서 메타 추정 */
function inferMetaFromPayload(payload) {
    const name = payload?.basic?.character_name || null;
    const world = payload?.basic?.world_name || null;
    return { character_name: name, world_name: world };
}

/* 스냅샷에서 월드 라벨 결정 */
function snapshotWorldLabel(snap) {
    return snap?.meta?.world_name || snap?.payload?.basic?.world_name || null;
}

/* 간단 검증(필요 키만 확인) */
function validatePayload(p) {
    if (!p || typeof p !== "object") throw new Error("payload가 비어있습니다.");
    if (!p.basic) throw new Error("payload.basic 누락");
}

/* 오프라인 모드 해제(스냅샷 비적용) */
function clearOfflineMode() {
    offlineMode = false;
    offlineSnapshot = null;
    setOfflineBadge(false);
    setStatus("오프라인 모드가 해제되었습니다.");
}

/* ───────────────────────────────────────────────────────────
 *  Export to JSON
 *  - 현재 렌더에 사용한 데이터를 스냅샷 포맷으로 다운로드
 * ─────────────────────────────────────────────────────────── */
function onExportSnapshot() {
    if (!currentPayload) {
        setStatus("내보낼 데이터가 없습니다. 먼저 검색하거나 스냅샷을 불러오세요.");
        return;
    }

    const meta = {
        character_name: currentPayload?.basic?.character_name || null,
        world_name: currentWorldLabel || currentPayload?.basic?.world_name || null
    };

    const snapshot = {
        _type: "maplem.viewer.snapshot",
        version: 1,
        saved_at: new Date().toISOString(),
        meta,
        payload: currentPayload
    };

    const char = meta.character_name || "character";
    const world = meta.world_name || "world";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `maplem_${world}_${char}_${stamp}.json`;

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("JSON으로 내보냈습니다.");
}

/* ───────────────────────────────────────────────────────────
 *  렌더링 (그룹/슬롯 정렬, 공식 아이콘만)
 * ─────────────────────────────────────────────────────────── */
function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

/* 공식 아이콘만 사용: URL이 없거나 로딩 실패하면 이미지 자체를 숨김 */
function safeImg(url, alt = "", size = 56) {
    if (!url) return null;
    const img = document.createElement("img");
    img.alt = alt;
    img.width = size;
    img.height = size;
    img.src = url;
    img.onerror = () => { img.remove(); };
    return img;
}

/* 장비 슬롯 그룹(요청 순서 고정) */
const EQUIP_GROUPS = [
    { title: "무기",       slots: ["무기", "보조무기", "엠블렘"] },
    { title: "주 방어구",  slots: ["모자", "상의", "하의"] },
    { title: "보조 방어구", slots: ["장갑", "신발", "어깨", "벨트", "망토"] },
    { title: "주 장신구",  slots: ["반지 1", "반지 2", "반지 3", "반지 4", "귀걸이 1", "목걸이 1", "목걸이 2", "얼굴장식", "눈장식"] },
    { title: "보조 장신구", slots: ["훈장", "칭호", "뱃지", "포켓"] }
];

/* API 슬롯 문자열 → 고정 슬롯 키로 정규화 */
function normalizeSlot(apiSlotName) {
    if (!apiSlotName) return "";
    const s = String(apiSlotName);

    if (s.startsWith("반지")) {
        if (s.includes("2번째")) return "반지 2";
        if (s.includes("3번째")) return "반지 3";
        if (s.includes("4번째")) return "반지 4";
        return "반지 1";
    }
    if (s.startsWith("목걸이")) {
        if (s.includes("2번째")) return "목걸이 2";
        return "목걸이 1";
    }
    if (s.includes("귀고리")) return "귀걸이 1";
    return s;  // 무기/보조무기/엠블렘/모자/상의/하의/장갑/신발/어깨/벨트/망토/얼굴장식/눈장식/훈장/칭호/뱃지/포켓
}

/* 메인 렌더 함수 */
function renderAll(data, worldLabel) {
    const S = {
        basic:            { data: data.basic },
        stat:             { data: data.stat },
        item_equipment:   { data: data.item_equipment },
        set_effect:       { data: data.set_effect },
        symbol:           { data: data.symbol },
        android_equipment:{ data: data.android_equipment },
        jewel:            { data: data.jewel },
        pet_equipment:    { data: data.pet_equipment },
        skill_equipment:  { data: data.skill_equipment },
        link_skill:       { data: data.link_skill },
        vmatrix:          { data: data.vmatrix }
    };

    /* 기본 정보 */
    const b = S.basic?.data || {};
    $("#basic").classList.remove("hidden");

    const avatar = $("#char-img");
    const repl = safeImg(b.character_image, "character", 120) || Object.assign(document.createElement("div"), { className: "avatar" });
    avatar.replaceWith(repl);
    repl.id = "char-img";

    $("#name").textContent = b.character_name || "-";
    $("#job").textContent = b.character_job_name || b.character_class || "-";
    $("#world-label").textContent = worldLabel || b.world_name || "-";
    $("#level").textContent = b.character_level ?? "-";

    const times = [];
    if (b.character_date_create) times.push("생성: " + b.character_date_create);
    if (b.character_date_last_login) times.push("최근 접속: " + b.character_date_last_login);
    if (b.character_date_last_logout) times.push("최근 로그아웃: " + b.character_date_last_logout);
    $("#times").textContent = times.join(" · ");

    /* 스탯 */
    const stats = S.stat?.data?.stat || S.stat?.data?.final_stat || [];
    const sg = $("#stats-grid"); sg.innerHTML = "";
    if (Array.isArray(stats)) {
        for (const s of stats) {
            const box = el("div", "stat");
            box.append(el("div", "k", s.stat_name));
            box.append(el("div", "v", s.stat_value));
            sg.append(box);
        }
    }

    /* 심볼 */
    const sy = S.symbol?.data || {};
    const listSy = $("#symbol-list"); listSy.innerHTML = "";
    const arcanes = sy.arcane_symbol || [];
    const auths = sy.authentic_symbol || [];
    if (arcanes.length || auths.length) {
        $("#symbols").classList.remove("hidden");
        for (const sym of [...arcanes, ...auths]) {
            const li = el("li");
            const title = `${sym.symbol_name || ""} Lv.${sym.symbol_level ?? "-"}`;
            li.append(el("div", "name", title));
            if (sym.symbol_option) li.append(el("div", "muted small", sym.symbol_option));
            listSy.append(li);
        }
    }

    /* 장비: 그룹/슬롯 고정 자리 채우기(없으면 빈칸 카드) */
    const eqList = S.item_equipment?.data?.item_equipment || [];
    const equipWrap = $("#equip-wrap"); equipWrap.innerHTML = "";

    const slotMap = {};
    for (const it of eqList) {
        const key = normalizeSlot(it.item_equipment_slot_name || it.item_equipment_page_name);
        if (key && !slotMap[key]) slotMap[key] = it;
    }

    function buildEquipCard(slotLabel, item) {
        const card = el("div", "equip" + (item ? "" : " empty"));

        if (item && item.item_icon) {
            const img = safeImg(item.item_icon, item.item_name, 56);
            if (img) card.append(img);
            else card.append(el("div"));
        } else {
            card.append(el("div"));
        }

        const body = document.createElement("div");
        if (item) {
            const name = el("div", "name", item.item_name || "-");
            const metaStr = [slotLabel, item.item_grade || "", item.starforce_upgrade ? `${item.starforce_upgrade}★` : ""]
                .filter(Boolean).join(" · ");
            const meta = el("div", "meta", metaStr);
            const opts = item.item_option ? el("div", "meta", item.item_option) : null;

            body.append(name, meta);
            if (opts) body.append(opts);

            const tags = [];
            (item.item_potential_option || []).forEach(p => {
                if (p.option_name) tags.push(`${p.option_name} ${p.option_value}`);
            });
            if (tags.length) {
                const tagWrap = el("div", "small");
                tags.forEach(t => tagWrap.append(el("span", "tag", t)));
                body.append(tagWrap);
            }
        } else {
            body.append(el("div", "slot-label", slotLabel));
            body.append(el("div", "note", "장비 없음"));
        }

        card.append(body);
        return card;
    }

    if (EQUIP_GROUPS.length) {
        $("#equip").classList.remove("hidden");
        for (const group of EQUIP_GROUPS) {
            const wrap = el("div", "equip-group");
            wrap.append(el("h4", null, group.title));

            const grid = el("div", "equip-grid");
            for (const slot of group.slots) {
                grid.append(buildEquipCard(slot, slotMap[slot]));
            }
            wrap.append(grid);
            equipWrap.append(wrap);
        }
    }

    /* 세트 효과 */
    const sets = S.set_effect?.data?.set_info || [];
    const setEl = $("#set-list"); setEl.innerHTML = "";
    if (sets.length) {
        $("#sets").classList.remove("hidden");
        for (const s of sets) {
            const li = el("li");
            li.append(el("div", "name", `${s.set_name} (${s.set_count}셋)`));
            li.append(el("div", "muted small", s.set_option || ""));
            setEl.append(li);
        }
    }

    /* 쥬얼(공식 아이콘만) */
    const jw = S.jewel?.data || {};
    const gridJ = $("#jewel-grid"); gridJ.innerHTML = "";
    const infoJ = $("#jewel-info"); infoJ.textContent = "";
    if (jw?.jewel_equipment && jw.jewel_equipment.length) {
        $("#jewel").classList.remove("hidden");
        infoJ.textContent = `사용 페이지: ${jw.use_jewel_page_no ?? "-"} · 세트 옵션: ${jw.use_jewel_set_option || "-"}`;

        jw.jewel_equipment.forEach(pg => {
            (pg.jewel_info || []).forEach(j => {
                const card = document.createElement("div");
                card.className = "jewel-card " + (j.jewel_grade ? `grade-${String(j.jewel_grade).toUpperCase()}` : "");
                card.title = `${j.jewel_name || ""}\n${j.jewel_option || ""}`;

                const icon = safeImg(j.jewel_icon, j.jewel_name, 48);
                const meta = document.createElement("div");
                meta.className = "jewel-meta";
                meta.innerHTML = `
                    <span class="slot">슬롯 ${j.slot_no ?? "-"}</span>
                    <span class="name">${j.jewel_name || "-"}</span>
                    <span class="opt muted small">${j.jewel_option || ""}</span>
                `;

                if (icon) card.append(icon);
                card.append(meta);
                gridJ.append(card);
            });
        });
    }

    /* 안드로이드/펫 */
    const ad = S.android_equipment?.data?.android_equipment || {};
    const adWrap = $("#android-wrap"); adWrap.innerHTML = "";
    if (Object.keys(ad).length) {
        $("#android").classList.remove("hidden");
        adWrap.append(el("div", null, `안드로이드: ${ad.android_name || "-"} · ${ad.android_grade || ""}`));
    }
    const pet = S.pet_equipment?.data || {};
    const petWrap = $("#pet-wrap"); petWrap.innerHTML = "";
    if (pet.pet_1_name || pet.pet_2_name || pet.pet_3_name) {
        petWrap.append(el("div", null, `펫: ${[pet.pet_1_name, pet.pet_2_name, pet.pet_3_name].filter(Boolean).join(", ")}`));
    }

    /* 스킬 장착 */
    const eqSkills = S.skill_equipment?.data?.skill?.equipment_skill || [];
    const skList = $("#skill-list"); skList.innerHTML = "";
    if (eqSkills.length) {
        $("#skills").classList.remove("hidden");
        for (const s of eqSkills) {
            const li = el("li", "list-item");
            li.append(el("span", "tag", `슬롯 ${s.slot_id}`));
            li.append(el("span", "tag", s.skill_name || "-"));
            skList.append(li);
        }
    }

    /* 링크 스킬 */
    const linkPresets = S.link_skill?.data?.link_skill || [];
    const linkList = $("#link-list"); linkList.innerHTML = "";
    if (linkPresets.length) {
        $("#links").classList.remove("hidden");
        linkPresets.forEach(p => {
            (p.link_skill_info || []).forEach(ls => {
                const li = el("li");
                const row = document.createElement("div");
                row.className = "row";

                const icon = safeImg(ls.skill_icon, ls.skill_name, 28);
                if (icon) row.append(icon);
                row.append(el("div", "name", `${ls.skill_name} (Lv.${ls.skill_level})`));

                li.append(row);
                if (ls.skill_effect) li.append(el("div", "muted small", ls.skill_effect));
                linkList.append(li);
            });
        });
    }

    /* V 매트릭스 */
    const vcores = S.vmatrix?.data?.character_v_core_equipment || [];
    const vList = $("#v-list"); vList.innerHTML = "";
    if (vcores.length) {
        $("#vmatrix").classList.remove("hidden");
        for (const v of vcores) {
            const li = el("li", "list-item");
            li.append(el("span", "tag", `슬롯 ${v.slot_id}`));
            li.append(el("span", "tag", `${v.v_core_name} Lv.${v.v_core_level}`));
            vList.append(li);
        }
    }
}
