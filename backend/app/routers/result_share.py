from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.config import settings
from app.core.dependencies import get_db, get_optional_user
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.models.user import User
from app.schemas.result_share import ResultShareCreateResponse, ResultShareDataResponse
from app.services.file_service import FileService
from app.services.result_share_service import ResultShareService

router = APIRouter(
    prefix=f"{settings.api_prefix}/result-share",
    tags=["result-share"],
)

_MAX_RESULT_JSON_BYTES = 512 * 1024  # 500 KB
_VALID_LOCALES = {"en", "zh-CN"}

# share_type values that represent FaceMap analysis (need visualization stripping)
_FACEMAP_SHARE_TYPES = {"profile", "report", "similarity"}

# All valid share types
_VALID_SHARE_TYPES = _FACEMAP_SHARE_TYPES | {
    "compress", "remove_bg", "upscale", "restore_face",
    "denoise", "colorize", "inpaint", "scan_enhance", "mosaic",
}


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


@router.post("/create", response_model=ResultShareCreateResponse)
@limiter.limit(dynamic_rate_limit)
async def create_result_share(
    request: Request,
    image: UploadFile = File(...),
    result_json: str = Form(...),
    share_type: str = Form(...),
    locale: str = Form("zh-CN"),
    result_file_id: str | None = Form(None),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ResultShareCreateResponse:
    """Create a shareable link for any result type.

    For FaceMap: `image` is the face photo, `result_file_id` is None.
    For image tools: `image` is the original (before) image,
    `result_file_id` references the processed result file.
    """
    if share_type not in _VALID_SHARE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid share_type")
    if locale not in _VALID_LOCALES:
        locale = "zh-CN"
    if len(result_json) > _MAX_RESULT_JSON_BYTES:
        raise HTTPException(status_code=400, detail="Result data too large")

    # Validate and clean JSON
    try:
        parsed = json.loads(result_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")  # noqa: B904

    # Strip visualization data for FaceMap types
    if share_type in _FACEMAP_SHARE_TYPES:
        parsed.pop("visualization", None)
        if share_type == "report" and "profile" in parsed:
            parsed["profile"].pop("visualization", None)

    clean_json = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"))

    # Read and validate the uploaded image
    image_data = await image.read()
    if len(image_data) > _max_image_bytes():
        raise HTTPException(status_code=413, detail="File too large")
    validate_image_bytes(image_data)

    svc = ResultShareService(db)

    if result_file_id:
        # Image tool flow: image is the "before", result_file_id is the "after"
        try:
            file_svc = FileService()
            stored = file_svc.get(result_file_id)
            result_image_bytes = stored.path.read_bytes()
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Result file not found")  # noqa: B904

        share = await svc.create_share(
            image_bytes=result_image_bytes,
            result_json=clean_json,
            share_type=share_type,
            locale=locale,
            user_id=user.id if user else None,
            original_image_bytes=image_data,
        )
    else:
        # FaceMap flow: image is the face photo, no original
        share = await svc.create_share(
            image_bytes=image_data,
            result_json=clean_json,
            share_type=share_type,
            locale=locale,
            user_id=user.id if user else None,
        )

    await audit(
        category="share",
        action="create_result_share",
        user_id=user.id if user else None,
        ip=get_remote_address(request),
        detail={"share_type": share_type, "token": share.token},
    )
    share_url = f"{settings.frontend_base_url}/s/{share.token}"
    return ResultShareCreateResponse(
        token=share.token,
        share_url=share_url,
        expires_at=share.expires_at,
    )


@router.post("/create-similarity", response_model=ResultShareCreateResponse)
@limiter.limit(dynamic_rate_limit)
async def create_similarity_share(
    request: Request,
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
    result_json: str = Form(...),
    locale: str = Form("zh-CN"),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ResultShareCreateResponse:
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

    svc = ResultShareService(db)
    share = await svc.create_similarity_share(
        image1_bytes=data1,
        image2_bytes=data2,
        result_json=clean_json,
        locale=locale,
        user_id=user.id if user else None,
    )
    await audit(
        category="share",
        action="create_similarity_share",
        user_id=user.id if user else None,
        ip=get_remote_address(request),
        detail={"token": share.token},
    )
    share_url = f"{settings.frontend_base_url}/s/{share.token}"
    return ResultShareCreateResponse(
        token=share.token,
        share_url=share_url,
        expires_at=share.expires_at,
    )


@router.get("/{token}", response_model=ResultShareDataResponse)
@limiter.limit("30/minute")
async def get_result_share(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ResultShareDataResponse:
    """Retrieve shared result data. Public, no auth required."""
    svc = ResultShareService(db)
    share = await svc.get_share(token=token)
    image_url = f"{settings.api_prefix}/result-share/{share.token}/image"
    original_image_url = None
    if share.original_image_file_id:
        original_image_url = f"{settings.api_prefix}/result-share/{share.token}/original"
    return ResultShareDataResponse(
        token=share.token,
        result_json=share.result_json,
        share_type=share.share_type,
        locale=share.locale,
        image_url=image_url,
        original_image_url=original_image_url,
        expires_at=share.expires_at,
        created_at=share.created_at,
    )


@router.get("/{token}/image")
@limiter.limit("60/minute")
async def get_result_share_image(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Serve the stored result image. Public, no auth required."""
    svc = ResultShareService(db)
    share = await svc.get_share(token=token)
    path, content_type = svc.get_image(file_id=share.image_file_id)
    return FileResponse(
        path,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/{token}/original")
@limiter.limit("60/minute")
async def get_result_share_original(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Serve the original (before) image. Public, no auth required."""
    svc = ResultShareService(db)
    share = await svc.get_share(token=token)
    if not share.original_image_file_id:
        raise HTTPException(status_code=404, detail="No original image")
    path, content_type = svc.get_image(file_id=share.original_image_file_id)
    return FileResponse(
        path,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ---------------------------------------------------------------------------
# OG meta tags page for social media crawlers
# ---------------------------------------------------------------------------

og_router = APIRouter(tags=["result-share-og"])


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


_OG_TITLES: dict[str, tuple[str, str]] = {
    # share_type: (zh title, en title)
    "colorize": ("AI 老照片上色", "AI Photo Colorization"),
    "restore_face": ("AI 人脸修复", "AI Face Restoration"),
    "remove_bg": ("AI 智能抠图", "AI Background Removal"),
    "inpaint": ("AI 消除笔", "AI Object Removal"),
    "compress": ("图片压缩", "Image Compression"),
    "upscale": ("图片放大", "Image Upscale"),
    "denoise": ("图片降噪", "Image Denoise"),
    "scan_enhance": ("扫描增强", "Scan Enhancement"),
    "mosaic": ("马赛克处理", "Mosaic Effect"),
}


def _build_og_title(share_type: str, locale: str, parsed: dict) -> tuple[str, str]:
    """Return (title, description) for OG tags."""
    is_en = locale.startswith("en")

    if share_type in ("profile", "report"):
        profile = parsed.get("profile", parsed)
        gene_desc = profile.get("gene_card", {}).get("description", "")
        score = profile.get("overall_score", 0)
        if share_type == "report":
            title = f"FaceMap Full Report - Score {score}" if is_en else f"FaceMap 完整报告 - 得分 {score}"
        else:
            title = f"FaceMap Analysis - Score {score}" if is_en else f"FaceMap 面部分析 - 得分 {score}"
        return title, gene_desc

    if share_type == "similarity":
        score = parsed.get("overall_score", 0)
        summary = parsed.get("summary", "")
        title = f"Face Similarity - {score}% Match" if is_en else f"人脸相似度 - 相似{score}%"
        return title, summary

    # Image tools
    titles = _OG_TITLES.get(share_type, ("Toolii", "Toolii"))
    title = titles[1] if is_en else titles[0]
    desc = parsed.get("description", title)
    return f"{title} | Toolii", desc


def _build_share_html(
    *,
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


@og_router.get("/s/{token}", response_class=HTMLResponse)
@limiter.limit("30/minute")
async def result_share_og_page(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Serve HTML with OG tags for social media previews, then redirect to SPA."""
    svc = ResultShareService(db)
    spa_url = f"{settings.frontend_base_url}/r/{token}"
    try:
        share = await svc.get_share(token=token)
    except Exception:
        return HTMLResponse(
            f'<html><head><meta http-equiv="refresh" content="0;url={spa_url}"/>'
            f"<script>location.replace({json.dumps(spa_url)})</script>"
            f"</head><body></body></html>"
        )

    parsed = json.loads(share.result_json)
    locale = share.locale or "zh-CN"
    title, description = _build_og_title(share.share_type, locale, parsed)

    base = settings.frontend_base_url
    image_url = f"{base}/api/result-share/{token}/image"

    html = _build_share_html(
        title=title,
        description=description,
        image_url=image_url,
        spa_url=spa_url,
        locale=locale,
    )
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=300"})
