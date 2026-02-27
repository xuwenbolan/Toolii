from __future__ import annotations

import asyncio
import base64
import io
import json
import time
import uuid
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.background_removal import remove_background
from app.processing.compliance_checker import check_photo_compliance
from app.processing.face_detection import detect_faces, select_primary_face
from app.processing.photo_cropper import crop_id_photo
from app.processing.photo_layout import create_print_layout
from app.schemas.image import FileResult
from app.schemas.photo import PhotoProcessResponse, PhotoStandard, PhotoUploadResponse
from app.services.credit_service import CreditService
from app.services.file_service import FileService


@dataclass
class UploadSession:
    upload_id: str
    file_id: str
    filename: str
    width: int
    height: int
    faces: list[dict[str, Any]]
    detection_engine: str
    created_at: float


@dataclass
class ProcessedSession:
    processed_id: str
    upload_id: str
    file_id: str
    standard_code: str
    background_color: str
    model_used: str
    created_at: float


_upload_sessions: dict[str, UploadSession] = {}
_processed_sessions: dict[str, ProcessedSession] = {}
_session_lock = asyncio.Lock()


def _standards_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "photo_standards.json"


def _load_standards() -> list[dict[str, Any]]:
    data = json.loads(_standards_path().read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("photo_standards.json must be a list")
    return [dict(item) for item in data]


def _watermark_preview(photo_png_bytes: bytes, *, text: str = "TOOLII PREVIEW") -> bytes:
    image = Image.open(io.BytesIO(photo_png_bytes)).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.load_default()

    step_x = max(80, image.width // 3)
    step_y = max(70, image.height // 4)
    for y in range(-20, image.height + step_y, step_y):
        for x in range(-40, image.width + step_x, step_x):
            draw.text((x, y), text, fill=(255, 255, 255, 72), font=font)

    # Add a stronger center label for clarity.
    center_text = "Preview"
    bbox = draw.textbbox((0, 0), center_text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    cx = (image.width - tw) // 2
    cy = (image.height - th) // 2
    draw.rectangle((cx - 8, cy - 5, cx + tw + 8, cy + th + 5), fill=(0, 0, 0, 72))
    draw.text((cx, cy), center_text, fill=(255, 255, 255, 220), font=font)

    out = Image.alpha_composite(image, overlay)
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


class PhotoService:
    def __init__(self) -> None:
        self._files = FileService()
        self._standards = _load_standards()
        self._standards_map = {item["code"]: item for item in self._standards}

    def get_standards(self) -> list[PhotoStandard]:
        return [PhotoStandard.model_validate(item) for item in self._standards]

    def _get_standard(self, code: str) -> dict[str, Any]:
        item = self._standards_map.get(code)
        if item is None:
            raise AppError(code="STANDARD_NOT_FOUND", message="证件照规格不存在", status_code=404)
        return item

    def _to_file_result(self, stored, *, filename: str) -> FileResult:  # type: ignore[no-untyped-def]
        return FileResult(
            file_id=stored.file_id,
            filename=filename,
            size=stored.size,
            content_type=stored.content_type,
            download_url=self._files.build_download_url(file_id=stored.file_id, filename=filename),
            expires_in=settings.download_url_ttl_seconds,
        )

    async def _store_upload_session(self, session: UploadSession) -> None:
        async with _session_lock:
            _upload_sessions[session.upload_id] = session

    async def _store_processed_session(self, session: ProcessedSession) -> None:
        async with _session_lock:
            _processed_sessions[session.processed_id] = session

    async def _get_upload_session(self, upload_id: str) -> UploadSession:
        async with _session_lock:
            session = _upload_sessions.get(upload_id)
        if session is None:
            raise AppError(code="UPLOAD_NOT_FOUND", message="上传会话不存在或已过期", status_code=404)
        return session

    async def _get_processed_session(self, processed_id: str) -> ProcessedSession:
        async with _session_lock:
            session = _processed_sessions.get(processed_id)
        if session is None:
            raise AppError(code="PROCESS_NOT_FOUND", message="处理会话不存在或已过期", status_code=404)
        return session

    @staticmethod
    def _model_name_for_tier(model_tier: str) -> str:
        mapping = {
            "fast": "silueta",
            "balanced": "u2net_human_seg",
            "hq": "birefnet-portrait",
        }
        return mapping.get(model_tier, "silueta")

    @staticmethod
    def _build_upload_warnings(
        detection: dict[str, object],
        width: int,
        height: int,
    ) -> list[str]:
        warnings: list[str] = []
        engine = str(detection.get("engine", ""))
        faces = list(detection.get("faces", []))  # type: ignore[arg-type]
        face_count = len(faces)

        if engine == "fallback-center" or face_count == 0:
            warnings.append("未检测到人脸，请上传正面、光线充足的照片")
        elif "profile" in engine:
            warnings.append("检测到侧面人脸，证件照要求正面朝向镜头")
        elif face_count > 1:
            warnings.append(f"检测到 {face_count} 张人脸，证件照要求仅含一人")

        if width < 600 or height < 600:
            warnings.append(f"图片分辨率 {width}x{height} 偏低，建议至少 600x600 像素")

        if face_count == 1 and faces:
            face = faces[0] if isinstance(faces[0], dict) else {}
            conf = float(face.get("confidence", 1.0))
            if conf < 0.5:
                warnings.append("人脸检测置信度较低，可能影响后续处理效果")
            fw = int(face.get("w", 0))
            fh = int(face.get("h", 0))
            if height > 0 and fh > 0:
                ratio = fh / height
                if ratio < 0.15:
                    warnings.append("人脸在画面中占比过小，建议裁剪或靠近拍摄")
                elif ratio > 0.85:
                    warnings.append("人脸在画面中占比过大，建议拉远距离拍摄")

        return warnings

    async def upload_and_detect(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> PhotoUploadResponse:
        loop = asyncio.get_running_loop()
        try:
            detection = await loop.run_in_executor(None, partial(detect_faces, image_bytes))
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PHOTO_DETECT_FAILED", message="人脸检测失败，请确认上传的是有效图片", status_code=400) from exc

        stored = self._files.save_bytes(data=image_bytes, filename=filename, content_type=content_type)
        upload_id = uuid.uuid4().hex
        width = int(detection["width"])
        height = int(detection["height"])

        session = UploadSession(
            upload_id=upload_id,
            file_id=stored.file_id,
            filename=filename,
            width=width,
            height=height,
            faces=[dict(item) for item in detection["faces"]],  # type: ignore[index]
            detection_engine=str(detection["engine"]),
            created_at=time.time(),
        )
        await self._store_upload_session(session)

        warnings = self._build_upload_warnings(detection, width, height)

        return PhotoUploadResponse(
            upload_id=upload_id,
            filename=filename,
            width=session.width,
            height=session.height,
            faces=session.faces,  # type: ignore[arg-type]
            detection_engine=session.detection_engine,
            warnings=warnings,
        )

    async def process(
        self,
        *,
        upload_id: str,
        standard_code: str,
        background_color: str,
        model_tier: str,
    ) -> PhotoProcessResponse:
        upload = await self._get_upload_session(upload_id)
        standard = self._get_standard(standard_code)
        original = self._files.get(upload.file_id)
        image_bytes = original.path.read_bytes()
        face = select_primary_face(upload.faces)
        model_name = self._model_name_for_tier(model_tier)

        loop = asyncio.get_running_loop()
        try:
            cutout_png, bg_meta = await loop.run_in_executor(
                None,
                partial(remove_background, image_bytes, model_name=model_name),
            )
            processed_png, crop_meta = await loop.run_in_executor(
                None,
                partial(
                    crop_id_photo,
                    image_bytes,
                    standard=standard,
                    face=face,
                    cutout_png_bytes=cutout_png,
                    background_color=background_color,
                ),
            )
            compliance = await loop.run_in_executor(
                None,
                partial(
                    check_photo_compliance,
                    image_bytes,
                    faces=upload.faces,
                    cutout_png_bytes=cutout_png,
                    detection_engine=upload.detection_engine,
                ),
            )
            preview_png = await loop.run_in_executor(None, partial(_watermark_preview, processed_png))
        except AppError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PHOTO_PROCESS_FAILED", message="证件照处理失败", status_code=400) from exc

        out_name = f"{standard_code}-id-photo.png"
        stored = self._files.save_bytes(data=processed_png, filename=out_name, content_type="image/png")
        processed_id = uuid.uuid4().hex
        await self._store_processed_session(
            ProcessedSession(
                processed_id=processed_id,
                upload_id=upload_id,
                file_id=stored.file_id,
                standard_code=standard_code,
                background_color=background_color,
                model_used=str(bg_meta.get("model") or bg_meta.get("engine") or "fallback"),
                created_at=time.time(),
            )
        )

        preview_data_url = "data:image/png;base64," + base64.b64encode(preview_png).decode("ascii")
        crop_box = crop_meta["crop_box"]
        return PhotoProcessResponse(
            processed_id=processed_id,
            standard=PhotoStandard.model_validate(standard),
            background_color=background_color,
            model_used=str(bg_meta.get("model") or bg_meta.get("engine") or "fallback"),
            preview_data_url=preview_data_url,
            compliance=compliance,  # type: ignore[arg-type]
            crop_box=crop_box,  # type: ignore[arg-type]
            output_width=int(crop_meta["output_width"]),
            output_height=int(crop_meta["output_height"]),
        )

    async def export(self, *, processed_id: str, user_id: int, db: AsyncSession) -> FileResult:
        processed = await self._get_processed_session(processed_id)
        stored = self._files.get(processed.file_id)
        filename = f"{processed.standard_code}-id-photo.png"

        await CreditService(db).consume(
            user_id=user_id,
            amount=1,
            tx_type="photo_export",
            description=f"证件照导出（{processed.standard_code}）",
            reference_id=f"photo-export:{processed_id}",
        )
        return self._to_file_result(stored, filename=filename)

    async def layout(
        self,
        *,
        processed_id: str,
        user_id: int,
        db: AsyncSession,
        copies: int | None = None,
    ) -> FileResult:
        processed = await self._get_processed_session(processed_id)
        standard = self._get_standard(processed.standard_code)
        stored_photo = self._files.get(processed.file_id)
        photo_bytes = stored_photo.path.read_bytes()

        count = int(copies or standard.get("layout_default_copies", 8))
        if count < 1 or count > 20:
            raise AppError(code="INVALID_COPIES", message="copies 必须在 1-20 之间", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            layout_bytes, _meta = await loop.run_in_executor(
                None,
                partial(create_print_layout, photo_bytes, copies=count),
            )
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PHOTO_LAYOUT_FAILED", message="排版导出失败", status_code=400) from exc

        filename = f"{processed.standard_code}-layout-6x4.jpg"
        layout_stored = self._files.save_bytes(
            data=layout_bytes,
            filename=filename,
            content_type="image/jpeg",
        )

        await CreditService(db).consume(
            user_id=user_id,
            amount=1,
            tx_type="photo_layout",
            description=f"证件照排版导出（{processed.standard_code}）",
            reference_id=f"photo-layout:{processed_id}:{count}",
        )
        return self._to_file_result(layout_stored, filename=filename)
