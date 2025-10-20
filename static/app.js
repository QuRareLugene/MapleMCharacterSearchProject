/* =========================================================================
 * Maple M Viewer — 칩/카드 정렬/폭 수정 + 하트 확장 + V매트릭스 상단정렬
 * ========================================================================= */

const $ = (sel) => document.querySelector(sel);
const ICON_PREFIX = "https://open.api.nexon.com/static/maplestorym/asset/icon/";

/* ---------- 칩 유틸 ---------- */
function chip(text, cls = "") {
  const s = document.createElement("span");
  s.className = `chip ${cls}`.trim();
  s.textContent = text;
  return s;
}
function chipRow(...chips) {
  const r = document.createElement("div");
  r.className = "chip-row";
  chips.filter(Boolean).forEach((c) => r.append(c));
  return r;
}
function chipStack(parent, labels = [], cls = "") {
  const wrap = document.createElement("div");
  wrap.className = `chip-stack ${cls}`.trim();
  labels.forEach((l) => wrap.append(chipRow(chip(l))));
  parent.append(wrap);
  return wrap;
}
function chipSection(title, rowsBuilder) {
  const wrap = document.createElement("div");
  wrap.className = "chip-section";
  const tt = document.createElement("div");
  tt.className = "chip-title";
  tt.textContent = title;
  wrap.append(tt);
  const body = document.createElement("div");
  body.className = "chip-stack stacked";
  if (typeof rowsBuilder === "function") rowsBuilder(body);
  wrap.append(body);
  return wrap;
}

/* ---------- 숫자 포맷 ---------- */
function toManNotation(n) {
  if (n == null) return "-";
  const num = Number(String(n).replace(/[^\d]/g, ""));
  if (!Number.isFinite(num)) return String(n);
  const man = Math.floor(num / 10000);
  const rest = num % 10000;
  if (man <= 0) return num.toLocaleString();
  return `${man} 만 ${String(rest).padStart(4, "0")}`;
}

/* ---------- 효과 텍스트 → 칩 ---------- */
function effectTextToChips(text) {
  if (!text) return [];
  let t = String(text).replace(/\s+/g, " ").trim();
  t = t.replace(/[\[\]]/g, ""); // 표시용 대괄호 제거
  const lv = t.match(/Lv\.?\s*([0-9]+)/i);
  const chips = [];
  if (lv) {
    chips.push(`Lv. ${lv[1]}`);
    t = (t.slice(0, lv.index) + t.slice(lv.index + lv[0].length)).trim();
    t = t.replace(/^[·•\/\|\;\s]+/, "");
  }
  const parts = t
    .split(/\n|<br\s*\/?>|[·•\/\|\;]|,\s+(?!\d)/i) // 천단위 콤마는 유지
    .map((s) => s.trim())
    .filter(Boolean);
  parts.forEach((p) => chips.push(p));
  return chips;
}
function setEffectToChips(text) {
  if (!text) return [];
  const t = String(text).trim().replace(/^\[|\]$/g, "").replace(/[\r\n]+/g, " ");
  return t.split(/,\s+(?!\d)/).map((s) => s.trim()).filter(Boolean);
}

/* ---------- 아이콘 URL 보정 ---------- */
function looksLikeHash(s) {
  return typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);
}
function normalizeIconUrl(u) {
  if (!u) return u;
  if (typeof u !== "string") return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (looksLikeHash(u)) return ICON_PREFIX + u;
  return u;
}
function normalizeAllIconsInPlace(obj, set = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((v) => normalizeAllIconsInPlace(v, set));
    return set;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const isIconKey = k.endsWith("_icon") || k === "character_image";
      if (isIconKey && typeof v === "string") {
        const fixed = normalizeIconUrl(v);
        obj[k] = fixed;
        if (fixed) set.add(fixed);
      }
      normalizeAllIconsInPlace(v, set);
    }
  }
  return set;
}

/* ---------- 등급 칩/테두리 ---------- */
const GRADE_CHIP_CLASS = {
  일반: "grade-normal",
  노말: "grade-normal",
  레어: "grade-rare",
  에픽: "grade-epic",
  유니크: "grade-unique",
  레전더리: "grade-legendary",
};
const GRADE_BORDER_CLASS = {
  일반: "grade-border-normal",
  노말: "grade-border-normal",
  레어: "grade-border-rare",
  에픽: "grade-border-epic",
  유니크: "grade-border-unique",
  레전더리: "grade-border-legendary",
};

/* ---------- 장신구 판단 ---------- */
const ACCESSORY_SLOTS = new Set([
  "반지 1","반지 2","반지 3","반지 4",
  "목걸이 1","목걸이 2","귀걸이 1",
  "얼굴장식","눈장식","훈장","칭호","뱃지","포켓",
]);
function isAccessorySlot(slotLabel = "") { return ACCESSORY_SLOTS.has(slotLabel); }

/* ---------- 전승/전수 라벨 ---------- */
function normalizeAbilityFlag(s, okLabel, badLabel) {
  if (!s) return null;
  const str = String(s);
  const ok = /가능|able|true|1/i.test(str);
  const no = /불가|not|false|0/i.test(str);
  if (ok && !no) return okLabel;
  if (no && !ok) return badLabel;
  return str;
}

/* ---------- DOM 유틸 ---------- */
function elt(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function safeImg(url, alt = "", size = 56, cls = "") {
  if (!url) return null;
  const img = document.createElement("img");
  img.alt = alt;
  img.width = size;
  img.height = size;
  img.src = normalizeIconUrl(url);
  if (cls) img.className = cls;
  img.onerror = () => img.remove();
  return img;
}
function emptyCard(msg = "없음") {
  const d = document.createElement("div");
  d.className = "empty-card";
  d.textContent = msg;
  return d;
}
function h4(text){ const h=document.createElement("h4"); h.textContent=text; return h; }

/* ---------- 슬롯명 정규화 ---------- */
function normalizeSlot(apiSlotName) {
  if (!apiSlotName) return "";
  const s = String(apiSlotName);
  if (s.startsWith("반지")) {
    if (s.includes("2번째")) return "반지 2";
    if (s.includes("3번째")) return "반지 3";
    if (s.includes("4번째")) return "반지 4";
    return "반지 1";
  }
  if (s.startsWith("목걸이")) return s.includes("2번째") ? "목걸이 2" : "목걸이 1";
  if (s.includes("귀고리")) return "귀걸이 1";
  if (s.includes("석궁")) return "무기";
  return s;
}

/* ---------- 전역 상태/핸들 ---------- */
let inFlight = null;
let currentPayload = null;
let currentWorldLabel = null;
let offlineSnapshot = null;
let offlineMode = false;

const statusEl = $("#status");
const btnSearch = $("#btn");
const btnExport = $("#export-json");
const inputWorld = $("#world");
const inputName = $("#q");
const inputImport = $("#import-json");
const offlineBadge = $("#offline-badge");
const offlineClear = $("#offline-clear");

document.addEventListener("DOMContentLoaded", () => {
  btnSearch.addEventListener("click", onSearch);
  inputName.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
  inputWorld.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
  inputImport.addEventListener("change", onImportFromFile);
  offlineClear.addEventListener("click", clearOfflineMode);
  btnExport.addEventListener("click", onExportSnapshot);
});

function setStatus(msg){ statusEl.classList.remove("hidden"); statusEl.textContent = msg; }
function setOfflineBadge(show){ offlineBadge.classList.toggle("hidden", !show); }

/* ---------- 검색/Import/Export ---------- */
async function onSearch() {
  const world = inputWorld.value;
  const name = inputName.value.trim();
  if (!world) { setStatus("월드를 선택하세요."); return; }
  if (!name) { setStatus("캐릭터명을 입력하세요."); return; }

  if (offlineMode && offlineSnapshot?.payload) {
    const payload = offlineSnapshot.payload;
    normalizeAllIconsInPlace(payload);
    currentPayload = payload;
    currentWorldLabel = snapshotWorldLabel(offlineSnapshot) || world;
    renderAll(payload, currentWorldLabel);
    statusEl.classList.add("hidden");
    return;
  }

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
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const payload = await res.json();
    normalizeAllIconsInPlace(payload);
    currentPayload = payload;
    currentWorldLabel = world;
    renderAll(payload, world);
    statusEl.classList.add("hidden");
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error(err);
      setStatus("조회 실패: " + err.message);
    }
  } finally {
    btnSearch.disabled = false;
    btnSearch.textContent = "검색";
    inFlight = null;
  }
}
async function onImportFromFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    let snapshot;
    if (isSnapshotFormat(json)) snapshot = json;
    else if (looksLikePayload(json)) {
      snapshot = {
        _type: "maplem.viewer.snapshot",
        version: 2,
        saved_at: new Date().toISOString(),
        meta: inferMetaFromPayload(json),
        assets: { icon_urls: Array.from(normalizeAllIconsInPlace(json)) },
        payload: json
      };
    } else throw new Error("알 수 없는 JSON 형식입니다.");

    validatePayload(snapshot.payload);
    normalizeAllIconsInPlace(snapshot.payload);
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
  } finally { e.target.value = ""; }
}
function isSnapshotFormat(obj){ return obj && obj._type==="maplem.viewer.snapshot" && obj.payload && typeof obj.payload==="object"; }
function looksLikePayload(obj){
  if (!obj || typeof obj!=="object") return false;
  const needed = ["basic","stat","item_equipment","set_effect","symbol","jewel","android_equipment","pet_equipment","skill_equipment","link_skill","vmatrix"];
  return needed.some((k)=>k in obj);
}
function inferMetaFromPayload(payload){ return { character_name: payload?.basic?.character_name || null, world_name: payload?.basic?.world_name || null }; }
function snapshotWorldLabel(snap){ return snap?.meta?.world_name || snap?.payload?.basic?.world_name || null; }
function validatePayload(p){ if (!p || typeof p!=="object") throw new Error("payload가 비어있습니다."); if (!p.basic) throw new Error("payload.basic 누락"); }
function clearOfflineMode(){ offlineMode=false; offlineSnapshot=null; setOfflineBadge(false); setStatus("오프라인 모드가 해제되었습니다."); }
function onExportSnapshot(){
  if (!currentPayload){ setStatus("내보낼 데이터가 없습니다. 먼저 검색하거나 스냅샷을 불러오세요."); return; }
  const iconSet = normalizeAllIconsInPlace(currentPayload, new Set());
  const icon_urls = Array.from(iconSet);
  currentPayload._assets = Object.assign({}, currentPayload._assets || {}, { icon_urls });
  const meta = {
    character_name: currentPayload?.basic?.character_name || null,
    world_name: currentWorldLabel || currentPayload?.basic?.world_name || null
  };
  const snapshot = {
    _type:"maplem.viewer.snapshot", version:2, saved_at:new Date().toISOString(),
    meta, assets:{ icon_urls }, payload: currentPayload
  };
  const char = meta.character_name || "character";
  const world = meta.world_name || "world";
  const stamp = new Date().toISOString().replace(/[:.]/g,"-");
  const filename = `maplem_${world}_${char}_${stamp}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus("JSON으로 내보냈습니다. (아이콘 링크 포함)");
}

/* ---------- 그룹/슬롯 ---------- */
const EQUIP_GROUPS = [
  { title:"무기", slots:["무기","보조무기","엠블렘"] },
  { title:"주 방어구", slots:["모자","상의","하의","한벌옷"] },
  { title:"보조 방어구", slots:["장갑","신발","어깨","벨트","망토"] },
  { title:"주 장신구", slots:["반지 1","반지 2","반지 3","반지 4","귀걸이 1","목걸이 1","목걸이 2","얼굴장식","눈장식"] },
  { title:"보조 장신구", slots:["훈장","칭호","뱃지","포켓"] },
];

/* ---------- 펫 타입 칩 ---------- */
const PET_TYPE_CLASS = {
  "루나 쁘띠":"pet-luna-petite",
  "루나":"pet-luna",
  "쁘띠":"pet-petite",
  "핑크빈":"pet-pinkbean",
  "예티":"pet-yeti",
  "리린":"pet-ririn",
  "드래곤":"pet-dragon",
  "키티":"pet-kitty",
};
function inferPetType(name = "") {
  for (const k of Object.keys(PET_TYPE_CLASS)) if (String(name).includes(k)) return k;
  return "기타";
}
function petTypeChip(name = "") {
  const t = inferPetType(name);
  const cls = PET_TYPE_CLASS[t] || "pet-etc";
  return chip(t, `pet-type ${cls}`);
}

/* ---------- 메인 렌더 ---------- */
function renderAll(data, worldLabel) {
  const S = {
    basic:{data:data.basic}, stat:{data:data.stat},
    item_equipment:{data:data.item_equipment}, set_effect:{data:data.set_effect},
    symbol:{data:data.symbol}, android_equipment:{data:data.android_equipment},
    jewel:{data:data.jewel}, pet_equipment:{data:data.pet_equipment},
    skill_equipment:{data:data.skill_equipment}, link_skill:{data:data.link_skill},
    vmatrix:{data:data.vmatrix}
  };

  /* 기본 정보 */
  const b = S.basic?.data || {};
  $("#basic").classList.remove("hidden");
  const avatar = $("#char-img");
  const repl = safeImg(b.character_image, "character", 120, "avatar") || Object.assign(document.createElement("div"), { className:"avatar" });
  avatar.replaceWith(repl); repl.id = "char-img";
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
  const statArr = S.stat?.data?.stat || S.stat?.data?.final_stat || [];
  const smap = new Map(statArr.map(s => [s.stat_name, s.stat_value]));
  const sg = $("#stats-grid"); sg.innerHTML = ""; sg.className = "stats-grid profile";
  const mk = (name, val, cls="") => {
    const box = elt("div", `stat ${cls}`);
    box.append(elt("div", "k", name));
    const vtxt = name === "전투력" ? toManNotation(val) : val ?? "-";
    box.append(elt("div", "v", vtxt));
    return box;
  };
  sg.append(mk("전투력", smap.get("전투력"), "full"));
  sg.append(mk("HP", smap.get("HP")));
  sg.append(mk("MP", smap.get("MP")));
  sg.append(mk("물리 공격력", smap.get("물리 공격력")));
  sg.append(mk("마법 공격력", smap.get("마법 공격력")));
  sg.append(mk("물리 방어력", smap.get("물리 방어력")));
  sg.append(mk("마법 방어력", smap.get("마법 방어력")));

  /* 심볼 */
  const sy = S.symbol?.data || {};
  const listSy = $("#symbol-list"); listSy.innerHTML = "";
  const arcanes = sy.arcane_symbol || [];
  const auths = sy.authentic_symbol || [];
  const symbolsSec = $("#symbols");
  if (arcanes.length || auths.length) {
    symbolsSec.classList.remove("hidden");
    listSy.className = "symbol-groups";
    const stripPrefix = (name) => String(name || "").replace(/^\s*(아케인\s*심볼|아케인심볼|어센틱\s*심볼|어센틱심볼)\s*:\s*/i, "").trim();
    const mkGroup = (title, arr, kind) => {
      const wrap = document.createElement("li");
      const t = elt("div", "symbol-group-title", title);
      const grid = elt("div", "symbol-grid");
      if (!arr.length) grid.append(emptyCard("없음"));
      arr.forEach(sym => {
        const card = elt("div", "symbol-card has-topchip");
        card.append(chip(kind, "mini top-left"));
        const icon = safeImg(sym.symbol_icon, sym.symbol_name, 56);
        if (icon) card.append(icon); else card.append(elt("div"));
        const meta = document.createElement("div");
        const region = stripPrefix(sym.symbol_name || "-");
        meta.append(elt("div", "name", `${kind} : ${region}`));
        const chips = [];
        if (sym.symbol_level != null) chips.push(`Lv. ${sym.symbol_level}`);
        effectTextToChips(sym.symbol_option).forEach((c) => chips.push(c));
        chipStack(meta, chips, "stacked");
        card.append(meta);
        grid.append(card);
      });
      wrap.append(t, grid);
      return wrap;
    };
    listSy.append(
      mkGroup("아케인 심볼", arcanes, "아케인심볼"),
      mkGroup("어센틱 심볼", auths, "어센틱심볼")
    );
  } else symbolsSec.classList.add("hidden");

  /* 장비 */
  const eqList = S.item_equipment?.data?.item_equipment || [];
  const equipWrap = $("#equip-wrap"); equipWrap.innerHTML = "";
  const slotMap = {};
  for (const it of eqList) {
    const key = normalizeSlot(it.item_equipment_slot_name || it.item_equipment_page_name);
    if (key && !slotMap[key]) slotMap[key] = it;
  }
  const hadOnePiece = !!slotMap["한벌옷"];
  if (hadOnePiece) { slotMap["상의"] = slotMap["한벌옷"]; slotMap.__onePiece = true; delete slotMap["한벌옷"]; }

  function threeLineRows(body, values = [], labelPrefix) {
    const rows = [values[0], values[1], values[2]];
    for (let i=0;i<3;i++){
      const v = rows[i];
      const row = document.createElement("div");
      row.className = "chip-row";
      row.append(chip(`${labelPrefix} ${i+1}`, "mini lbl"));
      row.append(chip(v ? v : "없음"));
      body.append(row);
    }
  }

  function buildEquipCard(slotLabel, item, noteWhenEmpty="장비 없음") {
    const gradeName = item?.item_grade || "";
    const borderCls = GRADE_BORDER_CLASS[gradeName] || "grade-border-normal";
    const card = elt("div", "equip" + (item ? ` ${borderCls}` : " empty"));
    card.classList.add("has-topchip");
    if (slotLabel) card.append(chip(slotLabel, "mini top-left"));

    if (item && item.item_icon) {
      const img = safeImg(item.item_icon, item.item_name, 56);
      if (img) card.append(img); else card.append(elt("div"));
    } else { card.append(elt("div")); }

    const body = document.createElement("div");
    if (item) {
      body.append(elt("div","name", item.item_name || "-"));

      const gradeChip = item.item_grade ? chip(item.item_grade, GRADE_CHIP_CLASS[item.item_grade] || "") : null;
      if (gradeChip) body.append(chipRow(gradeChip));
      if (item.starforce_upgrade) body.append(chipRow(chip(`${item.starforce_upgrade}★`)));
      if (item.equipment_level != null) body.append(chipRow(chip(`Lv. ${item.equipment_level}`)));
      const trans = normalizeAbilityFlag(item.transmission_able, "전승 가능", "전승 불가");
      const todd  = normalizeAbilityFlag(item.todd_able, "전수 가능", "전수 불가");
      if (trans || todd) body.append(chipRow(trans ? chip(trans) : null, todd ? chip(todd) : null));

      const mainOpts = effectTextToChips(item.item_option);
      if (mainOpts.length) {
        body.append(chipSection("장비의 주옵션", (stack)=>{ mainOpts.forEach(o=>stack.append(chipRow(chip(o)))); }));
      }

      if (!isAccessorySlot(slotLabel)) {
        const potVals = (item.item_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null).filter(Boolean);
        const addVals = (item.item_additional_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null).filter(Boolean);
        body.append(
          chipSection("잠재능력", (stack)=> threeLineRows(stack, potVals, "잠재능력")),
          chipSection("애디셔널", (stack)=> threeLineRows(stack, addVals, "애디셔널"))
        );
      }

      if (item.soul_equipment_flag === "1" && item.soul_info) {
        const soul = document.createElement("div");
        soul.className = "soul";
        soul.append(elt("div","soul-title", item.soul_info.soul_name || "소울"));
        const eff = (item.soul_info.soul_option || "").trim();
        if (eff) soul.append(elt("div","soul-opt", eff));
        body.append(soul);
      }
    } else {
      body.append(elt("div","slot-label", slotLabel));
      body.append(elt("div","note", noteWhenEmpty));
    }
    card.append(body);
    return card;
  }
  function groupBlock(title){ const wrap=elt("div","equip-group"); wrap.append(h4(title)); return wrap; }

  $("#equip").classList.remove("hidden");
  { const wrap=groupBlock("무기"); const grid=elt("div","equip-grid");
    ["무기","보조무기","엠블렘"].forEach(s=>grid.append(buildEquipCard(s, slotMap[s])));
    wrap.append(grid); equipWrap.append(wrap); }
  { const wrap=groupBlock("주 방어구"); const grid=elt("div","equip-grid");
    grid.append(buildEquipCard("모자", slotMap["모자"]));
    grid.append(buildEquipCard("상의", slotMap["상의"]));
    if (slotMap.__onePiece) grid.append(buildEquipCard("하의 (한벌옷)", null, "(한벌옷)"));
    else grid.append(buildEquipCard("하의", slotMap["하의"]));
    wrap.append(grid); equipWrap.append(wrap); }
  { const wrap=groupBlock("보조 방어구"); const g3=elt("div","row-grid-3 equal");
    g3.append(buildEquipCard("장갑",slotMap["장갑"]));
    g3.append(buildEquipCard("신발",slotMap["신발"]));
    g3.append(buildEquipCard("",null,"없음"));
    g3.append(buildEquipCard("어깨",slotMap["어깨"]));
    g3.append(buildEquipCard("망토",slotMap["망토"]));
    g3.append(buildEquipCard("벨트",slotMap["벨트"]));
    wrap.append(g3); equipWrap.append(wrap); }
  { const wrap=groupBlock("주 장신구");
    const r1=elt("div","row-grid-2 equal"); ["반지 1","반지 2"].forEach(s=>r1.append(buildEquipCard(s,slotMap[s])));
    const r2=elt("div","row-grid-2 equal"); ["반지 3","반지 4"].forEach(s=>r2.append(buildEquipCard(s,slotMap[s])));
    const r3=elt("div","row-grid-2 equal"); ["목걸이 1","목걸이 2"].forEach(s=>r3.append(buildEquipCard(s,slotMap[s])));
    const r4=elt("div","row-grid-2 equal"); r4.append(buildEquipCard("귀걸이 1", slotMap["귀걸이 1"])); r4.append(buildEquipCard("",null,"없음"));
    const r5=elt("div","row-grid-2 equal"); ["얼굴장식","눈장식"].forEach(s=>r5.append(buildEquipCard(s,slotMap[s])));
    wrap.append(r1,r2,r3,elt("div","block-gap"),r4,elt("div","block-gap"),r5); equipWrap.append(wrap); }
  { const wrap=groupBlock("보조 장신구");
    const r1=elt("div","row-grid-2 equal"); ["훈장","칭호"].forEach(s=>r1.append(buildEquipCard(s,slotMap[s])));
    const r2=elt("div","row-grid-2 equal"); ["뱃지","포켓"].forEach(s=>r2.append(buildEquipCard(s,slotMap[s])));
    wrap.append(r1,r2); equipWrap.append(wrap); }

  /* 세트 효과 (2단 카드) */
  const sets = S.set_effect?.data?.set_info || [];
  const setEl = $("#set-list"); setEl.innerHTML = "";
  if (sets.length) {
    $("#sets").classList.remove("hidden");
    for (const s of sets) {
      const li = document.createElement("li");
      const card = elt("div","set-card");
      card.append(elt("div","set-title", `${s.set_name} (${s.set_count}셋)`));
      const stack = elt("div","chip-stack stacked");
      setEffectToChips(String(s.set_option||"")).forEach(l=>stack.append(chipRow(chip(l))));
      card.append(stack); li.append(card); setEl.append(li);
    }
  }

  /* 쥬얼 */
  const jw = S.jewel?.data || {};
  const jewelSec = $("#jewel"); const gridJ = $("#jewel-grid"); gridJ.innerHTML = "";
  if (jw?.jewel_equipment?.length) {
    jewelSec.classList.remove("hidden");
    const active = Number(jw.use_jewel_page_no);
    jw.jewel_equipment.sort((a,b)=>(a.jewel_page_no??0)-(b.jewel_page_no??0)).forEach(pg=>{
      const pageNo = pg.jewel_page_no ?? "-";
      const page = elt("div", `jewel-page has-topchip ${pageNo===active?"active":"inactive"}`);
      page.append(chip(`쥬얼 페이지 ${pageNo}`, "mini top-left"));
      const head = elt("div","header");
      head.append(elt("div","muted small", pageNo===active ? "사용 중" : "비활성"));
      page.append(head);

      const pageOpt = pg.jewel_page_option || pg.jewel_page_effect || "";
      const pageChips = effectTextToChips(pageOpt);
      if (pageChips.length) chipStack(page, pageChips, "stacked");

      const five = elt("div","jewel-five");
      const gems = pg.jewel_info || [];
      if (!gems.length) five.append(emptyCard("젬 없음"));
      gems.forEach(j=>{
        const card = elt("div","jewel-card has-topchip " + (j.jewel_grade?`grade-${String(j.jewel_grade).toUpperCase()}`:""));
        card.append(chip(`슬롯 ${j.slot_no ?? "-"}`, "mini top-left"));
        const icon = safeImg(j.jewel_icon, j.jewel_name, 48, "jewel-icon");
        const meta = document.createElement("div"); meta.className="jewel-meta";
        meta.append(elt("span","name", j.jewel_name || "-"));
        const opt = j.jewel_option || "";
        if (opt) {
          const st = elt("div","chip-stack stacked");
          effectTextToChips(opt).forEach(o=>st.append(chipRow(chip(o))));
          meta.append(st);
        }
        if (icon) card.append(icon);
        card.append(meta);
        five.append(card);
      });
      page.append(five);
      gridJ.append(page);
    });
  } else { jewelSec.classList.remove("hidden"); gridJ.append(emptyCard("쥬얼 정보 없음")); }

  /* 안드로이드/하트/캐시장비 — 통합 카드 */
  const adAll = S.android_equipment?.data || {};
  const ad = adAll.android_equipment || {};
  const heart = adAll.heart_equipment || {};
  const pet = S.pet_equipment?.data || {};

  const androidSec = $("#android"); androidSec.classList.remove("hidden");
  const adWrap = $("#android-wrap"); adWrap.innerHTML = "";
  const heartWrap = $("#heart-wrap"); heartWrap.innerHTML = "";
  const petWrap = $("#pet-wrap"); petWrap.innerHTML = "";

  const androidCard = elt("div","subcard android-card has-topchip");
  androidCard.append(chip("안드로이드", "mini top-left"));

  // 본체
  const headBox = elt("div","android-head");
  if (Object.keys(ad).length) {
    const adIcon = safeImg(ad.android_icon, ad.android_name, 56, "icon-56");
    if (adIcon) headBox.append(adIcon);
    const meta = elt("div","android-meta");
    meta.append(elt("div","title-lg", `${ad.android_name || "-"} (${ad.android_grade || "-"})`));
    const tags = [];
    if (ad.android_non_humanoid_flag==="1") tags.push("비인간형");
    tags.push(`창고${ad.android_warehouse_usable_flag==="1"?" 사용가능":" 사용불가"}`);
    if (tags.length) meta.append(elt("div","kvline", tags.join(" · ")));
    headBox.append(meta);
  } else headBox.append(elt("div","muted","안드로이드 없음"));
  androidCard.append(headBox);

  // 캐시장비
  const cashList = ad.android_cash_item_equipment || [];
  const cashBox = elt("div","android-section");
  cashBox.append(elt("div","chip-title","캐시 장비"));
  if (cashList.length) {
    const grid = elt("div","mini-grid");
    cashList.forEach(ci=>{
      const c = elt("div","mini-card with-icon has-topchip");
      c.append(chip("캐시","mini top-left"));
      const icon = safeImg(ci.cash_item_icon, ci.cash_item_name, 28);
      if (icon) c.append(icon);
      const meta = elt("div","mini-meta");
      meta.append(elt("div","skill-name", ci.cash_item_name || "-"));
      const sub = [];
      if (ci.cash_item_equipment_page_name) sub.push(ci.cash_item_equipment_page_name);
      if (ci.cash_item_equipment_slot_name) sub.push(ci.cash_item_equipment_slot_name);
      if (sub.length) meta.append(elt("div","mini-sub", sub.join(" · ")));
      c.append(meta);
      grid.append(c);
    });
    cashBox.append(grid);
  } else { cashBox.append(emptyCard("캐시 장비 없음")); }
  androidCard.append(cashBox);

  // 하트 (등급/★/레벨/옵션/잠재/에디)
  const heartBox = elt("div","android-section");
  heartBox.append(elt("div","chip-title","하트"));
  if (Object.keys(heart).length) {
    const row = elt("div","heart-row");
    const hIcon = safeImg(heart.heart_icon, heart.heart_name, 40, "icon-40");
    if (hIcon) row.append(hIcon);
    const hm = elt("div","heart-meta");
    hm.append(elt("div","title-lg", heart.heart_name || "-"));
    const topChips = [];
    if (heart.item_grade) topChips.push(chip(heart.item_grade, GRADE_CHIP_CLASS[heart.item_grade]||""));
    if (heart.starforce_upgrade) topChips.push(chip(`${heart.starforce_upgrade}★`));
    if (heart.equipment_level != null) topChips.push(chip(`Lv. ${heart.equipment_level}`));
    if (topChips.length) hm.append(chipRow(...topChips));

    const main = effectTextToChips(heart.item_option || heart.heart_option);
    if (main.length) hm.append(chipSection("옵션", (st)=> main.forEach(o=>st.append(chipRow(chip(o))))));

    const potVals = (heart.item_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null).filter(Boolean);
    const addVals = (heart.item_additional_potential_option || []).map(p => p?.option_name ? `${p.option_name} ${p.option_value ?? ""}`.trim() : null).filter(Boolean);
    if (potVals.length) hm.append(chipSection("잠재능력", (st)=> potVals.forEach(v=>st.append(chipRow(chip(v))))));
    if (addVals.length) hm.append(chipSection("애디셔널", (st)=> addVals.forEach(v=>st.append(chipRow(chip(v))))));

    row.append(hm);
    heartBox.append(row);
  } else heartBox.append(emptyCard("하트 없음"));
  androidCard.append(heartBox);

  adWrap.append(androidCard);

  // 펫
  const petCard = elt("div","subcard");
  petCard.append(h4("펫"));
  const pRows = elt("div","row-grid-3 equal");
  const p1 = pet.pet_1_name ? `${pet.pet_1_name}` : "";
  const p2 = pet.pet_2_name ? `${pet.pet_2_name}` : "";
  const p3 = pet.pet_3_name ? `${pet.pet_3_name}` : "";
  [p1,p2,p3].forEach((nm,i)=>{
    const c = elt("div","mini-card has-topchip pet-card");
    c.append(chip(`펫 ${i+1}`, "mini top-left"));
    c.append(elt("div","pet-name", nm || "없음"));
    if (nm) c.append(petTypeChip(nm));
    pRows.append(c);
  });
  petCard.append(pRows);
  petWrap.append(petCard);

  /* 스킬 장착 (기존) */
  const eqSkills = S.skill_equipment?.data?.skill?.equipment_skill || [];
  const skList = $("#skill-list"); skList.innerHTML = "";
  const presetDiv = $("#skill-presets"); presetDiv.textContent = "";
  if (eqSkills.length) {
    $("#skills").classList.remove("hidden");
    const bySet = new Map();
    eqSkills.forEach(s => {
      const k = s.equipment_skill_set ?? 0;
      if (!bySet.has(k)) bySet.set(k, []);
      bySet.get(k).push(s);
    });
    presetDiv.textContent = `사용 세트: ${[...bySet.keys()].sort((a,b)=>a-b).join(", ")}`;
    [...bySet.entries()].sort((a,b)=>a[0]-b[0]).forEach(([setNo, items])=>{
      const card = elt("div","skill-set");
      card.append(h4(`세트 ${setNo}`));
      const grid = elt("div","grid-3");
      items.forEach(s=>{
        const mc = elt("div","mini-card has-topchip skill-card");
        mc.append(chip(`슬롯 ${s.slot_id ?? "-"}`, "mini top-left"));
        mc.append(elt("div","skill-name", s.skill_name || "-"));
        if (s.skill_level != null) mc.append(chipRow(chip(`Lv. ${s.skill_level}`, "mini")));
        grid.append(mc);
      });
      card.append(grid);
      skList.append(card);
    });
  } else { $("#skills").classList.remove("hidden"); skList.append(emptyCard("스킬 장착 없음")); }

  /* 링크 스킬 — 스킬명 → 레벨 → 효과 */
  const linkPresets = S.link_skill?.data?.link_skill || [];
  const usePreset = S.link_skill?.data?.use_prest_no;
  const linkUseEl = $("#link-use"); linkUseEl.textContent = "";
  const linkList = $("#link-list"); linkList.innerHTML = "";
  if (linkPresets.length) {
    $("#links").classList.remove("hidden");
    linkUseEl.textContent = usePreset != null ? `활성 프리셋: ${usePreset}` : "";
    linkPresets.sort((a,b)=>a.preset_no-b.preset_no).forEach(p=>{
      const pc = elt("div",`preset-card ${p.preset_no===usePreset?"active":"inactive"}`);
      pc.append(h4(`프리셋 ${p.preset_no}`));
      const grid = elt("div","grid-2");
      const arr = p.link_skill_info || [];
      if (!arr.length) grid.append(emptyCard("링크 없음"));
      arr.forEach(ls=>{
        const cell = elt("div","mini-card link-card");
        const ic = safeImg(ls.skill_icon, ls.skill_name, 28);
        if (ic) { cell.classList.add("with-icon"); cell.prepend(ic); }
        const meta = elt("div","link-meta");
        meta.append(elt("div","skill-name", ls.skill_name || "-"));
        if (ls.skill_level != null) meta.append(chipRow(chip(`Lv. ${ls.skill_level}`, "mini")));
        if (ls.skill_effect) {
          const chips = effectTextToChips(ls.skill_effect);
          const st = elt("div","chip-stack stacked");
          chips.forEach(c=>st.append(chipRow(chip(c))));
          meta.append(st);
        }
        cell.append(meta);
        grid.append(cell);
      });
      pc.append(grid);
      linkList.append(pc);
    });
  } else { $("#links").classList.remove("hidden"); linkList.append(emptyCard("링크 스킬 없음")); }

  /* V 매트릭스 — 2×15, 상단 정렬 + 타입/레벨 결합 칩 */
  const vcores = S.vmatrix?.data?.character_v_core_equipment || [];
  const vList = $("#v-list"); vList.innerHTML = "";
  if (vcores.length) {
    $("#vmatrix").classList.remove("hidden");
    const grid = elt("div","v-grid v-grid-2x15");
    vcores.forEach(v=>{
      const card = elt("div","v-card has-topchip");
      card.style.alignSelf = "start"; // 상단정렬 보강
      card.append(chip(`슬롯 ${v.slot_id ?? "-"}`, "mini top-left"));
      card.append(elt("div","v-name", v.v_core_name || "-"));

      const type = (v.v_core_type || "").toLowerCase();
      const typeShort = type==="skill" ? "Skill" : type==="enhancement" ? "Enhancement" : "Special";
      const levelChip = (v.v_core_level!=null) ? chip(`${typeShort}Lv. ${v.v_core_level}`, "mini") : null;
      const typeCls = type ? `vtype-${type}` : "";
      if (levelChip) { levelChip.classList.add(typeCls); card.append(chipRow(levelChip)); }

      if (type === "enhancement") {
        const names = [v.v_core_skill_name_1, v.v_core_skill_name_2, v.v_core_skill_name_3].filter(s=>s && s !== "(Unknown)");
        if (names.length) {
          const sec = chipSection("강화 대상", (stack)=> names.forEach(nm=>stack.append(chipRow(chip(nm)))));
          card.append(sec);
        }
      }
      const desc = [];
      if (v.v_core_skill_effect) effectTextToChips(v.v_core_skill_effect).forEach(c=>desc.push(c));
      if (desc.length) chipStack(card, desc, "stacked");

      grid.append(card);
    });
    vList.append(grid);
  } else { $("#vmatrix").classList.remove("hidden"); vList.append(emptyCard("V 매트릭스 없음")); }
}
