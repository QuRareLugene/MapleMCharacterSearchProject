import * as utils from "./utils.js";
import { renderAll } from "./render.js";

/* ---------- 전역 상태/핸들 ---------- */
let inFlight = null;
let currentPayload = null;
let currentWorldLabel = null;
let offlineSnapshot = null;
let offlineMode = false;

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = utils.$("#status");
  const btnSearch = utils.$("#btn");
  const btnExport = utils.$("#export-json");
  const inputWorld = utils.$("#world");
  const inputName = utils.$("#q");
  const inputImport = utils.$("#import-json");
  const offlineBadge = utils.$("#offline-badge");
  const offlineClear = utils.$("#offline-clear");

  btnSearch.addEventListener("click", onSearch);
  inputName.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
  inputWorld.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
  inputImport.addEventListener("change", onImportFromFile);
  offlineClear.addEventListener("click", clearOfflineMode);
  btnExport.addEventListener("click", onExportSnapshot);

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
      utils.normalizeAllIconsInPlace(payload);
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
      utils.normalizeAllIconsInPlace(payload);
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

      // 스냅샷 포맷이면 payload를 사용하고, 아니면 json 자체를 payload로 간주
      const payload = isSnapshotFormat(json) ? json.payload : json;
      
      validatePayload(payload);
      utils.normalizeAllIconsInPlace(payload);

      // 오프라인 스냅샷은 항상 스냅샷 포맷으로 저장
      const snapshot = isSnapshotFormat(json) ? json : {
          _type: "maplem.viewer.snapshot",
          version: 2,
          saved_at: new Date().toISOString(),
          meta: inferMetaFromPayload(payload),
          payload: payload
        };
      
      offlineSnapshot = snapshot;
      offlineMode = true;
      setOfflineBadge(true);

      currentPayload = payload;
      currentWorldLabel = snapshotWorldLabel(snapshot) || payload?.basic?.world_name || "(unknown)";
      renderAll(currentPayload, currentWorldLabel);
      statusEl.classList.add("hidden");
      setStatus("JSON 파일이 로드되었습니다.");
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

    // 내보내기 시에는 순수 원본 데이터(payload)만 저장
    const payloadToExport = currentPayload;
    
    const meta = {
      character_name: payloadToExport?.basic?.character_name || null,
      world_name: currentWorldLabel || payloadToExport?.basic?.world_name || null
    };
    
    const char = meta.character_name || "character";
    const world = meta.world_name || "world";
    const stamp = new Date().toISOString().replace(/[:.]/g,"-");
    const filename = `maplem_${world}_${char}_${stamp}.json`;
    
    const blob = new Blob([JSON.stringify(payloadToExport, null, 2)], { type:"application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setStatus("JSON으로 내보냈습니다.");
  }
});