"""FaceMap analysis service -- orchestrates detection, feature extraction, and recommendations."""

from __future__ import annotations

import asyncio
import logging
import re
from functools import partial
from typing import Any

from app.core.exceptions import AppError
from app.processing.face_compliance import validate_face_compliance
from app.processing.face_detection import LANDMARKER_UNAVAILABLE, detect_face_landmarks
from app.processing.face_physiognomy import extract_features
from app.processing.physiognomy_rules import (
    build_llm_prompt,
    generate_detailed_fallback,
    generate_profile,
)
from app.processing.aesthetics_rules import (
    compute_aesthetics_dimensions,
    compute_fun_indices,
    generate_all_insights,
    generate_gene_card,
    recommend_contouring,
    recommend_eyebrows,
    recommend_glasses,
    recommend_hairstyles,
    recommend_photo_angle,
)
from app.services import llm_client

logger = logging.getLogger(__name__)

# Map numbered LLM sections to named keys
_SECTION_KEY_MAP = {
    "1": "three_courts",
    "2": "five_eyes",
    "3": "eyes",
    "4": "nose",
    "5": "mouth",
    "6": "eyebrows",
    "7": "forehead_jawline_mountains",
    "8": "overall",
}


def _detect_and_extract(image_bytes: bytes) -> dict[str, Any]:
    """Run face detection + feature extraction (CPU-bound, runs in executor)."""
    result = detect_face_landmarks(image_bytes)
    if result == LANDMARKER_UNAVAILABLE:
        raise AppError(
            code="MODEL_UNAVAILABLE",
            message="Face analysis model is temporarily unavailable.",
            status_code=503,
        )
    if result is None:
        raise AppError(
            code="NO_FACE_DETECTED",
            message="No face detected in the image.",
            status_code=422,
        )

    landmarks, blendshapes, width, height, face_count = result

    validate_face_compliance(
        landmarks=landmarks,
        blendshapes=blendshapes,
        width=width,
        height=height,
        face_count=face_count,
        image_bytes=image_bytes,
    )

    features = extract_features(landmarks, width, height, blendshapes=blendshapes)
    return features


def _build_profile_data(features: dict[str, Any], locale: str) -> dict[str, Any]:
    """Build full profile response data (CPU-bound helper)."""
    # Rules-based profile (features, tags, summary, disclaimer)
    profile = generate_profile(features, locale)

    # 6-dim aesthetics scoring
    dimensions, overall_score = compute_aesthetics_dimensions(features, locale)

    # Gene card
    gene_card = generate_gene_card(features, dimensions, locale)

    # Fun indices
    fun_indices = compute_fun_indices(features, dimensions, locale)

    # Photo angle (free tier insight)
    photo_angle = recommend_photo_angle(features, locale)

    return {
        "gene_card": gene_card,
        "overall_score": overall_score,
        "dimensions": dimensions,
        "fun_indices": fun_indices,
        "tags": profile["tags"],
        "features": profile["features"],
        "summary": profile["summary"],
        "photo_angle": photo_angle,
        "visualization": features.get("visualization"),
        "disclaimer": profile["disclaimer"],
    }


def _build_recommendations(features: dict[str, Any], dimensions: list, locale: str) -> dict[str, Any]:
    """Build all paid-tier recommendations (CPU-bound helper)."""
    return {
        "hairstyles": recommend_hairstyles(features, locale),
        "eyebrows": recommend_eyebrows(features, locale),
        "contouring": recommend_contouring(features, locale),
        "glasses": recommend_glasses(features, locale),
        "insights": generate_all_insights(features, dimensions, locale),
    }


class FaceMapService:

    async def analyze_profile(
        self,
        *,
        image_bytes: bytes,
        locale: str = "zh-CN",
    ) -> dict[str, Any]:
        """Free tier: face detection + feature extraction + profile."""
        loop = asyncio.get_running_loop()
        features = await loop.run_in_executor(
            None, partial(_detect_and_extract, image_bytes),
        )
        profile_data = await loop.run_in_executor(
            None, partial(_build_profile_data, features, locale),
        )
        return profile_data

    async def analyze_report(
        self,
        *,
        image_bytes: bytes,
        locale: str = "zh-CN",
    ) -> dict[str, Any]:
        """Paid tier: full report with recommendations + physiognomy.

        Credit charging is handled by ToolGatewayRoute.
        """
        loop = asyncio.get_running_loop()

        # Detect + extract features
        features = await loop.run_in_executor(
            None, partial(_detect_and_extract, image_bytes),
        )

        # Build profile data
        profile_data = await loop.run_in_executor(
            None, partial(_build_profile_data, features, locale),
        )

        # Run recommendations + LLM physiognomy in parallel
        recommendations_task = loop.run_in_executor(
            None,
            partial(_build_recommendations, features, profile_data["dimensions"], locale),
        )

        physiognomy_task = self._generate_physiognomy(features, locale)

        recommendations, physiognomy = await asyncio.gather(
            recommendations_task, physiognomy_task,
        )

        return {
            "profile": profile_data,
            **recommendations,
            "physiognomy_narrative": physiognomy["narrative"],
            "physiognomy_sections": physiognomy["sections"],
            "llm_used": physiognomy["llm_used"],
        }

    async def _generate_physiognomy(
        self,
        features: dict[str, Any],
        locale: str,
    ) -> dict[str, Any]:
        """Generate physiognomy narrative via LLM with template fallback."""
        system_prompt, user_prompt = build_llm_prompt(features, locale)
        llm_text = await llm_client.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

        if llm_text:
            sections = _parse_llm_sections(llm_text)
            filled = sum(1 for k in ("1", "2", "3", "4", "5", "6", "7", "8") if sections.get(k, "").strip())

            if filled >= 4:
                # Fill missing sections from template fallback
                fallback = generate_detailed_fallback(features, locale)
                _SECTION_FALLBACKS = {
                    "1": fallback.get("three_courts", ""),
                    "2": fallback.get("five_eyes", ""),
                }
                for fa_key, sec_key in [("eyes", "3"), ("nose", "4"), ("mouth", "5"),
                                        ("eyebrows", "6"), ("forehead", "7")]:
                    _SECTION_FALLBACKS[sec_key] = fallback.get("feature_analyses", {}).get(fa_key, "")
                _SECTION_FALLBACKS["8"] = ""

                for k in ("1", "2", "3", "4", "5", "6", "7", "8"):
                    if not sections.get(k, "").strip():
                        sections[k] = _SECTION_FALLBACKS.get(k, "")

                # Map numbered keys to named keys
                named_sections = {}
                for num_key, named_key in _SECTION_KEY_MAP.items():
                    named_sections[named_key] = sections.get(num_key, "")

                return {
                    "narrative": llm_text,
                    "sections": named_sections,
                    "llm_used": True,
                }

            logger.warning("LLM output only had %d/8 parseable sections, falling back", filled)

        # Template fallback
        logger.info("Using template fallback for physiognomy narrative")
        fallback = generate_detailed_fallback(features, locale)
        named_sections = {
            "three_courts": fallback.get("three_courts", ""),
            "five_eyes": fallback.get("five_eyes", ""),
        }
        for fa_key in ("eyes", "nose", "mouth", "eyebrows"):
            named_sections[fa_key] = fallback.get("feature_analyses", {}).get(fa_key, "")
        named_sections["forehead_jawline_mountains"] = " ".join(
            part for part in [
                fallback.get("feature_analyses", {}).get("forehead", ""),
                fallback.get("feature_analyses", {}).get("jawline", ""),
                fallback.get("five_mountains", ""),
            ] if part.strip()
        )
        named_sections["overall"] = ""

        return {
            "narrative": fallback.get("narrative", ""),
            "sections": named_sections,
            "llm_used": False,
        }


_SECTION_RE = re.compile(
    r"^"
    r"(?:\*{1,2})?"
    r"(?:#+ )?"
    r"(?:\u7b2c)?"           # optional Chinese prefix
    r"(\d+)"
    r"(?:\u90e8\u5206)?"     # optional Chinese suffix
    r"\s*"
    r"(?:\*{1,2})?"
    r"[.\u3001\uff1a:)\]\-]\s*"
    r"(.*)",
)


def _parse_llm_sections(text: str) -> dict[str, str]:
    """Parse numbered sections from LLM output."""
    sections: dict[str, str] = {}
    current_key = ""
    current_lines: list[str] = []

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            if current_key:
                current_lines.append("")
            continue

        clean = re.sub(r"^\*{1,2}|\*{1,2}$", "", stripped).strip()
        clean = re.sub(r"^#{1,4}\s*", "", clean).strip()

        m = _SECTION_RE.match(clean)
        if m:
            if current_key:
                sections[current_key] = "\n".join(current_lines).strip()
            current_key = m.group(1)
            current_lines = [m.group(2)]
            continue
        if current_key:
            current_lines.append(stripped)

    if current_key:
        sections[current_key] = "\n".join(current_lines).strip()

    return sections
