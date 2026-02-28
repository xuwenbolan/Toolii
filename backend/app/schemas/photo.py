from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator


class FaceBox(BaseModel):
    x: int
    y: int
    w: int
    h: int
    confidence: float | None = None


class PhotoStandard(BaseModel):
    code: str
    name: str
    country: str
    width_mm: float
    height_mm: float
    dpi: int = 300
    face_height_ratio: float = 0.68
    top_margin_ratio: float = 0.12
    layout_default_copies: int = 8


class UploadWarning(BaseModel):
    id: str
    params: dict[str, str | int | float] = {}


class PhotoUploadResponse(BaseModel):
    upload_id: str
    filename: str
    width: int
    height: int
    faces: list[FaceBox]
    detection_engine: str
    warnings: list[UploadWarning] = []
    compliance: ComplianceResult


class ComplianceCheckItem(BaseModel):
    id: str
    label: str
    passed: bool
    severity: str
    message: str


class ComplianceResult(BaseModel):
    passed: bool
    score: int
    checks: list[ComplianceCheckItem]


class CropBox(BaseModel):
    x: int
    y: int
    w: int
    h: int


class PhotoAdjust(BaseModel):
    offset_x: float = Field(default=0.0, ge=-0.45, le=0.45)
    offset_y: float = Field(default=0.0, ge=-0.45, le=0.45)
    scale: float = Field(default=1.0, ge=0.75, le=2.4)


_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


class PhotoPreviewRequest(BaseModel):
    upload_id: str
    standard: str
    background_color: str = Field(default="#FFFFFF")
    adjust: PhotoAdjust | None = None

    @field_validator("background_color")
    @classmethod
    def _validate_color(cls, v: str) -> str:
        if not _HEX_COLOR_RE.match(v):
            raise ValueError("background_color must be a hex color like #RRGGBB")
        return v.upper()


class PhotoPreviewResponse(BaseModel):
    processed_id: str
    standard: PhotoStandard
    background_color: str
    preview_data_url: str
    compliance: ComplianceResult
    crop_box: CropBox
    applied_adjust: PhotoAdjust
    output_width: int
    output_height: int


class PhotoExportRequest(BaseModel):
    processed_id: str


class PhotoLayoutRequest(BaseModel):
    processed_id: str
    copies: int | None = None
