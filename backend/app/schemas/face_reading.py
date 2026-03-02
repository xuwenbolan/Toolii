from __future__ import annotations

from pydantic import BaseModel


# --- Visualization schemas ---

class VisualizationThreeCourts(BaseModel):
    y_hairline: float
    y_brow: float
    y_nose_base: float
    y_chin: float


class VisualizationFiveEyes(BaseModel):
    y: float
    x_points: list[float]


class ExtendedVisualization(BaseModel):
    three_courts: VisualizationThreeCourts
    five_eyes: VisualizationFiveEyes
    center_x: float
    face_contour: list[list[float]]
    key_points: dict[str, list[float]]
    # Extended contour data
    eyebrow_contours: dict[str, list[list[float]]]
    nose_contour: list[list[float]]
    mouth_contour: list[list[float]]
    jaw_contour: list[list[float]]
    forehead: dict[str, list[float]]
    cheekbones: dict[str, list[float]]
    ipd_pixels: float


# --- Feature reading ---

class FeatureReadingSchema(BaseModel):
    label: str
    score: int
    description: str
    beauty_tip: str | None = None
    secondary_label: str | None = None
    secondary_confidence: float | None = None


# --- Aesthetics dimensions ---

class DimensionBasisItem(BaseModel):
    key: str
    value: str | int | float
    ideal: str | float | None = None


class AestheticsDimension(BaseModel):
    id: str
    label: str
    score: int       # 0-100 raw (radar chart geometry)
    percentile: int  # 0-100 (display: "exceeded X% of people")
    basis: list[DimensionBasisItem] = []  # raw measurements behind the score


# --- Fun indices ---

class FunIndex(BaseModel):
    id: str
    label: str
    percentile: int
    description: str


# --- Gene card ---

class GeneCard(BaseModel):
    description: str
    highlights: list[str]


# --- Photo angle ---

class PhotoAngleResult(BaseModel):
    best_side: str       # "left" | "right" | "center"
    vertical_angle: str  # "level" | "slight_up" | "slight_down"
    expression_tip: str
    rationale: str


# --- Hairstyle ---

class HairstyleRecommendation(BaseModel):
    style_id: str
    name: str
    rationale: str
    forehead_exposure: float  # 0.0-1.0


class HairstyleResult(BaseModel):
    recommended: list[HairstyleRecommendation]
    avoid: list[HairstyleRecommendation]


# --- Eyebrow ---

class EyebrowSuggestion(BaseModel):
    current_type: str
    current_description: str
    suggested_type: str
    suggested_description: str
    rationale: str
    adjustments: dict[str, str]


# --- Contouring ---

class ContouringZone(BaseModel):
    region_id: str
    zone_type: str   # "highlight" | "shadow" | "blush"
    tip: str


class ContouringResult(BaseModel):
    zones: list[ContouringZone]
    description: str


# --- Glasses ---

class GlassesRecommendation(BaseModel):
    frame_id: str
    name: str
    rationale: str


class GlassesResult(BaseModel):
    recommended: list[GlassesRecommendation]
    avoid: list[GlassesRecommendation]


# --- Insights ---

class InsightItem(BaseModel):
    type: str
    title: str
    brief: str
    detail: str


# --- Profile response (free tier) ---

class FaceProfileResponse(BaseModel):
    gene_card: GeneCard
    overall_score: int
    dimensions: list[AestheticsDimension]
    fun_indices: list[FunIndex]
    tags: list[str]
    features: dict[str, FeatureReadingSchema]
    summary: str
    photo_angle: PhotoAngleResult
    visualization: ExtendedVisualization | None = None
    disclaimer: str


# --- Full report response (paid tier) ---

class FullReportResponse(BaseModel):
    profile: FaceProfileResponse
    hairstyles: HairstyleResult
    eyebrows: EyebrowSuggestion
    contouring: ContouringResult
    glasses: GlassesResult
    insights: list[InsightItem]
    physiognomy_narrative: str
    physiognomy_sections: dict[str, str]
    llm_used: bool
