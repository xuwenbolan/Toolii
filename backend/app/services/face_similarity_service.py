"""Face similarity comparison service -- orchestrates detection and comparison."""

from __future__ import annotations

import asyncio
import logging
from functools import partial
from typing import Any

from app.core.exceptions import AppError
from app.processing.face_compliance import validate_face_compliance
from app.processing.face_detection import (
    LANDMARKER_UNAVAILABLE,
    _decode_image,
    detect_face_landmarks,
)
from app.processing.face_similarity import compare_faces

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fun title / description generation
# ---------------------------------------------------------------------------

_TITLE_TIERS_ZH = [
    (90, "DNA 验证通过！亲生的没跑了！"),
    (75, "高度疑似亲属关系！"),
    (60, "有点像... 隔壁老王？"),
    (40, "大概... 是远房亲戚？"),
    (20, "确定不是路人甲？"),
    (0, "完全不搭边，认贼做父实锤！"),
]

_TITLE_TIERS_EN = [
    (90, "DNA confirmed! Definitely related!"),
    (75, "Highly suspicious resemblance!"),
    (60, "Kinda similar... the mailman?"),
    (40, "Maybe... distant cousins?"),
    (20, "Are you sure you're related?"),
    (0, "Not even close!"),
]

_REGION_NAMES_ZH = {
    "eyes": "眼睛",
    "nose": "鼻子",
    "mouth": "嘴巴",
    "jawline": "脸型轮廓",
    "overall_face": "整体面部",
}

_REGION_NAMES_EN = {
    "eyes": "Eyes",
    "nose": "Nose",
    "mouth": "Mouth",
    "jawline": "Jawline",
    "overall_face": "Overall Face",
}

# Geometric ratio descriptions (ratio_key -> (zh, en))
_RATIO_DESCRIPTIONS: dict[str, dict[str, tuple[str, str]]] = {
    "eyes": {
        "eye_distance_ratio": (
            "你们的眼距比例非常接近！",
            "Your eye spacing ratios are very close!",
        ),
    },
    "nose": {
        "nose_length_ratio": (
            "鼻子的长度比例很相似。",
            "Your nose length proportions are quite similar.",
        ),
    },
    "mouth": {
        "mouth_width_ratio": (
            "嘴巴宽度占脸宽的比例几乎一样。",
            "Your mouth-to-face width ratios are nearly identical.",
        ),
    },
    "jawline": {
        "face_aspect_ratio": (
            "脸型的长宽比非常相似！",
            "Your face aspect ratios are very similar!",
        ),
    },
}

_RATIO_MATCH_THRESHOLD = 0.03  # consider ratios "matching" if diff < 3%


def _get_title(score: int, locale: str) -> str:
    tiers = _TITLE_TIERS_ZH if locale.startswith("zh") else _TITLE_TIERS_EN
    for threshold, title in tiers:
        if score >= threshold:
            return title
    return tiers[-1][1]


def _get_summary(score: int, locale: str) -> str:
    if locale.startswith("zh"):
        return f"两张脸的综合相似度为 {score}%。"
    return f"Overall facial similarity is {score}%."


def _get_disclaimer(locale: str) -> str:
    if locale.startswith("zh"):
        return "本工具仅供娱乐，不具备真实亲缘鉴定能力。"
    return "This tool is for entertainment only and has no real genetic testing capability."


def _generate_region_description(
    region: str,
    score: int,
    ratios1: dict[str, float],
    ratios2: dict[str, float],
    locale: str,
) -> str | None:
    """Generate fun description for a region based on score and geometric ratios."""
    parts: list[str] = []

    # Check geometric ratio matches
    ratio_descs = _RATIO_DESCRIPTIONS.get(region, {})
    for ratio_key, (zh_desc, en_desc) in ratio_descs.items():
        v1 = ratios1.get(ratio_key)
        v2 = ratios2.get(ratio_key)
        if v1 is not None and v2 is not None and abs(v1 - v2) < _RATIO_MATCH_THRESHOLD:
            parts.append(zh_desc if locale.startswith("zh") else en_desc)

    # Score-based description
    is_zh = locale.startswith("zh")
    region_name = _REGION_NAMES_ZH.get(region, region) if is_zh else _REGION_NAMES_EN.get(region, region)
    if score >= 80:
        if is_zh:
            parts.append(f"{region_name}的相似度非常高！")
        else:
            parts.append(f"{region_name} similarity is very high!")
    elif score >= 60:
        if is_zh:
            parts.append(f"{region_name}有一定的相似性。")
        else:
            parts.append(f"{region_name} show some resemblance.")
    elif score < 30:
        if is_zh:
            parts.append(f"{region_name}差异较大。")
        else:
            parts.append(f"{region_name} are quite different.")

    return " ".join(parts) if parts else None


# ---------------------------------------------------------------------------
# Core comparison logic (sync, runs in executor)
# ---------------------------------------------------------------------------

def _detect_one(image_bytes: bytes, label: str) -> tuple[list, list, int, int, int]:
    """Detect face landmarks for one image, raise descriptive errors."""
    result = detect_face_landmarks(image_bytes)
    if result == LANDMARKER_UNAVAILABLE:
        raise AppError(
            code="MODEL_UNAVAILABLE",
            message="Face analysis model is temporarily unavailable.",
            status_code=503,
        )
    if result is None:
        code = "NO_FACE_IN_IMAGE1" if label == "1" else "NO_FACE_IN_IMAGE2"
        if label == "1":
            msg = "No face detected in the first image."
        else:
            msg = "No face detected in the second image."
        raise AppError(code=code, message=msg, status_code=422)

    return result  # type: ignore[return-value]


def _compare_sync(
    image1_bytes: bytes,
    image2_bytes: bytes,
    locale: str,
) -> dict[str, Any]:
    """Full comparison pipeline (CPU-bound)."""
    # Detect faces
    lm1, bs1, w1, h1, fc1 = _detect_one(image1_bytes, "1")
    lm2, bs2, w2, h2, fc2 = _detect_one(image2_bytes, "2")

    # Relaxed compliance
    validate_face_compliance(
        landmarks=lm1, blendshapes=bs1, width=w1, height=h1,
        face_count=fc1, image_bytes=image1_bytes, strict=False,
    )
    validate_face_compliance(
        landmarks=lm2, blendshapes=bs2, width=w2, height=h2,
        face_count=fc2, image_bytes=image2_bytes, strict=False,
    )

    # Decode images
    img1 = _decode_image(image1_bytes)
    img2 = _decode_image(image2_bytes)

    # Compare
    try:
        raw = compare_faces(img1, img2, lm1, lm2, w1, h1, w2, h2)
    except RuntimeError as e:
        if "unavailable" in str(e).lower():
            raise AppError(
                code="MODEL_UNAVAILABLE",
                message="Face similarity model is temporarily unavailable.",
                status_code=503,
            )
        raise

    # Build response
    overall_score = raw["overall_score"]
    ratios1 = raw.get("ratios1", {})
    ratios2 = raw.get("ratios2", {})

    region_order = ["eyes", "nose", "mouth", "jawline", "overall_face"]
    regions = []
    for name in region_order:
        region_data = raw["regions"].get(name, {})
        score = region_data.get("score", 0)
        desc = _generate_region_description(name, score, ratios1, ratios2, locale)
        regions.append({
            "region": name,
            "score": score,
            "description": desc,
        })

    return {
        "regions": regions,
        "overall_score": overall_score,
        "title": _get_title(overall_score, locale),
        "summary": _get_summary(overall_score, locale),
        "disclaimer": _get_disclaimer(locale),
    }


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

class FaceSimilarityService:
    async def compare(
        self,
        *,
        image1_bytes: bytes,
        image2_bytes: bytes,
        locale: str = "zh-CN",
    ) -> dict[str, Any]:
        """Compare two face images and return similarity results."""
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            partial(_compare_sync, image1_bytes, image2_bytes, locale),
        )
