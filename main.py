# -*- coding: utf-8 -*-
import os, re, asyncio, json
from typing import Optional, Literal, Dict, Any

import httpx
from cachetools import TTLCache
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("NXOPEN_API_KEY") or os.getenv("MAPLE_M_API_KEY")
if not API_KEY:
    # .env 파일에 NXOPEN_API_KEY 또는 MAPLE_M_API_KEY를 반드시 설정
    raise RuntimeError("NEXON API key missing. Set NXOPEN_API_KEY or MAPLE_M_API_KEY in .env")

API_BASE = "https://open.api.nexon.com"
HEADERS = {"x-nxopen-api-key": API_KEY}

ICON_PREFIX = "https://open.api.nexon.com/static/maplestorym/asset/icon/"
HEX64 = re.compile(r"^[0-9a-f]{64}$", re.I)

# ─────────────────────────────────────────────────────────────
# 전역 HTTP 클라이언트/제한/캐시
# ─────────────────────────────────────────────────────────────
CLIENT: httpx.AsyncClient | None = None
SEM = asyncio.Semaphore(3)  # 업스트림 레이트리밋 고려: 동시 3개 제한
INFLIGHT: Dict[str, asyncio.Task] = {}  # 같은 ocid 동시 요청 디듀프

# 성공 결과 5분 캐시
cache = TTLCache(maxsize=512, ttl=300)

# 엔드포인트 경로 맵 (메이플M)
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

def normalize_icon_url(v: Any) -> Any:
    """아이콘 필드가 해시만 오면 공식 아이콘 URL로 승격."""
    if isinstance(v, str):
        if v.startswith("http://") or v.startswith("https://"):
            return v
        if HEX64.match(v):  # 해시만 온 케이스
            return ICON_PREFIX + v
    return v

def normalize_and_collect_icons(obj: Any, acc: set[str]) -> None:
    """payload 전체를 순회하며 *_icon / character_image 값을 URL로 보정 + 수집."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            is_icon_key = k.endswith("_icon") or k == "character_image"
            if is_icon_key:
                fixed = normalize_icon_url(v)
                obj[k] = fixed
                if isinstance(fixed, str) and fixed:
                    acc.add(fixed)
            normalize_and_collect_icons(v, acc)
    elif isinstance(obj, list):
        for it in obj:
            normalize_and_collect_icons(it, acc)

async def nx_get(path: str, params: dict, max_retries: int = 4):
    """
    단일 GET 호출 래퍼:
    - 전역 AsyncClient 사용
    - 동시성 제한(SEM)
    - 429/5xx 백오프 재시도
    """
    assert CLIENT is not None
    q = {k: v for k, v in params.items() if v not in (None, "", [])}

    for attempt in range(max_retries):
        await SEM.acquire()
        try:
            r = await CLIENT.get(f"{API_BASE}{path}", params=q, headers=HEADERS)
        finally:
            SEM.release()

        if r.status_code == 429:
            # Retry-After 헤더가 있으면 존중, 없으면 지수 백오프
            ra = r.headers.get("Retry-After")
            wait = max(1, int(ra)) if ra and ra.isdigit() else (2 ** attempt)
            await asyncio.sleep(wait)
            continue
        if 500 <= r.status_code < 600:
            await asyncio.sleep(2 ** attempt)
            continue
        if r.status_code >= 400:
            # 디버깅 편의상 원문 바디를 detail로 전달
            raise HTTPException(status_code=r.status_code,
                                detail=f"Upstream error {r.status_code}: {r.content!r}")
        return r.json()

    # 여기까지 왔으면 재시도 실패
    raise HTTPException(429, detail="Rate-limited by upstream after retries")

async def resolve_ocid_maplem(name_or_ocid: str, world_name: str) -> str:
    """
    캐릭터명+월드 → ocid
    이미 64hex면 그대로 ocid로 사용
    """
    if HEX64.match(name_or_ocid):
        return name_or_ocid
    data = await nx_get(M_PATHS["id"], {"character_name": name_or_ocid, "world_name": world_name})
    ocid = data.get("ocid")
    if not ocid:
        raise HTTPException(404, detail=f"ID lookup failed for '{name_or_ocid}' in world '{world_name}'")
    return ocid

async def fetch_all_sections(ocid: str) -> dict:
    """
    하나의 ocid에 대해 필요한 모든 섹션을 순차 수집(0.1s 페이싱).
    - 캐시 우선 사용
    - 동시 중복요청 디듀프
    - 리턴: { key: 섹션원본JSON, ... } + _assets.icon_urls
    """
    if ocid in cache:
        return cache[ocid]

    if ocid in INFLIGHT:
        return await INFLIGHT[ocid]  # 기존 태스크 결과 재사용

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
            await asyncio.sleep(0.1)  # 페이싱으로 429 빈도 낮춤

        # 아이콘 URL 보정 + 수집
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
# FastAPI 앱
# ─────────────────────────────────────────────────────────────
from fastapi import Request

app = FastAPI(title="MapleM Viewer", version="1.4")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
async def _startup():
    # http2=True로도 사용 가능(옵션) → 서버가 h2 지원하면 효과적
    global CLIENT
    CLIENT = httpx.AsyncClient(timeout=20)

@app.on_event("shutdown")
async def _shutdown():
    global CLIENT
    if CLIENT:
        await CLIENT.aclose()
        CLIENT = None

@app.get("/")
def root():
    # 단일 페이지 앱
    return FileResponse("static/index.html")

@app.get("/api/character")
async def api_character(
    q: str = Query(..., description="캐릭터명 또는 OCID(64hex)"),
    world_name: WorldName = Query(..., description="월드명(고정 선택)"),
):
    ocid = await resolve_ocid_maplem(q, world_name)
    return await fetch_all_sections(ocid)
