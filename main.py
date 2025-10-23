# -*- coding: utf-8 -*-
import os, re, asyncio, json
from typing import Optional, Literal, Dict, Any
from contextlib import asynccontextmanager

import httpx
from cachetools import TTLCache
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.responses import Response

# ─────────────────────────────────────────────────────────────
# 환경 변수 / API 설정
# ─────────────────────────────────────────────────────────────
load_dotenv()
API_KEY = os.getenv("NXOPEN_API_KEY") or os.getenv("MAPLE_M_API_KEY")
if not API_KEY:
    raise RuntimeError("NEXON API key missing. Set NXOPEN_API_KEY or MAPLE_M_API_KEY in .env")

API_BASE = "https://open.api.nexon.com"
HEADERS = {"x-nxopen-api-key": API_KEY}
ICON_PREFIX = "https://open.api.nexon.com/static/maplestorym/asset/icon/"
HEX64 = re.compile(r"^[0-9a-f]{64}$", re.I)

# ─────────────────────────────────────────────────────────────
# 전역 HTTP 클라이언트 / 캐시 / 제한
# ─────────────────────────────────────────────────────────────
CLIENT: httpx.AsyncClient | None = None
SEM = asyncio.Semaphore(3)
INFLIGHT: Dict[str, asyncio.Task] = {}
cache = TTLCache(maxsize=512, ttl=300)

M_PATHS = {
    "id": "/maplestorym/v1/id",
    "basic": "/maplestorym/v1/character/basic",
    "stat": "/maplestorym/v1/character/stat",
    "item_equipment": "/maplestorym/v1/character/item-equipment",
    "set_effect": "/maplestorym/v1/character/set-effect",
    "jewel": "/maplestorym/v1/character/jewel",
    "pet_equipment": "/maplestorym/v1/character/pet-equipment",
    "android_equipment": "/maplestorym/v1/character/android-equipment",
    "skill_equipment": "/maplestorym/v1/character/skill-equipment",
    "link_skill": "/maplestorym/v1/character/link-skill",
    "vmatrix": "/maplestorym/v1/character/vmatrix",
    "symbol": "/maplestorym/v1/character/symbol",
}

WorldName = Literal["아케인", "크로아", "엘리시움", "루나", "스카니아", "유니온", "제니스"]

# ─────────────────────────────────────────────────────────────
# 유틸 함수
# ─────────────────────────────────────────────────────────────
def normalize_icon_url(v: Any) -> Any:
    if isinstance(v, str):
        if v.startswith("http://") or v.startswith("https://"):
            return v
        if HEX64.match(v):
            return ICON_PREFIX + v
    return v

def normalize_and_collect_icons(obj: Any, acc: set[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k.endswith("_icon") or k == "character_image":
                fixed = normalize_icon_url(v)
                obj[k] = fixed
                if isinstance(fixed, str):
                    acc.add(fixed)
            normalize_and_collect_icons(v, acc)
    elif isinstance(obj, list):
        for it in obj:
            normalize_and_collect_icons(it, acc)

async def nx_get(path: str, params: dict, max_retries: int = 4):
    assert CLIENT is not None
    q = {k: v for k, v in params.items() if v not in (None, "", [])}

    for attempt in range(max_retries):
        await SEM.acquire()
        try:
            r = await CLIENT.get(f"{API_BASE}{path}", params=q, headers=HEADERS)
        finally:
            SEM.release()

        if r.status_code == 429:
            ra = r.headers.get("Retry-After")
            wait = max(1, int(ra)) if ra and ra.isdigit() else (2 ** attempt)
            await asyncio.sleep(wait)
            continue
        if 500 <= r.status_code < 600:
            await asyncio.sleep(2 ** attempt)
            continue
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code,
                                detail=f"Upstream error {r.status_code}: {r.content!r}")
        return r.json()

    raise HTTPException(429, detail="Rate-limited by upstream after retries")

async def resolve_ocid_maplem(name_or_ocid: str, world_name: str) -> str:
    if HEX64.match(name_or_ocid):
        return name_or_ocid
    data = await nx_get(M_PATHS["id"], {"character_name": name_or_ocid, "world_name": world_name})
    ocid = data.get("ocid")
    if not ocid:
        raise HTTPException(404, detail=f"ID lookup failed for '{name_or_ocid}' in world '{world_name}'")
    return ocid

async def fetch_all_sections(ocid: str) -> dict:
    if ocid in cache:
        return cache[ocid]
    if ocid in INFLIGHT:
        return await INFLIGHT[ocid]

    async def _work():
        params = {"ocid": ocid}
        order = [
            "basic", "stat", "item_equipment", "set_effect", "symbol",
            "jewel", "android_equipment", "pet_equipment", "skill_equipment",
            "link_skill", "vmatrix"
        ]
        out: dict[str, Any] = {}
        for key in order:
            out[key] = await nx_get(M_PATHS[key], params)
            await asyncio.sleep(0.1)

        icon_set: set[str] = set()
        normalize_and_collect_icons(out, icon_set)
        out["_assets"] = {"icon_urls": sorted(icon_set)}
        cache[ocid] = out
        return out

    task = asyncio.create_task(_work())
    INFLIGHT[ocid] = task
    try:
        return await task
    finally:
        INFLIGHT.pop(ocid, None)

# ─────────────────────────────────────────────────────────────
# FastAPI 앱 (Lifespan 기반)
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global CLIENT
    CLIENT = httpx.AsyncClient(timeout=20)
    yield
    await CLIENT.aclose()
    CLIENT = None

app = FastAPI(title="MapleM Viewer", version="1.4", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/api/character")
async def api_character(
    q: str = Query(..., description="캐릭터명 또는 OCID(64hex)"),
    world_name: WorldName = Query(..., description="월드명(고정 선택)"),
):
    ocid = await resolve_ocid_maplem(q, world_name)
    return await fetch_all_sections(ocid)

@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)  # No Content

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="localhost", port=8000, reload=True)
