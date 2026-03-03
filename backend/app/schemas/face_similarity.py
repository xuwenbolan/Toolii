"""Response schemas for face similarity comparison."""

from __future__ import annotations

from pydantic import BaseModel


class RegionScore(BaseModel):
    region: str
    score: int
    description: str | None = None


class FaceSimilarityResponse(BaseModel):
    regions: list[RegionScore]
    overall_score: int
    title: str
    summary: str
    disclaimer: str
