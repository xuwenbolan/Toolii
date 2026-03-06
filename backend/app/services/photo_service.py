from __future__ import annotations

import asyncio
import base64
import io
import json
import threading
import time
import uuid
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Any

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.compliance_checker import check_photo_compliance
from app.processing.face_detection import select_primary_face
from app.processing.photo_cropper import crop_id_photo
from app.processing.photo_layout import create_print_layout
from app.schemas.image import FileResult
from app.schemas.photo import ComplianceResult, CropBox, FaceBox, PhotoAdjust, PhotoPreviewResponse, PhotoStandard, PhotoUploadResponse, UploadWarning
from app.services.credit_service import CreditService
from app.services.file_service import FileService, StoredFile


@dataclass
class UploadSession:
    upload_id: str
    file_id: str
    filename: str
    width: int
    height: int
    faces: list[dict[str, Any]]
    detection_engine: str
    cutout_file_id: str
    bg_removal_model: str
    compliance: dict[str, Any]
    warnings: list[UploadWarning]
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
_session_lock = threading.Lock()

# Sessions older than this (seconds) will be purged by the scheduler.
_SESSION_TTL = 2 * 3600  # 2 hours


def cleanup_expired_sessions() -> int:
    """Remove photo sessions that have exceeded their TTL. Returns count removed."""
    cutoff = time.time() - _SESSION_TTL
    removed = 0
    with _session_lock:
        for store in (_upload_sessions, _processed_sessions):
            expired = [k for k, v in store.items() if v.created_at < cutoff]
            for k in expired:
                del store[k]
                removed += 1
    return removed


def _standards_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "photo_standards.json"


def _load_standards() -> list[dict[str, Any]]:
    data = json.loads(_standards_path().read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("photo_standards.json must be a list")
    return [dict(item) for item in data]


def _watermark_preview(photo_png_bytes: bytes, *, text: str = "TOOLII PREVIEW") -> bytes:
    from app.processing.watermark import apply_watermark
    return apply_watermark(photo_png_bytes, "image/png", text=text)


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
            raise AppError(code="STANDARD_NOT_FOUND", message="Photo standard not found", status_code=404)
        return item

    def _to_file_result(self, stored: StoredFile, *, filename: str) -> FileResult:
        return FileResult(
            file_id=stored.file_id,
            filename=filename,
            size=stored.size,
            content_type=stored.content_type,
            download_url=self._files.build_download_url(file_id=stored.file_id, filename=filename),
            expires_in=settings.file_retention_hours * 3600,
        )

    async def _store_upload_session(self, session: UploadSession) -> None:
        with _session_lock:
            _upload_sessions[session.upload_id] = session

    async def _store_processed_session(self, session: ProcessedSession) -> None:
        with _session_lock:
            _processed_sessions[session.processed_id] = session

    async def _get_upload_session(self, upload_id: str) -> UploadSession:
        with _session_lock:
            session = _upload_sessions.get(upload_id)
        if session is None:
            raise AppError(code="UPLOAD_NOT_FOUND", message="Upload session not found or expired", status_code=404)
        return session

    async def _get_processed_session(self, processed_id: str) -> ProcessedSession:
        with _session_lock:
            session = _processed_sessions.get(processed_id)
        if session is None:
            raise AppError(code="PROCESS_NOT_FOUND", message="Processing session not found or expired", status_code=404)
        return session

    @staticmethod
    def _build_upload_warnings(
        detection: dict[str, Any],
        width: int,
        height: int,
    ) -> list[UploadWarning]:
        warnings: list[UploadWarning] = []
        engine = str(detection.get("engine", ""))
        faces = list(detection.get("faces", []))
        face_count = len(faces)

        if engine == "fallback-center" or face_count == 0:
            warnings.append(UploadWarning(id="no_face"))
        elif "profile" in engine:
            warnings.append(UploadWarning(id="side_face"))
        elif face_count > 1:
            warnings.append(UploadWarning(id="multiple_faces", params={"count": face_count}))

        if width < 600 or height < 600:
            warnings.append(UploadWarning(id="low_resolution", params={"width": width, "height": height}))

        if face_count == 1 and faces:
            face = faces[0] if isinstance(faces[0], dict) else {}
            conf = float(face.get("confidence", 1.0))
            if conf < 0.5:
                warnings.append(UploadWarning(id="low_confidence"))
            fh = int(face.get("h", 0))
            if height > 0 and fh > 0:
                ratio = fh / height
                if ratio < 0.15:
                    warnings.append(UploadWarning(id="face_too_small"))
                elif ratio > 0.85:
                    warnings.append(UploadWarning(id="face_too_large"))

        return warnings

    async def upload_and_prepare(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        content_type: str,
    ) -> PhotoUploadResponse:
        """Phase 1 (heavy): face detection + background removal + compliance check."""
        from app.processing.face_detection import detect_faces as local_detect_faces
        from app.services.cortex_client import remove_background as cortex_remove_bg

        # Face detection (always local MediaPipe)
        loop = asyncio.get_running_loop()
        try:
            detection = await loop.run_in_executor(
                None, partial(local_detect_faces, image_bytes),
            )
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="PHOTO_DETECT_FAILED", message="Face detection failed, please upload a valid image", status_code=400) from exc

        width = int(detection["width"])
        height = int(detection["height"])
        faces = [dict(item) for item in detection["faces"]]
        engine = str(detection["engine"])
        warnings = self._build_upload_warnings(detection, width, height)

        # Background removal (Cortex GPU with local fallback)
        try:
            bg_result = await cortex_remove_bg(image_bytes, model="portrait")
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="PHOTO_BG_REMOVE_FAILED", message="Background removal failed", status_code=400) from exc

        cutout_png = base64.b64decode(bg_result["image_b64"])
        bg_meta = bg_result.get("meta", {})

        # Compliance check (pure CPU heuristics, run in executor)
        try:
            compliance = await loop.run_in_executor(
                None,
                partial(
                    check_photo_compliance,
                    image_bytes,
                    faces=faces,
                    cutout_png_bytes=cutout_png,
                    detection_engine=engine,
                ),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PHOTO_COMPLIANCE_FAILED", message="Compliance check failed", status_code=400) from exc

        # Save original image and cutout PNG to disk
        stored_original = self._files.save_bytes(data=image_bytes, filename=filename, content_type=content_type)
        stored_cutout = self._files.save_bytes(data=cutout_png, filename=f"cutout-{filename}.png", content_type="image/png")

        upload_id = uuid.uuid4().hex
        model_used = str(bg_meta.get("model") or bg_meta.get("engine") or "fallback")

        session = UploadSession(
            upload_id=upload_id,
            file_id=stored_original.file_id,
            filename=filename,
            width=width,
            height=height,
            faces=faces,
            detection_engine=engine,
            cutout_file_id=stored_cutout.file_id,
            bg_removal_model=model_used,
            compliance=compliance,
            warnings=warnings,
            created_at=time.time(),
        )
        await self._store_upload_session(session)

        return PhotoUploadResponse(
            upload_id=upload_id,
            filename=filename,
            width=width,
            height=height,
            faces=[FaceBox.model_validate(f) for f in faces],
            detection_engine=engine,
            warnings=warnings,
            compliance=ComplianceResult.model_validate(compliance),
        )

    async def preview(
        self,
        *,
        upload_id: str,
        standard_code: str,
        background_color: str,
        adjust: dict[str, float] | None = None,
    ) -> PhotoPreviewResponse:
        """Phase 2 (light): crop + composite + watermark using cached cutout PNG."""
        upload = await self._get_upload_session(upload_id)
        standard = self._get_standard(standard_code)

        original = self._files.get(upload.file_id)
        image_bytes = original.path.read_bytes()
        cutout_stored = self._files.get(upload.cutout_file_id)
        cutout_png = cutout_stored.path.read_bytes()
        face = select_primary_face(upload.faces)

        loop = asyncio.get_running_loop()
        try:
            processed_png, crop_meta = await loop.run_in_executor(
                None,
                partial(
                    crop_id_photo,
                    image_bytes,
                    standard=standard,
                    face=face,
                    cutout_png_bytes=cutout_png,
                    background_color=background_color,
                    adjust=adjust,
                ),
            )
            preview_png = await loop.run_in_executor(None, partial(_watermark_preview, processed_png))
        except AppError:
            raise
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PHOTO_PREVIEW_FAILED", message="ID photo preview generation failed", status_code=400) from exc

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
                model_used=upload.bg_removal_model,
                created_at=time.time(),
            )
        )

        preview_data_url = "data:image/png;base64," + base64.b64encode(preview_png).decode("ascii")
        crop_box = crop_meta["crop_box"]
        return PhotoPreviewResponse(
            processed_id=processed_id,
            standard=PhotoStandard.model_validate(standard),
            background_color=background_color,
            preview_data_url=preview_data_url,
            compliance=ComplianceResult.model_validate(upload.compliance),
            crop_box=CropBox.model_validate(crop_box),
            applied_adjust=PhotoAdjust.model_validate(crop_meta.get("applied_adjust") or {}),
            output_width=int(crop_meta["output_width"]),
            output_height=int(crop_meta["output_height"]),
        )

    async def export(self, *, processed_id: str, user_id: int, db: AsyncSession) -> FileResult:
        processed = await self._get_processed_session(processed_id)
        stored = self._files.get(processed.file_id)
        filename = f"{processed.standard_code}-id-photo.png"

        ref_id = f"photo:{processed_id}"
        credit_svc = CreditService(db)
        if not await credit_svc.has_transaction(user_id=user_id, reference_id=ref_id):
            await credit_svc.consume(
                user_id=user_id,
                amount=1,
                tx_type="photo_export",
                description=f"ID photo ({processed.standard_code})",
                reference_id=ref_id,
            )
        return self._to_file_result(stored, filename=filename)

    async def layout(
        self,
        *,
        processed_id: str,
        copies: int | None = None,
        user_id: int,
        db: AsyncSession,
    ) -> FileResult:
        processed = await self._get_processed_session(processed_id)
        standard = self._get_standard(processed.standard_code)

        # Charge 1 credit if not already paid for this processed_id
        ref_id = f"photo:{processed_id}"
        credit_svc = CreditService(db)
        if not await credit_svc.has_transaction(user_id=user_id, reference_id=ref_id):
            await credit_svc.consume(
                user_id=user_id,
                amount=1,
                tx_type="photo_layout",
                description=f"ID photo ({processed.standard_code})",
                reference_id=ref_id,
            )
        stored_photo = self._files.get(processed.file_id)
        photo_bytes = stored_photo.path.read_bytes()

        count = int(copies or standard.get("layout_default_copies", 8))
        if count < 1 or count > 20:
            raise AppError(code="INVALID_COPIES", message="copies must be between 1 and 20", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            layout_bytes, _meta = await loop.run_in_executor(
                None,
                partial(create_print_layout, photo_bytes, copies=count),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PHOTO_LAYOUT_FAILED", message="Print layout export failed", status_code=400) from exc

        filename = f"{processed.standard_code}-layout-6x4.jpg"
        layout_stored = self._files.save_bytes(
            data=layout_bytes,
            filename=filename,
            content_type="image/jpeg",
        )

        return self._to_file_result(layout_stored, filename=filename)
