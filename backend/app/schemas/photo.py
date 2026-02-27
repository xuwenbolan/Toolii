from __future__ import annotations

from pydantic import BaseModel, Field


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


class PhotoUploadResponse(BaseModel):
    upload_id: str
    filename: str
    width: int
    height: int
    faces: list[FaceBox]
    detection_engine: str


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


class PhotoProcessRequest(BaseModel):
    upload_id: str
    standard: str
    background_color: str = Field(default="#FFFFFF")
    model_tier: str = Field(default="fast")


class PhotoProcessResponse(BaseModel):
    processed_id: str
    standard: PhotoStandard
    background_color: str
    model_used: str
    preview_data_url: str
    compliance: ComplianceResult
    crop_box: CropBox
    output_width: int
    output_height: int


class PhotoExportRequest(BaseModel):
    processed_id: str


class PhotoLayoutRequest(BaseModel):
    processed_id: str
    copies: int | None = None
