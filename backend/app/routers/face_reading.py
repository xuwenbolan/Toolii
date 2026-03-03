from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db, get_optional_user, get_verified_user
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, dynamic_rate_limit_heavy, limiter
from app.core.task_limiter import acquire_task_slot
from app.core.tool_recording import ToolRecordingRoute
from app.models.user import User
from app.schemas.face_reading import FaceProfileResponse, FullReportResponse
from app.schemas.face_similarity import FaceSimilarityResponse
from app.schemas.facemap_share import FaceMapShareCreateResponse, FaceMapShareDataResponse
from app.services.face_similarity_service import FaceSimilarityService
from app.services.facemap_share_service import FaceMapShareService
from app.services.physiognomy_service import FaceMapService

router = APIRouter(prefix=f"{settings.api_prefix}/facemap", tags=["facemap"], route_class=ToolRecordingRoute)

_svc = FaceMapService()

_MAX_RESULT_JSON_BYTES = 512 * 1024  # 500 KB
_VALID_SHARE_TYPES = {"profile", "report", "similarity"}
_VALID_LOCALES = {"en", "zh-CN"}


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


def _normalize_locale(accept_lang: str | None) -> str:
    if not accept_lang:
        return "zh-CN"
    lang = accept_lang.split(",")[0].strip().lower()
    if lang.startswith("en"):
        return "en"
    return "zh-CN"


@router.post("/profile", response_model=FaceProfileResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def face_profile(
    request: Request,
    file: UploadFile = File(...),
) -> FaceProfileResponse:
    """Free tier face profile. No auth required."""
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _svc.analyze_profile(image_bytes=data, locale=locale)
        return FaceProfileResponse(**result)
    finally:
        sem.release()


@router.post("/report", response_model=FullReportResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def face_report(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_verified_user),
) -> FullReportResponse:
    """Paid tier face report. Credits handled by ToolGatewayRoute."""
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _svc.analyze_report(
            image_bytes=data,
            locale=locale,
        )
        return FullReportResponse(**result)
    finally:
        sem.release()


# ---------------------------------------------------------------------------
# Face similarity comparison
# ---------------------------------------------------------------------------

_sim_svc = FaceSimilarityService()


@router.post("/similarity", response_model=FaceSimilarityResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def face_similarity(
    request: Request,
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
) -> FaceSimilarityResponse:
    """Compare two face images. Free, no auth required."""
    sem = await acquire_task_slot(request)
    try:
        data1 = await file1.read()
        data2 = await file2.read()
        max_bytes = _max_image_bytes()
        if len(data1) > max_bytes or len(data2) > max_bytes:
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data1)
        validate_image_bytes(data2)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _sim_svc.compare(
            image1_bytes=data1,
            image2_bytes=data2,
            locale=locale,
        )
        return FaceSimilarityResponse(**result)
    finally:
        sem.release()


# ---------------------------------------------------------------------------
# FaceMap share endpoints
# ---------------------------------------------------------------------------


@router.post("/share", response_model=FaceMapShareCreateResponse)
@limiter.limit(dynamic_rate_limit)
async def create_facemap_share(
    request: Request,
    file: UploadFile = File(...),
    result_json: str = Form(...),
    share_type: str = Form(...),
    locale: str = Form("zh-CN"),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> FaceMapShareCreateResponse:
    """Create a shareable link for FaceMap results."""
    if share_type not in _VALID_SHARE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid share_type")
    if locale not in _VALID_LOCALES:
        locale = "zh-CN"
    if len(result_json) > _MAX_RESULT_JSON_BYTES:
        raise HTTPException(status_code=400, detail="Result data too large")

    # Validate JSON is parseable and strip visualization data
    try:
        parsed = json.loads(result_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")  # noqa: B904
    parsed.pop("visualization", None)
    if share_type == "report" and "profile" in parsed:
        parsed["profile"].pop("visualization", None)
    clean_json = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))

    image_data = await file.read()
    if len(image_data) > _max_image_bytes():
        raise HTTPException(status_code=413, detail="File too large")
    validate_image_bytes(image_data)

    svc = FaceMapShareService(db)
    share = await svc.create_share(
        image_bytes=image_data,
        result_json=clean_json,
        share_type=share_type,
        locale=locale,
        user_id=user.id if user else None,
    )
    share_url = f"{settings.frontend_base_url}/facemap/s/{share.token}"
    return FaceMapShareCreateResponse(
        token=share.token,
        share_url=share_url,
        expires_at=share.expires_at,
    )


@router.post("/share/similarity", response_model=FaceMapShareCreateResponse)
@limiter.limit(dynamic_rate_limit)
async def create_similarity_share(
    request: Request,
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    result_json: str = Form(...),
    locale: str = Form("zh-CN"),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> FaceMapShareCreateResponse:
    """Create a shareable link for face similarity results."""
    if locale not in _VALID_LOCALES:
        locale = "zh-CN"
    if len(result_json) > _MAX_RESULT_JSON_BYTES:
        raise HTTPException(status_code=400, detail="Result data too large")

    try:
        parsed = json.loads(result_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")  # noqa: B904
    clean_json = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))

    max_bytes = _max_image_bytes()
    data1 = await file1.read()
    data2 = await file2.read()
    if len(data1) > max_bytes or len(data2) > max_bytes:
        raise HTTPException(status_code=413, detail="File too large")
    validate_image_bytes(data1)
    validate_image_bytes(data2)

    svc = FaceMapShareService(db)
    share = await svc.create_similarity_share(
        image1_bytes=data1,
        image2_bytes=data2,
        result_json=clean_json,
        locale=locale,
        user_id=user.id if user else None,
    )
    share_url = f"{settings.frontend_base_url}/face-similarity/s/{share.token}"
    return FaceMapShareCreateResponse(
        token=share.token,
        share_url=share_url,
        expires_at=share.expires_at,
    )


@router.get("/share/{token}", response_model=FaceMapShareDataResponse)
@limiter.limit("30/minute")
async def get_facemap_share(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FaceMapShareDataResponse:
    """Retrieve shared FaceMap data. Public, no auth required."""
    svc = FaceMapShareService(db)
    share = await svc.get_share(token=token)
    image_url = f"{settings.api_prefix}/facemap/share/{share.token}/image"
    return FaceMapShareDataResponse(
        token=share.token,
        result_json=share.result_json,
        share_type=share.share_type,
        locale=share.locale,
        image_url=image_url,
        expires_at=share.expires_at,
        created_at=share.created_at,
    )


@router.get("/share/{token}/image")
@limiter.limit("60/minute")
async def get_facemap_share_image(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Serve the stored share image. Public, no auth required."""
    svc = FaceMapShareService(db)
    share = await svc.get_share(token=token)
    path = svc.get_image_path(file_id=share.image_file_id)
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# Share page with OG meta tags (for social media crawlers)
# ---------------------------------------------------------------------------

share_page_router = APIRouter(tags=["facemap-share-page"])


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def _build_share_html(
    *,
    token: str,
    title: str,
    description: str,
    image_url: str,
    spa_url: str,
    locale: str = "zh-CN",
) -> str:
    t = _html_escape(title)
    d = _html_escape(description[:200])
    lang = "en" if locale.startswith("en") else "zh-CN"
    return f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{t}</title>
<meta name="description" content="{d}"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="{t}"/>
<meta property="og:description" content="{d}"/>
<meta property="og:image" content="{_html_escape(image_url)}"/>
<meta property="og:url" content="{_html_escape(spa_url)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="{t}"/>
<meta name="twitter:description" content="{d}"/>
<meta name="twitter:image" content="{_html_escape(image_url)}"/>
<meta http-equiv="refresh" content="0;url={_html_escape(spa_url)}"/>
<script>location.replace({json.dumps(spa_url)})</script>
</head>
<body></body>
</html>"""


@share_page_router.get("/facemap/s/{token}", response_class=HTMLResponse)
@limiter.limit("30/minute")
async def facemap_share_page(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Serve HTML with OG tags for social media previews, then redirect to SPA."""
    svc = FaceMapShareService(db)
    try:
        share = await svc.get_share(token=token)
    except Exception:
        # Expired or not found — redirect to SPA which shows the error UI
        spa_url = f"{settings.frontend_base_url}/facemap/share/{token}"
        return HTMLResponse(
            f'<html><head><meta http-equiv="refresh" content="0;url={spa_url}"/>'
            f"<script>location.replace({json.dumps(spa_url)})</script>"
            f"</head><body></body></html>"
        )

    parsed = json.loads(share.result_json)
    profile = parsed.get("profile", parsed)
    gene_desc = profile.get("gene_card", {}).get("description", "")
    score = profile.get("overall_score", 0)

    base = settings.frontend_base_url
    locale = share.locale or "zh-CN"
    if locale.startswith("en"):
        title = f"FaceMap Analysis - Score {score}"
    else:
        title = f"FaceMap \u9762\u90e8\u5206\u6790 - \u5f97\u5206 {score}"

    image_url = f"{base}/api/facemap/share/{token}/image"
    spa_url = f"{base}/facemap/share/{token}"

    html = _build_share_html(
        token=token,
        title=title,
        description=gene_desc,
        image_url=image_url,
        spa_url=spa_url,
        locale=locale,
    )
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=300"})


@share_page_router.get("/face-similarity/s/{token}", response_class=HTMLResponse)
@limiter.limit("30/minute")
async def similarity_share_page(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """OG tags page for face similarity shares."""
    svc = FaceMapShareService(db)
    try:
        share = await svc.get_share(token=token)
    except Exception:
        spa_url = f"{settings.frontend_base_url}/face-similarity/share/{token}"
        return HTMLResponse(
            f'<html><head><meta http-equiv="refresh" content="0;url={spa_url}"/>'
            f"<script>location.replace({json.dumps(spa_url)})</script>"
            f"</head><body></body></html>"
        )

    parsed = json.loads(share.result_json)
    score = parsed.get("overall_score", 0)
    summary = parsed.get("summary", "")

    base = settings.frontend_base_url
    locale = share.locale or "zh-CN"
    if locale.startswith("en"):
        title = f"Face Similarity - {score}% Match"
    else:
        title = f"\u4eba\u8138\u76f8\u4f3c\u5ea6 - \u76f8\u4f3c{score}%"

    image_url = f"{base}/api/facemap/share/{token}/image"
    spa_url = f"{base}/face-similarity/share/{token}"

    html = _build_share_html(
        token=token,
        title=title,
        description=summary,
        image_url=image_url,
        spa_url=spa_url,
        locale=locale,
    )
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=300"})
