"""Response schemas for face similarity comparison."""

from __future__ import annotations

from pydantic import BaseModel


class RegionScore(BaseModel):
    region: str
    score: int
    description: str | None = None
    rank: int | None = None
    badge: str | None = None  # "best_match" | "least_match"


class FaceSimilarityResponse(BaseModel):
    regions: list[RegionScore]
    overall_score: int
    title: str
    summary: str
    disclaimer: str
    narrative: str | None = None
    fun_facts: list[str] | None = None
    best_region: str | None = None
    worst_region: str | None = None
