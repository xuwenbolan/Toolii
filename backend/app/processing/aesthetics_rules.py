"""Aesthetics recommendation engine for FaceMap.

Pure computation module -- no I/O, no network, no database.
All functions accept the `features` dict produced by extract_features().
"""

from __future__ import annotations

import math
from typing import Any

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_AVG_IPD_MM = 63.0  # Average inter-pupillary distance (mm)

# Per-dimension percentile distribution parameters (mean, std).
# Derived via Monte-Carlo simulation of each scoring formula with
# anthropometric input distributions (see `calibrate_percentile_params()`).
# Recalibrate when scoring formulas change or when real user data is available.
_PERCENTILE_PARAMS: dict[str, tuple[float, float]] = {
    "proportion_harmony":    (78.0, 10.0),
    "symmetry":              (78.0, 9.0),
    "feature_refinement":    (50.0, 10.0),
    "contour_definition":    (65.0, 16.0),
    "facial_dimensionality": (60.0, 12.0),
    "feature_harmony":       (70.0, 12.0),
    # Fun indices
    "age_defying":           (55.0, 16.0),
    "distinctiveness":       (30.0, 10.0),
    "photogenic":            (75.0, 10.0),
    "approachability":       (58.0, 12.0),
}


def _proximity(value: float, ideal: float, sigma: float) -> float:
    """Gaussian proximity: 1.0 when value==ideal, falls off with sigma."""
    return math.exp(-0.5 * ((value - ideal) / sigma) ** 2)


def _percentile(raw: float, mean: float = 55.0, std: float = 15.0) -> int:
    """Convert raw 0-100 score to percentile via normal CDF approximation."""
    z = (raw - mean) / std if std > 0 else 0.0
    # Abramowitz & Stegun approximation for normal CDF
    t = 1.0 / (1.0 + 0.2316419 * abs(z))
    d = 0.3989422804014327  # 1/sqrt(2*pi)
    p = d * math.exp(-z * z / 2.0) * (
        t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
    )
    cdf = 1.0 - p if z > 0 else p
    return max(1, min(99, int(cdf * 100)))


def _dim_percentile(raw: float, dim_id: str) -> int:
    """Percentile using per-dimension calibrated parameters."""
    mean, std = _PERCENTILE_PARAMS.get(dim_id, (55.0, 15.0))
    return _percentile(raw, mean, std)


def _px_to_mm(px: float, ipd_pixels: float) -> float:
    """Convert pixel measurement to millimeters using IPD reference."""
    if ipd_pixels <= 0:
        return 0.0
    return round(px * _AVG_IPD_MM / ipd_pixels, 1)


def _get_raw(features: dict, key: str, default: float = 0.0) -> float:
    return features.get("raw_ratios", {}).get(key, default)


# ---------------------------------------------------------------------------
# Bilingual labels
# ---------------------------------------------------------------------------

_DIM_LABELS = {
    "proportion_harmony": {"zh-CN": "比例和谐", "en": "Proportional Harmony"},
    "symmetry": {"zh-CN": "对称性", "en": "Symmetry"},
    "feature_refinement": {"zh-CN": "特征精致度", "en": "Feature Refinement"},
    "contour_definition": {"zh-CN": "轮廓清晰度", "en": "Contour Definition"},
    "facial_dimensionality": {"zh-CN": "面部立体感", "en": "Facial Dimensionality"},
    "feature_harmony": {"zh-CN": "五官协调性", "en": "Feature Harmony"},
}

_FUN_INDEX_LABELS = {
    "age_defying": {"zh-CN": "冻龄指数", "en": "Age-Defying Index"},
    "distinctiveness": {"zh-CN": "辨识度指数", "en": "Distinctiveness Index"},
    "photogenic": {"zh-CN": "上镜指数", "en": "Photogenic Index"},
    "approachability": {"zh-CN": "亲和力指数", "en": "Approachability Index"},
}

_FUN_INDEX_DESC = {
    "age_defying": {
        "zh-CN": "你的面部轮廓饱满有弹性，冻龄指数超过了{pct}%的同龄人",
        "en": "Your facial contours have a youthful fullness, ranking above {pct}% of peers",
    },
    "distinctiveness": {
        "zh-CN": "你的五官有鲜明的个人特色，辨识度超过了{pct}%的人",
        "en": "Your features have distinctive character, ranking above {pct}% of people",
    },
    "photogenic": {
        "zh-CN": "你的面部比例和对称性非常适合镜头，上镜指数超过了{pct}%的人",
        "en": "Your proportions and symmetry are camera-friendly, ranking above {pct}% of people",
    },
    "approachability": {
        "zh-CN": "你的面部特征让人感到亲切自然，亲和力超过了{pct}%的人",
        "en": "Your features convey warmth and openness, ranking above {pct}% of people",
    },
}


# ---------------------------------------------------------------------------
# 1. Aesthetics dimensions (6-dim scoring)
# ---------------------------------------------------------------------------

def compute_aesthetics_dimensions(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> tuple[list[dict[str, Any]], int]:
    """Compute 6 aesthetics dimensions with raw score + percentile.

    Returns:
        (dimensions_list, overall_score)
    """
    raw = features.get("raw_ratios", {})

    # -- Proportion Harmony --
    courts = features.get("three_courts", {})
    court_dev = max(
        abs(courts.get("upper", 0.333) - 0.333),
        abs(courts.get("middle", 0.333) - 0.333),
        abs(courts.get("lower", 0.333) - 0.333),
    )
    court_s = max(0, 100 - court_dev * 350)
    five_ratio = features.get("five_eyes", {}).get("ratio", 5.0)
    eyes_s = max(0, 100 - abs(five_ratio - 5.0) * 35)
    whr = raw.get("face_width_height_ratio", 0.76)
    whr_s = max(0, 100 - abs(whr - 0.76) * 180)
    proportion_raw = int(court_s * 0.4 + eyes_s * 0.35 + whr_s * 0.25)

    # -- Symmetry --
    symmetry_raw = int(features.get("symmetry", {}).get("overall_score", 75))

    # -- Feature Refinement --
    total_conf = 0.0
    conf_count = 0
    for key in ("face_shape", "eyes", "nose", "mouth", "eyebrows", "forehead", "jawline"):
        conf = features.get(key, {}).get("confidence", 0.5)
        total_conf += conf
        conf_count += 1
    refinement_raw = int((total_conf / conf_count) * 100) if conf_count > 0 else 50

    # -- Contour Definition --
    jaw_sharpness = raw.get("jaw_angle_sharpness", 0.5)
    jaw_s = _proximity(jaw_sharpness, 0.65, 0.15) * 100
    cheek_ratio = features.get("face_shape", {}).get("cheekbone_width_ratio", 0.75)
    cheek_s = _proximity(cheek_ratio, 0.80, 0.10) * 100
    contour_raw = int(jaw_s * 0.5 + cheek_s * 0.5)

    # -- Facial Dimensionality --
    mountains = features.get("five_mountains", {})
    mountain_balance = mountains.get("balance", 0.5)
    bridge_straight = raw.get("nose_bridge_straightness", 0.5)
    nose_len = raw.get("nose_length_ratio", 0.33)
    forehead_hr = raw.get("forehead_height_ratio", 0.33)
    dim_mountain = mountain_balance * 100
    dim_bridge = bridge_straight * 100
    dim_nose = _proximity(nose_len, 0.34, 0.06) * 100
    dim_forehead = _proximity(forehead_hr, 0.33, 0.06) * 100
    dimensionality_raw = int(dim_mountain * 0.3 + dim_bridge * 0.3 + dim_nose * 0.2 + dim_forehead * 0.2)

    # -- Feature Harmony (5 cross-feature rules) --
    inter_eye = raw.get("inter_eye_distance_ratio", 1.0)
    nose_wr = raw.get("nose_width_ratio", 0.25)
    mouth_wr = raw.get("mouth_width_ratio", 0.40)
    lip_ratio = raw.get("lip_thickness_ratio", 1.0)
    brow_arch = raw.get("eyebrow_arch_ratio", 0.15)
    brow_len = raw.get("eyebrow_length_ratio", 1.0)

    # Rule 1: Eyebrow length / eye width ratio (ideal ~1.2)
    eye_whr_avg = raw.get("eye_width_height_ratio_avg", 3.0)
    r1 = _proximity(brow_len, 1.2, 0.25) * 100

    # Rule 2: Nose width / mouth width ratio (ideal ~0.67)
    nose_mouth = nose_wr / mouth_wr if mouth_wr > 0 else 0.67
    r2 = _proximity(nose_mouth, 0.67, 0.12) * 100

    # Rule 3: Face-jaw shape compatibility
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    jaw_sid = features.get("jawline", {}).get("shape_id", "moderate")
    r3 = _face_jaw_compat(face_sid, jaw_sid)

    # Rule 4: Forehead proportion (ideal ~0.33)
    r4 = _proximity(forehead_hr, 0.33, 0.06) * 100

    # Rule 5: Lip ratio balance (ideal ~0.85)
    r5 = _proximity(lip_ratio, 0.85, 0.20) * 100

    harmony_raw = int((r1 * 0.20 + r2 * 0.20 + r3 * 0.25 + r4 * 0.15 + r5 * 0.20))

    # Build dimension list with transparency basis data
    upper_c = courts.get("upper", 0.333)
    middle_c = courts.get("middle", 0.333)
    lower_c = courts.get("lower", 0.333)

    dim_entries = [
        ("proportion_harmony", proportion_raw, [
            {"key": "three_courts", "value": f"{upper_c:.1%}:{middle_c:.1%}:{lower_c:.1%}", "ideal": "33.3%:33.3%:33.3%"},
            {"key": "five_eyes", "value": round(five_ratio, 2), "ideal": 5.0},
            {"key": "face_whr", "value": round(whr, 3), "ideal": 0.76},
        ]),
        ("symmetry", symmetry_raw, [
            {"key": "eyes", "value": round(features.get("symmetry", {}).get("eyes", 0), 1)},
            {"key": "eyebrows", "value": round(features.get("symmetry", {}).get("eyebrows", 0), 1)},
            {"key": "nose", "value": round(features.get("symmetry", {}).get("nose", 0), 1)},
            {"key": "mouth", "value": round(features.get("symmetry", {}).get("mouth", 0), 1)},
        ]),
        ("feature_refinement", refinement_raw, [
            {"key": "avg_confidence", "value": round(total_conf / conf_count, 3) if conf_count > 0 else 0.5},
        ]),
        ("contour_definition", contour_raw, [
            {"key": "jaw_sharpness", "value": round(jaw_sharpness, 3), "ideal": 0.65},
            {"key": "cheekbone_ratio", "value": round(cheek_ratio, 3), "ideal": 0.80},
        ]),
        ("facial_dimensionality", dimensionality_raw, [
            {"key": "mountain_balance", "value": round(mountain_balance, 3)},
            {"key": "nose_bridge_straightness", "value": round(bridge_straight, 3)},
            {"key": "nose_length_ratio", "value": round(nose_len, 3), "ideal": 0.34},
            {"key": "forehead_height_ratio", "value": round(forehead_hr, 3), "ideal": 0.33},
        ]),
        ("feature_harmony", harmony_raw, [
            {"key": "brow_length_ratio", "value": round(brow_len, 3), "ideal": 1.2},
            {"key": "nose_mouth_ratio", "value": round(nose_mouth, 3), "ideal": 0.67},
            {"key": "face_jaw_compat", "value": face_sid + "/" + jaw_sid},
            {"key": "forehead_ratio", "value": round(forehead_hr, 3), "ideal": 0.33},
            {"key": "lip_ratio", "value": round(lip_ratio, 3), "ideal": 0.85},
        ]),
    ]

    weights = {
        "proportion_harmony": 0.20,
        "symmetry": 0.18,
        "feature_refinement": 0.15,
        "contour_definition": 0.15,
        "facial_dimensionality": 0.15,
        "feature_harmony": 0.17,
    }

    dims = []
    for dim_id, raw_score, basis in dim_entries:
        clamped = max(0, min(100, raw_score))
        dims.append({
            "id": dim_id,
            "label": _DIM_LABELS[dim_id].get(locale, _DIM_LABELS[dim_id]["zh-CN"]),
            "score": clamped,
            "percentile": _dim_percentile(clamped, dim_id),
            "basis": basis,
        })

    scores = {e[0]: e[1] for e in dim_entries}
    overall = int(sum(scores[k] * weights[k] for k in scores))
    overall = max(0, min(100, overall))

    return dims, overall


def _face_jaw_compat(face_shape: str, jawline: str) -> float:
    """Face shape / jawline compatibility score (0-100)."""
    _COMPAT = {
        ("oval", "moderate"): 95, ("oval", "pointed"): 85, ("oval", "angular"): 80,
        ("oval", "square"): 70, ("oval", "wide_round"): 75,
        ("round", "wide_round"): 85, ("round", "moderate"): 80, ("round", "pointed"): 60,
        ("round", "square"): 55, ("round", "angular"): 60,
        ("square", "square"): 85, ("square", "angular"): 80, ("square", "moderate"): 75,
        ("square", "wide_round"): 70, ("square", "pointed"): 55,
        ("heart", "pointed"): 90, ("heart", "moderate"): 80, ("heart", "angular"): 75,
        ("heart", "wide_round"): 60, ("heart", "square"): 55,
        ("diamond", "angular"): 90, ("diamond", "moderate"): 80, ("diamond", "pointed"): 85,
        ("diamond", "square"): 60, ("diamond", "wide_round"): 55,
        ("long", "moderate"): 80, ("long", "wide_round"): 75, ("long", "angular"): 70,
        ("long", "pointed"): 60, ("long", "square"): 65,
        ("pear", "wide_round"): 80, ("pear", "moderate"): 75, ("pear", "square"): 70,
        ("pear", "angular"): 65, ("pear", "pointed"): 55,
    }
    return _COMPAT.get((face_shape, jawline), 70)


# ---------------------------------------------------------------------------
# 2. Gene Card
# ---------------------------------------------------------------------------

_GENE_TRAITS = {
    "zh-CN": {
        "face_shape": {
            "oval": "柔和的椭圆轮廓", "round": "圆润的面部线条", "square": "方正的骨骼架构",
            "heart": "精致的心形面庞", "diamond": "立体的菱形轮廓", "long": "修长的面部比例",
            "pear": "沉稳的梨形面庞",
        },
        "eyes": {
            "phoenix": "凤眼的独特韵味", "almond": "温柔的杏仁眼型", "round": "明亮的圆眼",
            "narrow": "深邃的细长眼型", "droopy": "柔和的下垂眼型",
        },
        "jawline": {
            "moderate": "柔和自然的下颌线", "pointed": "精致尖巧的下巴", "angular": "棱角分明的颌骨",
            "square": "方正有力的下颌", "wide_round": "圆润饱满的下颌",
        },
    },
    "en": {
        "face_shape": {
            "oval": "softly curved oval contours", "round": "gently rounded features",
            "square": "strong angular structure", "heart": "delicate heart-shaped face",
            "diamond": "sculpted diamond contours", "long": "elegant elongated proportions",
            "pear": "balanced pear-shaped face",
        },
        "eyes": {
            "phoenix": "striking phoenix eyes", "almond": "warm almond-shaped eyes",
            "round": "bright expressive eyes", "narrow": "deep narrow eyes",
            "droopy": "soft downturned eyes",
        },
        "jawline": {
            "moderate": "naturally soft jawline", "pointed": "delicately tapered chin",
            "angular": "defined angular jawline", "square": "strong square jaw",
            "wide_round": "full rounded jawline",
        },
    },
}

_IMPRESSIONS = {
    "zh-CN": {
        # oval
        ("oval", "almond"): "温柔知性",
        ("oval", "phoenix"): "优雅大气",
        ("oval", "round"): "亲和甜美",
        ("oval", "narrow"): "温婉含蓄",
        ("oval", "droopy"): "柔美恬静",
        # round
        ("round", "round"): "甜美可爱",
        ("round", "almond"): "温暖亲切",
        ("round", "phoenix"): "灵气十足",
        ("round", "narrow"): "文静内敛",
        ("round", "droopy"): "温柔无害",
        # square
        ("square", "phoenix"): "英气干练",
        ("square", "narrow"): "沉稳内敛",
        ("square", "almond"): "知性大方",
        ("square", "round"): "率真爽朗",
        ("square", "droopy"): "温柔坚定",
        # heart
        ("heart", "almond"): "灵动精致",
        ("heart", "round"): "俏皮灵动",
        ("heart", "phoenix"): "明艳动人",
        ("heart", "narrow"): "精致冷艳",
        ("heart", "droopy"): "楚楚动人",
        # diamond
        ("diamond", "phoenix"): "高级冷艳",
        ("diamond", "almond"): "个性鲜明",
        ("diamond", "round"): "古灵精怪",
        ("diamond", "narrow"): "冷峻高贵",
        ("diamond", "droopy"): "慵懒迷人",
        # long
        ("long", "almond"): "文艺清冷",
        ("long", "phoenix"): "端庄典雅",
        ("long", "round"): "清秀脱俗",
        ("long", "narrow"): "儒雅书卷",
        ("long", "droopy"): "温文尔雅",
        # pear
        ("pear", "almond"): "沉稳温和",
        ("pear", "phoenix"): "大气稳重",
        ("pear", "round"): "敦厚可亲",
        ("pear", "narrow"): "内敛沉静",
        ("pear", "droopy"): "温厚踏实",
    },
    "en": {
        # oval
        ("oval", "almond"): "warm and intellectual",
        ("oval", "phoenix"): "elegant and poised",
        ("oval", "round"): "friendly and sweet",
        ("oval", "narrow"): "gentle and reserved",
        ("oval", "droopy"): "soft and serene",
        # round
        ("round", "round"): "sweet and charming",
        ("round", "almond"): "warm and approachable",
        ("round", "phoenix"): "spirited and bright",
        ("round", "narrow"): "quiet and thoughtful",
        ("round", "droopy"): "gentle and disarming",
        # square
        ("square", "phoenix"): "confident and capable",
        ("square", "narrow"): "calm and composed",
        ("square", "almond"): "poised and graceful",
        ("square", "round"): "candid and refreshing",
        ("square", "droopy"): "gentle yet resolute",
        # heart
        ("heart", "almond"): "lively and refined",
        ("heart", "round"): "playful and spirited",
        ("heart", "phoenix"): "radiant and captivating",
        ("heart", "narrow"): "delicate and cool",
        ("heart", "droopy"): "sweetly expressive",
        # diamond
        ("diamond", "phoenix"): "striking and sophisticated",
        ("diamond", "almond"): "distinctive and stylish",
        ("diamond", "round"): "quirky and magnetic",
        ("diamond", "narrow"): "cool and regal",
        ("diamond", "droopy"): "languid and alluring",
        # long
        ("long", "almond"): "artistic and cool",
        ("long", "phoenix"): "graceful and dignified",
        ("long", "round"): "fresh and refined",
        ("long", "narrow"): "scholarly and composed",
        ("long", "droopy"): "gentle and cultivated",
        # pear
        ("pear", "almond"): "steady and warm",
        ("pear", "phoenix"): "poised and grounded",
        ("pear", "round"): "sincere and amiable",
        ("pear", "narrow"): "reserved and contemplative",
        ("pear", "droopy"): "warm and dependable",
    },
}

_STRENGTH_TEMPLATES = {
    "zh-CN": [
        "你最突出的优势是{h0}，搭配{h1}，非常有辨识度。",
        "{h0}和{h1}的组合让你天然适合镜头，自信就是你的最佳妆容。",
        "你的{h0}是天生的亮点，加上{h1}，整体风格很有记忆点。",
    ],
    "en": [
        "Your standout feature is {h0}, paired with {h1}, creating a memorable look.",
        "The combination of {h0} and {h1} makes you naturally photogenic.",
        "Your {h0} is a natural highlight, complemented by {h1}.",
    ],
}


def generate_gene_card(
    features: dict[str, Any],
    dimensions: list[dict[str, Any]],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Generate composite facial personality description."""
    loc = locale if locale in _GENE_TRAITS else "zh-CN"
    traits = _GENE_TRAITS[loc]

    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    eye_sid = features.get("eyes", {}).get("shape_id", "almond")
    jaw_sid = features.get("jawline", {}).get("shape_id", "moderate")

    face_trait = traits["face_shape"].get(face_sid, traits["face_shape"]["oval"])
    eye_trait = traits["eyes"].get(eye_sid, traits["eyes"]["almond"])
    jaw_trait = traits["jawline"].get(jaw_sid, traits["jawline"]["moderate"])

    impressions = _IMPRESSIONS.get(loc, _IMPRESSIONS["zh-CN"])
    impression = impressions.get((face_sid, eye_sid))
    if not impression:
        # Fallback: pick based on face shape alone
        _FALLBACK = {
            "zh-CN": {"oval": "温婉大方", "round": "亲切可爱", "square": "飒爽利落",
                      "heart": "灵巧精致", "diamond": "个性独特", "long": "优雅从容", "pear": "稳重大气"},
            "en": {"oval": "graceful", "round": "charming", "square": "bold",
                   "heart": "delicate", "diamond": "distinctive", "long": "elegant", "pear": "composed"},
        }
        impression = _FALLBACK.get(loc, _FALLBACK["zh-CN"]).get(face_sid, "")

    if loc == "zh-CN":
        desc = f"{face_trait}，搭配{eye_trait}和{jaw_trait}，整体给人{impression}的感觉。"
    else:
        desc = f"You have {face_trait}, paired with {eye_trait} and a {jaw_trait}, creating an overall {impression} impression."

    # Highlights: top 3 features by score
    highlights = _compute_highlights(features, dimensions, locale)

    # Strength sentence
    strength_templates = _STRENGTH_TEMPLATES.get(loc, _STRENGTH_TEMPLATES["zh-CN"])
    idx = hash(face_sid + eye_sid) % len(strength_templates)
    if len(highlights) >= 2:
        strength = strength_templates[idx].format(h0=highlights[0], h1=highlights[1])
        desc = desc + strength

    return {
        "description": desc,
        "highlights": highlights,
    }


def _compute_highlights(
    features: dict[str, Any],
    dimensions: list[dict[str, Any]],
    locale: str,
) -> list[str]:
    """Pick top 3 feature highlights by dimension score."""
    sorted_dims = sorted(dimensions, key=lambda d: d["score"], reverse=True)
    return [d["label"] for d in sorted_dims[:3]]


# ---------------------------------------------------------------------------
# 3. Fun Indices
# ---------------------------------------------------------------------------

def compute_fun_indices(
    features: dict[str, Any],
    dimensions: list[dict[str, Any]],
    locale: str = "zh-CN",
) -> list[dict[str, Any]]:
    """Compute 4 fun percentile indices."""
    loc = locale if locale in _FUN_INDEX_LABELS["age_defying"] else "zh-CN"
    raw = features.get("raw_ratios", {})
    dim_map = {d["id"]: d["score"] for d in dimensions}

    # Age-defying: facial fullness + balanced mid-court + mountain prominence
    face_whr = raw.get("face_width_height_ratio", 0.76)
    fullness = _proximity(face_whr, 0.78, 0.08) * 100
    mid_court = features.get("three_courts", {}).get("middle", 0.333)
    mid_balance = _proximity(mid_court, 0.333, 0.04) * 100
    mountains = features.get("five_mountains", {})
    avg_prominence = sum(
        mountains.get(k, {}).get("prominence", 0.5) for k in ("south", "north", "center", "east", "west")
    ) / 5.0
    mountain_s = avg_prominence * 100
    age_raw = int(fullness * 0.4 + mid_balance * 0.3 + mountain_s * 0.3)
    age_pct = _dim_percentile(age_raw, "age_defying")

    # Distinctiveness: how much features deviate from average
    deviations = []
    for key in ("face_shape", "eyes", "nose", "mouth", "eyebrows"):
        conf = features.get(key, {}).get("confidence", 0.5)
        deviations.append(abs(conf - 0.5) * 2)  # 0-1 scale
    dist_raw = int(sum(deviations) / len(deviations) * 100) if deviations else 50
    dist_pct = _dim_percentile(dist_raw, "distinctiveness")

    # Photogenic: symmetry + proportion harmony
    sym_score = dim_map.get("symmetry", 75)
    prop_score = dim_map.get("proportion_harmony", 70)
    photo_raw = int(sym_score * 0.55 + prop_score * 0.45)
    photo_pct = _dim_percentile(photo_raw, "photogenic")

    # Approachability: mouth corners + eye shape + face shape
    corner_angle = raw.get("mouth_corner_angle", 0.0)
    corner_s = min(100, max(0, 50 + corner_angle * 5))
    eye_sid = features.get("eyes", {}).get("shape_id", "almond")
    eye_soft = {"round": 90, "almond": 80, "droopy": 70, "phoenix": 55, "narrow": 50}.get(eye_sid, 65)
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    face_soft = {"round": 90, "oval": 80, "heart": 70, "pear": 65, "diamond": 55,
                 "long": 55, "square": 50}.get(face_sid, 65)
    approach_raw = int(corner_s * 0.4 + eye_soft * 0.3 + face_soft * 0.3)
    approach_pct = _dim_percentile(approach_raw, "approachability")

    indices = [
        ("age_defying", age_pct),
        ("distinctiveness", dist_pct),
        ("photogenic", photo_pct),
        ("approachability", approach_pct),
    ]

    result = []
    for idx_id, pct in indices:
        desc_tpl = _FUN_INDEX_DESC[idx_id].get(loc, _FUN_INDEX_DESC[idx_id]["zh-CN"])
        result.append({
            "id": idx_id,
            "label": _FUN_INDEX_LABELS[idx_id].get(loc, _FUN_INDEX_LABELS[idx_id]["zh-CN"]),
            "percentile": pct,
            "description": desc_tpl.format(pct=pct),
        })

    return result


# ---------------------------------------------------------------------------
# 4. Photo Angle Recommendation (free tier)
# ---------------------------------------------------------------------------

_PHOTO_ANGLE_LABELS = {
    "zh-CN": {
        "left": "左脸", "right": "右脸", "center": "正面",
        "level": "平视", "slight_up": "微微仰角", "slight_down": "微微俯角",
    },
    "en": {
        "left": "left side", "right": "right side", "center": "center",
        "level": "level", "slight_up": "slight upward tilt", "slight_down": "slight downward tilt",
    },
}

_EXPRESSION_TIPS = {
    "zh-CN": {
        "big_smile": "自然大笑最能展现你的亲和力，嘴角自然上扬即可",
        "subtle_smile": "嘴角微微上扬的浅笑最适合你，优雅又不刻意",
        "confident": "自信的微笑配合直视镜头，能突出你的气场",
        "relaxed": "放松的表情最自然，试试想一件开心的事",
    },
    "en": {
        "big_smile": "A natural big smile shows your warmth best",
        "subtle_smile": "A subtle smile suits you -- elegant without trying too hard",
        "confident": "A confident smile with direct eye contact highlights your presence",
        "relaxed": "A relaxed expression looks most natural -- think of something happy",
    },
}


def recommend_photo_angle(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Determine best photo angle based on asymmetry and proportions."""
    loc = locale if locale in _PHOTO_ANGLE_LABELS else "zh-CN"
    labels = _PHOTO_ANGLE_LABELS[loc]
    tips = _EXPRESSION_TIPS[loc]

    # Determine best side by comparing left vs right features
    left_eye = features.get("eyes", {}).get("left", {})
    right_eye = features.get("eyes", {}).get("right", {})
    left_brow = features.get("eyebrows", {}).get("left", {})
    right_brow = features.get("eyebrows", {}).get("right", {})

    left_score = left_eye.get("width", 0) + left_brow.get("arch_ratio", 0) * 100
    right_score = right_eye.get("width", 0) + right_brow.get("arch_ratio", 0) * 100

    sym = features.get("symmetry", {}).get("overall_score", 90)
    if sym > 92 or abs(left_score - right_score) < 2:
        best_side = "center"
    elif left_score > right_score:
        best_side = "left"
    else:
        best_side = "right"

    # Vertical angle from three courts
    courts = features.get("three_courts", {})
    upper = courts.get("upper", 0.333)
    lower = courts.get("lower", 0.333)
    if upper > 0.36:
        vertical_angle = "slight_down"
    elif lower > 0.36:
        vertical_angle = "slight_up"
    else:
        vertical_angle = "level"

    # Expression tip from mouth/eye type
    mouth_sid = features.get("mouth", {}).get("shape_id", "balanced")
    eye_sid = features.get("eyes", {}).get("shape_id", "almond")
    corner = features.get("raw_ratios", {}).get("mouth_corner_angle", 0.0)

    if corner > 3.0 or mouth_sid == "upturned":
        expression_key = "big_smile"
    elif mouth_sid in ("small", "balanced") and eye_sid in ("almond", "round"):
        expression_key = "subtle_smile"
    elif eye_sid == "phoenix":
        expression_key = "confident"
    else:
        expression_key = "relaxed"

    # Build rationale
    if loc == "zh-CN":
        rationale_parts = []
        if best_side != "center":
            rationale_parts.append(f"你的{labels[best_side]}轮廓线条更流畅")
        else:
            rationale_parts.append("你的面部非常对称，正面拍摄最能展现优势")
        if vertical_angle == "slight_down":
            rationale_parts.append("微微俯角可以让额头比例更和谐")
        elif vertical_angle == "slight_up":
            rationale_parts.append("微微仰角可以拉长下庭比例")
        rationale = "，".join(rationale_parts) + "。"
    else:
        rationale_parts = []
        if best_side != "center":
            rationale_parts.append(f"Your {labels[best_side]} has smoother contour lines")
        else:
            rationale_parts.append("Your face is highly symmetrical, a front-facing angle works best")
        if vertical_angle == "slight_down":
            rationale_parts.append("a slight downward tilt balances forehead proportions")
        elif vertical_angle == "slight_up":
            rationale_parts.append("a slight upward tilt elongates the lower face")
        rationale = "; ".join(rationale_parts) + "."

    return {
        "best_side": best_side,
        "vertical_angle": vertical_angle,
        "expression_tip": tips[expression_key],
        "rationale": rationale,
    }


# ---------------------------------------------------------------------------
# 5. Hairstyle Recommendations (paid)
# ---------------------------------------------------------------------------

_HAIRSTYLE_DB = {
    "layered_bob": {"zh-CN": "层次波波头", "en": "Layered Bob"},
    "long_waves": {"zh-CN": "长卷发", "en": "Long Waves"},
    "side_part": {"zh-CN": "侧分长发", "en": "Side Part"},
    "wispy_bangs": {"zh-CN": "空气刘海", "en": "Wispy Bangs"},
    "curtain_bangs": {"zh-CN": "法式刘海", "en": "Curtain Bangs"},
    "blunt_bob": {"zh-CN": "齐肩短发", "en": "Blunt Bob"},
    "pixie": {"zh-CN": "精灵短发", "en": "Pixie Cut"},
    "soft_layers": {"zh-CN": "柔和层次长发", "en": "Soft Layers"},
    "high_ponytail": {"zh-CN": "高马尾", "en": "High Ponytail"},
    "low_bun": {"zh-CN": "低发髻", "en": "Low Bun"},
    "c_curl_bob": {"zh-CN": "C字卷短发", "en": "C-Curl Bob"},
    "french_bob": {"zh-CN": "法式短发", "en": "French Bob"},
}

_FACE_HAIRSTYLE_MAP: dict[str, dict[str, list]] = {
    "round": {
        "recommended": [
            {"id": "side_part", "exposure": 0.7, "zh-CN": "侧分可以拉长脸型视觉比例", "en": "Side parting elongates the face visually"},
            {"id": "soft_layers", "exposure": 0.6, "zh-CN": "层次感修饰脸颊两侧", "en": "Layers frame and slim the cheeks"},
            {"id": "long_waves", "exposure": 0.5, "zh-CN": "长卷发增加纵向线条感", "en": "Long waves add vertical lines"},
        ],
        "avoid": [
            {"id": "blunt_bob", "zh-CN": "齐肩短发会强调脸部宽度", "en": "A blunt bob emphasizes facial width"},
        ],
    },
    "oval": {
        "recommended": [
            {"id": "curtain_bangs", "exposure": 0.4, "zh-CN": "法式刘海完美衬托你的脸型", "en": "Curtain bangs frame your face beautifully"},
            {"id": "layered_bob", "exposure": 0.6, "zh-CN": "层次波波头活力十足", "en": "A layered bob adds energy and movement"},
            {"id": "high_ponytail", "exposure": 0.9, "zh-CN": "高马尾展现你的脸型优势", "en": "High ponytail showcases your face shape"},
        ],
        "avoid": [
            {"id": "wispy_bangs", "zh-CN": "过长的刘海可能遮挡你的优势脸型", "en": "Heavy bangs may hide your balanced proportions"},
        ],
    },
    "square": {
        "recommended": [
            {"id": "soft_layers", "exposure": 0.5, "zh-CN": "柔和层次软化你的颌骨线条", "en": "Soft layers soften your jawline"},
            {"id": "long_waves", "exposure": 0.4, "zh-CN": "长卷发增添柔美感", "en": "Long waves add softness"},
            {"id": "side_part", "exposure": 0.6, "zh-CN": "侧分打破对称增添灵动", "en": "Side part breaks symmetry for a dynamic look"},
        ],
        "avoid": [
            {"id": "blunt_bob", "zh-CN": "齐长发会强调方正感", "en": "A blunt cut emphasizes squareness"},
            {"id": "pixie", "zh-CN": "超短发会突显颌骨", "en": "Pixie cut highlights the jawbone"},
        ],
    },
    "heart": {
        "recommended": [
            {"id": "c_curl_bob", "exposure": 0.5, "zh-CN": "C字卷在下颌处增加宽度平衡", "en": "C-curls add width at the jaw for balance"},
            {"id": "curtain_bangs", "exposure": 0.3, "zh-CN": "法式刘海柔化额头宽度", "en": "Curtain bangs soften forehead width"},
            {"id": "low_bun", "exposure": 0.8, "zh-CN": "低发髻展现精致的下巴", "en": "Low bun showcases your delicate chin"},
        ],
        "avoid": [
            {"id": "high_ponytail", "zh-CN": "高马尾会强调额头宽度", "en": "High ponytail emphasizes forehead width"},
        ],
    },
    "diamond": {
        "recommended": [
            {"id": "curtain_bangs", "exposure": 0.3, "zh-CN": "法式刘海平衡额头和颧骨", "en": "Curtain bangs balance forehead and cheekbones"},
            {"id": "layered_bob", "exposure": 0.5, "zh-CN": "层次感在下颌处增添丰盈", "en": "Layers add fullness at the jawline"},
            {"id": "side_part", "exposure": 0.6, "zh-CN": "侧分增加额头视觉宽度", "en": "Side part adds visual width to forehead"},
        ],
        "avoid": [
            {"id": "pixie", "zh-CN": "超短发会突显颧骨", "en": "Pixie cut highlights cheekbones"},
        ],
    },
    "long": {
        "recommended": [
            {"id": "wispy_bangs", "exposure": 0.2, "zh-CN": "空气刘海缩短脸部纵向比例", "en": "Wispy bangs shorten the face visually"},
            {"id": "c_curl_bob", "exposure": 0.5, "zh-CN": "C字卷增加横向宽度感", "en": "C-curls add horizontal width"},
            {"id": "layered_bob", "exposure": 0.4, "zh-CN": "波波头增加两侧蓬松感", "en": "Bob adds volume on the sides"},
        ],
        "avoid": [
            {"id": "high_ponytail", "zh-CN": "高马尾会进一步拉长脸型", "en": "High ponytail further elongates the face"},
        ],
    },
    "pear": {
        "recommended": [
            {"id": "soft_layers", "exposure": 0.6, "zh-CN": "层次长发在上半脸增加蓬松感", "en": "Soft layers add volume to the upper face"},
            {"id": "curtain_bangs", "exposure": 0.3, "zh-CN": "刘海增加额头区域视觉宽度", "en": "Bangs add visual width to the forehead"},
            {"id": "long_waves", "exposure": 0.5, "zh-CN": "卷发增加整体丰盈感", "en": "Waves add overall fullness"},
        ],
        "avoid": [
            {"id": "low_bun", "zh-CN": "紧贴头皮的发型会突显下宽", "en": "Tight styles emphasize jaw width"},
        ],
    },
}

# Forehead height modifiers
_FOREHEAD_MODIFIERS = {
    "high": {"add": ["wispy_bangs", "curtain_bangs"], "remove": ["high_ponytail"], "boost": []},
    "low": {"add": ["high_ponytail"], "remove": ["wispy_bangs"], "boost": ["layered_bob"]},
}

# Jawline modifiers
_JAW_MODIFIERS = {
    "square": {"add": ["soft_layers"], "remove": ["blunt_bob", "pixie"], "boost": ["long_waves"]},
    "wide_round": {"add": ["side_part"], "remove": ["blunt_bob"], "boost": ["soft_layers"]},
    "pointed": {"add": ["c_curl_bob"], "remove": [], "boost": ["layered_bob"]},
}


def recommend_hairstyles(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Primary-modifier hairstyle recommendation.

    Conflict resolution priority: remove > boost > add.
    A style removed by any modifier is excluded regardless of other modifiers
    adding or boosting it.  Boosted styles are promoted to the front.
    The result is guaranteed to contain at least 1 recommendation.
    """
    loc = locale if locale in ("zh-CN", "en") else "zh-CN"
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    forehead_sid = features.get("forehead", {}).get("shape_id", "medium")
    jaw_sid = features.get("jawline", {}).get("shape_id", "moderate")

    base = _FACE_HAIRSTYLE_MAP.get(face_sid, _FACE_HAIRSTYLE_MAP["oval"])

    # -- 1. Collect all modifier actions first ---------------------------------
    all_adds: list[str] = []
    all_removes: set[str] = set()
    all_boosts: set[str] = set()

    for mod in (_FOREHEAD_MODIFIERS.get(forehead_sid, {}),
                _JAW_MODIFIERS.get(jaw_sid, {})):
        all_adds.extend(mod.get("add", []))
        all_removes.update(mod.get("remove", []))
        all_boosts.update(mod.get("boost", []))

    # -- 2. Resolve conflicts: remove vetoes boost and add ---------------------
    all_boosts -= all_removes
    effective_adds = [a for a in all_adds if a not in all_removes]

    # -- 3. Build ordered recommended ID list ----------------------------------
    rec_ids: list[str] = []
    for r in base["recommended"]:
        if r["id"] not in all_removes:
            rec_ids.append(r["id"])
    for add_id in effective_adds:
        if add_id not in rec_ids:
            rec_ids.append(add_id)

    # Boosted items float to front, rest keep insertion order
    rec_ids.sort(key=lambda sid: (0 if sid in all_boosts else 1))

    # -- 4. Build rationale lookup from base + generic for modifier-added ------
    base_rec_map: dict[str, dict] = {item["id"]: item for item in base["recommended"]}

    recommended = []
    for style_id in rec_ids[:3]:
        name = _HAIRSTYLE_DB.get(style_id, {}).get(loc, style_id)
        item = base_rec_map.get(style_id)
        if item:
            rationale = item.get(loc, "")
            exposure = item.get("exposure", 0.5)
        else:
            rationale = {"zh-CN": "适合你的脸型和面部比例",
                         "en": "Suits your face shape and proportions"}[loc]
            exposure = 0.5
        recommended.append({
            "style_id": style_id,
            "name": name,
            "rationale": rationale,
            "forehead_exposure": exposure,
        })

    # -- 5. Fallback: never return empty recommendations -----------------------
    if not recommended:
        fb = base["recommended"][0]
        recommended.append({
            "style_id": fb["id"],
            "name": _HAIRSTYLE_DB.get(fb["id"], {}).get(loc, fb["id"]),
            "rationale": {"zh-CN": "综合考虑你的面部特征，这是相对较适合的选择",
                          "en": "Considering your overall features, this is a relatively suitable choice"}[loc],
            "forehead_exposure": fb.get("exposure", 0.5),
        })

    # -- 6. Build avoid list: base avoid + modifier-removed items --------------
    base_avoid_map: dict[str, dict] = {item["id"]: item for item in base.get("avoid", [])}
    # Ordered: base avoid items first, then modifier-removed items
    avoid_ids: list[str] = [a["id"] for a in base.get("avoid", [])]
    for rm_id in all_removes:
        if rm_id not in avoid_ids:
            avoid_ids.append(rm_id)
    # Remove items that ended up in recommended
    rec_id_set = {r["style_id"] for r in recommended}
    avoid_ids = [a for a in avoid_ids if a not in rec_id_set]

    avoid = []
    for aid in avoid_ids[:2]:
        name = _HAIRSTYLE_DB.get(aid, {}).get(loc, aid)
        base_item = base_avoid_map.get(aid)
        rationale = base_item.get(loc, "") if base_item else {
            "zh-CN": "可能不太适合你的面部比例",
            "en": "May not suit your facial proportions",
        }[loc]
        avoid.append({
            "style_id": aid,
            "name": name,
            "rationale": rationale,
            "forehead_exposure": 0.5,
        })

    return {"recommended": recommended, "avoid": avoid}


# ---------------------------------------------------------------------------
# 6. Eyebrow Recommendations (paid)
# ---------------------------------------------------------------------------

_IDEAL_BROW_BY_FACE = {
    "oval": "soft_arch",
    "round": "high_arch",
    "square": "soft_arch",
    "heart": "soft_arch",
    "diamond": "straight",
    "long": "straight",
    "pear": "long_arch",
}

_BROW_LABELS = {
    "zh-CN": {
        "high_arch": "高挑弯眉", "soft_arch": "柔和弧形眉", "straight": "一字眉",
        "straight_long": "长一字眉", "long_arch": "长弧眉",
    },
    "en": {
        "high_arch": "High Arch", "soft_arch": "Soft Arch", "straight": "Straight Brow",
        "straight_long": "Long Straight", "long_arch": "Long Arch",
    },
}

_IDEAL_BROW_PARAMS = {
    "high_arch": {"arch_ratio": 0.20, "length_ratio": 1.15},
    "soft_arch": {"arch_ratio": 0.15, "length_ratio": 1.20},
    "straight": {"arch_ratio": 0.06, "length_ratio": 1.25},
    "straight_long": {"arch_ratio": 0.06, "length_ratio": 1.35},
    "long_arch": {"arch_ratio": 0.14, "length_ratio": 1.30},
}


def recommend_eyebrows(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Compare current vs ideal eyebrow shape with mm-precision adjustments."""
    loc = locale if locale in ("zh-CN", "en") else "zh-CN"
    ipd_px = features.get("raw_ratios", {}).get("ipd_pixels", 100)

    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    current_sid = features.get("eyebrows", {}).get("shape_id", "soft_arch")
    ideal_sid = _IDEAL_BROW_BY_FACE.get(face_sid, "soft_arch")

    # Eye shape modifier
    eye_sid = features.get("eyes", {}).get("shape_id", "almond")
    if eye_sid == "narrow" and ideal_sid != "straight":
        ideal_sid = "straight"  # Straight brows open up narrow eyes
    elif eye_sid == "round" and ideal_sid == "straight":
        ideal_sid = "soft_arch"  # Slight arch complements round eyes

    current_arch = features.get("eyebrows", {}).get("arch_ratio", 0.12)
    current_len = features.get("eyebrows", {}).get("length_ratio", 1.1)
    ideal_params = _IDEAL_BROW_PARAMS.get(ideal_sid, _IDEAL_BROW_PARAMS["soft_arch"])

    arch_delta = ideal_params["arch_ratio"] - current_arch
    len_delta = ideal_params["length_ratio"] - current_len

    # Convert deltas to approx pixel values (using eye width as reference)
    left_eye = features.get("eyes", {}).get("left", {})
    eye_width_px = left_eye.get("width", 40)

    arch_px = abs(arch_delta) * eye_width_px
    len_px = abs(len_delta) * eye_width_px

    adjustments = {}
    if abs(arch_delta) > 0.02:
        direction = "raise" if arch_delta > 0 else "lower"
        if loc == "zh-CN":
            adjustments["arch_change"] = f"眉峰{'抬高' if arch_delta > 0 else '降低'}约{_px_to_mm(arch_px, ipd_px)}mm"
        else:
            adjustments["arch_change"] = f"{'Raise' if arch_delta > 0 else 'Lower'} arch peak by ~{_px_to_mm(arch_px, ipd_px)}mm"

    if abs(len_delta) > 0.05:
        if loc == "zh-CN":
            adjustments["length_change"] = f"眉尾{'延长' if len_delta > 0 else '缩短'}约{_px_to_mm(len_px, ipd_px)}mm"
        else:
            adjustments["length_change"] = f"{'Extend' if len_delta > 0 else 'Shorten'} tail by ~{_px_to_mm(len_px, ipd_px)}mm"

    if not adjustments:
        if loc == "zh-CN":
            adjustments["no_change"] = "你的眉形已经非常适合你的脸型"
        else:
            adjustments["no_change"] = "Your brow shape already suits your face well"

    # Build rationale
    current_label = _BROW_LABELS.get(loc, _BROW_LABELS["zh-CN"]).get(current_sid, current_sid)
    ideal_label = _BROW_LABELS.get(loc, _BROW_LABELS["zh-CN"]).get(ideal_sid, ideal_sid)

    if current_sid == ideal_sid:
        if loc == "zh-CN":
            rationale = f"你目前的{current_label}非常适合你的{_GENE_TRAITS['zh-CN']['face_shape'].get(face_sid, '脸型')}，保持即可。"
        else:
            rationale = f"Your current {current_label} suits your face shape perfectly."
    else:
        if loc == "zh-CN":
            rationale = f"根据你的{_GENE_TRAITS['zh-CN']['face_shape'].get(face_sid, '脸型')}，{ideal_label}最能衬托你的五官。"
        else:
            rationale = f"Based on your face shape, a {ideal_label} would complement your features best."

    return {
        "current_type": current_sid,
        "current_description": current_label,
        "suggested_type": ideal_sid,
        "suggested_description": ideal_label,
        "rationale": rationale,
        "adjustments": adjustments,
    }


# ---------------------------------------------------------------------------
# 7. Contouring Recommendations (paid)
# ---------------------------------------------------------------------------

def recommend_contouring(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Map proportional imbalances to contouring zones."""
    loc = locale if locale in ("zh-CN", "en") else "zh-CN"
    courts = features.get("three_courts", {})
    jaw_sid = features.get("jawline", {}).get("shape_id", "moderate")
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    raw = features.get("raw_ratios", {})
    nose_wr = raw.get("nose_width_ratio", 0.25)

    zones = []

    # Upper court too large -> shadow forehead sides, highlight brow bone
    if courts.get("upper", 0.333) > 0.36:
        zones.append({
            "region_id": "forehead_sides",
            "zone_type": "shadow",
            "tip": {"zh-CN": "你的上庭略宽，在额头两侧打阴影可以视觉收窄",
                    "en": "Shadowing the forehead sides visually narrows the upper face"}[loc],
        })
        zones.append({
            "region_id": "brow_bone",
            "zone_type": "highlight",
            "tip": {"zh-CN": "在眉骨处提亮，让上庭更有立体感",
                    "en": "Highlighting the brow bone adds dimension to the upper face"}[loc],
        })

    # Lower court too large -> shadow chin tip
    if courts.get("lower", 0.333) > 0.36:
        zones.append({
            "region_id": "chin_tip",
            "zone_type": "shadow",
            "tip": {"zh-CN": "在下巴尖端稍加阴影可以视觉缩短下庭",
                    "en": "Subtle shadowing on the chin tip visually shortens the lower face"}[loc],
        })

    # Wide nose -> shadow nose sides
    if nose_wr > 0.28:
        zones.append({
            "region_id": "nose_sides",
            "zone_type": "shadow",
            "tip": {"zh-CN": "在鼻翼两侧轻扫阴影，视觉缩窄鼻翼",
                    "en": "Sweep shadow along the nose wings to visually narrow them"}[loc],
        })

    # Square/wide jawline -> shadow jaw corners
    if jaw_sid in ("square", "wide_round"):
        zones.append({
            "region_id": "jaw_corners",
            "zone_type": "shadow",
            "tip": {"zh-CN": "在下颌角处打阴影可以柔化方正的颌骨线条",
                    "en": "Shadow on the jaw corners softens angular jawlines"}[loc],
        })

    # Blush recommendation based on face shape
    if face_sid in ("round", "pear"):
        zones.append({
            "region_id": "cheek_sweep_left",
            "zone_type": "blush",
            "tip": {"zh-CN": "斜扫腮红从颧骨到太阳穴方向，拉长脸型",
                    "en": "Sweep blush diagonally from cheekbone to temple to elongate the face"}[loc],
        })
        zones.append({
            "region_id": "cheek_sweep_right",
            "zone_type": "blush",
            "tip": {"zh-CN": "右侧同样斜扫腮红，保持对称",
                    "en": "Mirror the diagonal sweep on the right side"}[loc],
        })
    else:
        zones.append({
            "region_id": "cheek_apple_left",
            "zone_type": "blush",
            "tip": {"zh-CN": "在苹果肌处轻扫腮红，增添气色",
                    "en": "Apply blush on the apple of the cheek for a natural glow"}[loc],
        })
        zones.append({
            "region_id": "cheek_apple_right",
            "zone_type": "blush",
            "tip": {"zh-CN": "右侧苹果肌同样轻扫，保持自然对称",
                    "en": "Mirror on the right cheek for natural symmetry"}[loc],
        })

    # Always highlight nose bridge for dimensionality
    zones.append({
        "region_id": "nose_bridge",
        "zone_type": "highlight",
        "tip": {"zh-CN": "沿鼻梁打一道高光，增强面部立体感",
                "en": "A highlight along the nose bridge enhances facial dimensionality"}[loc],
    })

    # Build description
    shadow_count = sum(1 for z in zones if z["zone_type"] == "shadow")
    highlight_count = sum(1 for z in zones if z["zone_type"] == "highlight")
    if loc == "zh-CN":
        desc = f"根据你的面部比例，建议{shadow_count}处阴影、{highlight_count}处高光和腮红的组合修容方案。"
    else:
        desc = f"Based on your proportions, we recommend {shadow_count} shadow, {highlight_count} highlight, and blush zones."

    return {"zones": zones, "description": desc}


# ---------------------------------------------------------------------------
# 8. Glasses Recommendations (paid)
# ---------------------------------------------------------------------------

_GLASSES_DB = {
    "aviator": {"zh-CN": "飞行员框", "en": "Aviator"},
    "round_frame": {"zh-CN": "圆框眼镜", "en": "Round Frame"},
    "cat_eye": {"zh-CN": "猫眼框", "en": "Cat Eye"},
    "rectangular": {"zh-CN": "方框眼镜", "en": "Rectangular"},
    "browline": {"zh-CN": "半框眼镜", "en": "Browline"},
    "oval_frame": {"zh-CN": "椭圆框", "en": "Oval Frame"},
    "wayfarer": {"zh-CN": "旅行者框", "en": "Wayfarer"},
    "geometric": {"zh-CN": "几何框", "en": "Geometric"},
}

_FACE_GLASSES_MAP = {
    "round": {
        "recommended": [
            {"id": "rectangular", "zh-CN": "方形镜框增加面部线条感", "en": "Rectangular frames add structure"},
            {"id": "wayfarer", "zh-CN": "旅行者框增添棱角", "en": "Wayfarers add angular contrast"},
        ],
        "avoid": [
            {"id": "round_frame", "zh-CN": "圆框会强调脸部圆润", "en": "Round frames emphasize roundness"},
        ],
    },
    "oval": {
        "recommended": [
            {"id": "wayfarer", "zh-CN": "旅行者框经典百搭", "en": "Wayfarers are a classic match"},
            {"id": "aviator", "zh-CN": "飞行员框突显优雅", "en": "Aviators add elegance"},
            {"id": "cat_eye", "zh-CN": "猫眼框增添时尚感", "en": "Cat eye frames add style"},
        ],
        "avoid": [],
    },
    "square": {
        "recommended": [
            {"id": "round_frame", "zh-CN": "圆框柔化方正的颌骨", "en": "Round frames soften angular features"},
            {"id": "oval_frame", "zh-CN": "椭圆框平衡面部线条", "en": "Oval frames balance your lines"},
        ],
        "avoid": [
            {"id": "rectangular", "zh-CN": "方框会强化方正感", "en": "Rectangular frames amplify squareness"},
        ],
    },
    "heart": {
        "recommended": [
            {"id": "aviator", "zh-CN": "飞行员框平衡上宽下窄", "en": "Aviators balance the wider forehead"},
            {"id": "round_frame", "zh-CN": "圆框柔和整体感觉", "en": "Round frames soften the overall look"},
        ],
        "avoid": [
            {"id": "cat_eye", "zh-CN": "猫眼框会强调上半脸宽度", "en": "Cat eye frames emphasize forehead width"},
        ],
    },
    "diamond": {
        "recommended": [
            {"id": "browline", "zh-CN": "半框眼镜增加额头视觉宽度", "en": "Browline adds width to the forehead"},
            {"id": "cat_eye", "zh-CN": "猫眼框呼应你的颧骨线条", "en": "Cat eye complements your cheekbone structure"},
        ],
        "avoid": [
            {"id": "geometric", "zh-CN": "过于棱角的框会强化菱形感", "en": "Geometric frames amplify the diamond shape"},
        ],
    },
    "long": {
        "recommended": [
            {"id": "wayfarer", "zh-CN": "旅行者框增加横向宽度感", "en": "Wayfarers add horizontal width"},
            {"id": "aviator", "zh-CN": "飞行员框遮盖中庭增加横向比例", "en": "Aviators cover the mid-face and add width"},
        ],
        "avoid": [
            {"id": "oval_frame", "zh-CN": "纵向延伸的椭圆框会拉长脸型", "en": "Vertically oriented oval frames elongate the face"},
        ],
    },
    "pear": {
        "recommended": [
            {"id": "cat_eye", "zh-CN": "猫眼框在上半脸增加宽度平衡", "en": "Cat eye adds width to the upper face"},
            {"id": "browline", "zh-CN": "半框增加眉骨区域存在感", "en": "Browline draws attention to the brow area"},
        ],
        "avoid": [
            {"id": "aviator", "zh-CN": "底部过宽的飞行员框会强化下宽", "en": "Wide-bottom aviators emphasize jaw width"},
        ],
    },
}


def recommend_glasses(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Recommend glasses frames based on face shape."""
    loc = locale if locale in ("zh-CN", "en") else "zh-CN"
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")

    base = _FACE_GLASSES_MAP.get(face_sid, _FACE_GLASSES_MAP["oval"])

    recommended = []
    for item in base.get("recommended", [])[:3]:
        name = _GLASSES_DB.get(item["id"], {}).get(loc, item["id"])
        recommended.append({
            "frame_id": item["id"],
            "name": name,
            "rationale": item.get(loc, ""),
        })

    avoid = []
    for item in base.get("avoid", [])[:2]:
        name = _GLASSES_DB.get(item["id"], {}).get(loc, item["id"])
        avoid.append({
            "frame_id": item["id"],
            "name": name,
            "rationale": item.get(loc, ""),
        })

    return {"recommended": recommended, "avoid": avoid}


# ---------------------------------------------------------------------------
# 9. All Insights (paid)
# ---------------------------------------------------------------------------

def generate_all_insights(
    features: dict[str, Any],
    dimensions: list[dict[str, Any]],
    locale: str = "zh-CN",
) -> list[dict[str, Any]]:
    """Generate 5 detailed insight items."""
    loc = locale if locale in ("zh-CN", "en") else "zh-CN"
    raw = features.get("raw_ratios", {})
    courts = features.get("three_courts", {})
    sym = features.get("symmetry", {})

    insights = []

    # 1. Golden Ratio Analysis
    upper = courts.get("upper", 0.333)
    middle = courts.get("middle", 0.333)
    lower = courts.get("lower", 0.333)
    closeness = max(0, int(100 - max(abs(upper - 0.333), abs(middle - 0.333), abs(lower - 0.333)) * 300))
    insights.append({
        "type": "golden_ratio",
        "title": {"zh-CN": "黄金比例分析", "en": "Golden Ratio Analysis"}[loc],
        "brief": {
            "zh-CN": f"你的三庭比例接近黄金比例的{closeness}%",
            "en": f"Your facial thirds are {closeness}% close to the golden ratio",
        }[loc],
        "detail": {
            "zh-CN": f"上庭{upper:.1%}、中庭{middle:.1%}、下庭{lower:.1%}（理想值各约33.3%）。"
                     f"五眼比例为{raw.get('five_eyes_ratio', 5.0):.1f}（理想值5.0）。",
            "en": f"Upper {upper:.1%}, middle {middle:.1%}, lower {lower:.1%} (ideal ~33.3% each). "
                  f"Five-eye ratio: {raw.get('five_eyes_ratio', 5.0):.1f} (ideal 5.0).",
        }[loc],
    })

    # 2. Symmetry Detail
    best_area = max(
        [("eyes", sym.get("eyes", 0)), ("eyebrows", sym.get("eyebrows", 0)),
         ("nose", sym.get("nose", 0)), ("mouth", sym.get("mouth", 0))],
        key=lambda x: x[1],
    )
    weakest_area = min(
        [("eyes", sym.get("eyes", 0)), ("eyebrows", sym.get("eyebrows", 0)),
         ("nose", sym.get("nose", 0)), ("mouth", sym.get("mouth", 0))],
        key=lambda x: x[1],
    )
    area_names = {
        "zh-CN": {"eyes": "眼部", "eyebrows": "眉部", "nose": "鼻部", "mouth": "唇部"},
        "en": {"eyes": "eyes", "eyebrows": "eyebrows", "nose": "nose", "mouth": "mouth"},
    }
    insights.append({
        "type": "symmetry_detail",
        "title": {"zh-CN": "对称性详析", "en": "Symmetry Breakdown"}[loc],
        "brief": {
            "zh-CN": f"整体对称度{sym.get('overall_score', 0):.0f}分，{area_names[loc][best_area[0]]}最对称",
            "en": f"Overall symmetry {sym.get('overall_score', 0):.0f}, strongest in {area_names[loc][best_area[0]]}",
        }[loc],
        "detail": {
            "zh-CN": f"眼部{sym.get('eyes', 0):.0f}、眉部{sym.get('eyebrows', 0):.0f}、"
                     f"鼻部{sym.get('nose', 0):.0f}、唇部{sym.get('mouth', 0):.0f}。"
                     f"{area_names[loc][weakest_area[0]]}区域可以通过妆容技巧进一步优化。",
            "en": f"Eyes {sym.get('eyes', 0):.0f}, brows {sym.get('eyebrows', 0):.0f}, "
                  f"nose {sym.get('nose', 0):.0f}, mouth {sym.get('mouth', 0):.0f}. "
                  f"The {area_names[loc][weakest_area[0]]} area can be optimized with makeup techniques.",
        }[loc],
    })

    # 3. Photo Angle Expanded
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    insights.append({
        "type": "photo_angle_expanded",
        "title": {"zh-CN": "拍照指南详解", "en": "Photo Guide Extended"}[loc],
        "brief": {
            "zh-CN": f"根据你的{_GENE_TRAITS['zh-CN']['face_shape'].get(face_sid, '脸型')}，有多种拍照技巧可以尝试",
            "en": f"Multiple photo techniques suit your {face_sid} face shape",
        }[loc],
        "detail": {
            "zh-CN": "近距离自拍时，手机略高于眼睛水平线15度；合照时，站在略靠后的位置让脸部比例更自然；"
                     "室内柔和的侧光最能突出你的面部轮廓。",
            "en": "For selfies, hold the phone ~15 degrees above eye level; in group photos, stand slightly back "
                  "for natural proportions; soft side lighting indoors best highlights your contours.",
        }[loc],
    })

    # 4. Uniqueness
    dim_map = {d["id"]: d for d in dimensions}
    refinement = dim_map.get("feature_refinement", {}).get("score", 70)
    harmony = dim_map.get("feature_harmony", {}).get("score", 70)
    insights.append({
        "type": "uniqueness",
        "title": {"zh-CN": "面部辨识度", "en": "Facial Distinctiveness"}[loc],
        "brief": {
            "zh-CN": f"特征精致度{refinement}分，五官协调性{harmony}分",
            "en": f"Feature refinement {refinement}, feature harmony {harmony}",
        }[loc],
        "detail": {
            "zh-CN": "高辨识度意味着你的五官有鲜明的个人特色。在美学上，独特性和协调性同等重要——"
                     "你的面部特征组合创造了独一无二的视觉印象。",
            "en": "High distinctiveness means your features have clear personal character. "
                  "In aesthetics, uniqueness and harmony are equally important -- "
                  "your facial combination creates a one-of-a-kind visual impression.",
        }[loc],
    })

    # 5. Proportion Map
    whr = raw.get("face_width_height_ratio", 0.76)
    nose_len = raw.get("nose_length_ratio", 0.33)
    mouth_wr = raw.get("mouth_width_ratio", 0.40)
    insights.append({
        "type": "proportion_map",
        "title": {"zh-CN": "比例全景", "en": "Proportion Overview"}[loc],
        "brief": {
            "zh-CN": f"面宽比{whr:.2f}（理想0.76），鼻长比{nose_len:.2f}（理想0.34）",
            "en": f"Face width ratio {whr:.2f} (ideal 0.76), nose length ratio {nose_len:.2f} (ideal 0.34)",
        }[loc],
        "detail": {
            "zh-CN": f"面部宽高比{whr:.3f}、鼻长比{nose_len:.3f}、唇宽比{mouth_wr:.3f}、"
                     f"眼间距比{raw.get('inter_eye_distance_ratio', 1.0):.2f}。"
                     f"这些数据为个性化的修容和发型推荐提供了精确依据。",
            "en": f"Width-height {whr:.3f}, nose length {nose_len:.3f}, mouth width {mouth_wr:.3f}, "
                  f"inter-eye {raw.get('inter_eye_distance_ratio', 1.0):.2f}. "
                  f"These metrics inform personalized contouring and hairstyle recommendations.",
        }[loc],
    })

    return insights


# ---------------------------------------------------------------------------
# Development utility: Monte-Carlo percentile calibration
# ---------------------------------------------------------------------------

def calibrate_percentile_params(n: int = 50_000) -> dict[str, tuple[float, float]]:
    """Simulate scoring formulas with anthropometric input distributions.

    Run this offline to re-derive ``_PERCENTILE_PARAMS`` when scoring formulas
    change.  Replace the constant dict with the printed output.

    Input distributions are based on anthropometric literature:
    - Three courts: Dirichlet(alpha=25) -> sigma ~0.035 per segment
    - Five-eye ratio: Normal(5.0, 0.35)
    - Face WHR: Normal(0.76, 0.055)
    - Symmetry overall: Normal(82, 7), clipped to [40, 100]
    - Confidence per feature: Beta(3, 3) -> mean=0.5, range [0.15, 0.85]
    - Jaw sharpness: Normal(0.55, 0.12)
    - Cheekbone ratio: Normal(0.76, 0.08)
    - Mountain balance: Beta(5, 4) -> mean ~0.56
    - Nose bridge straightness: Beta(4, 3) -> mean ~0.57
    - Nose length ratio: Normal(0.33, 0.04)
    - Forehead height ratio: Normal(0.33, 0.04)
    - Eyebrow length ratio: Normal(1.15, 0.15)
    - Nose width ratio: Normal(0.25, 0.04)
    - Mouth width ratio: Normal(0.40, 0.04)
    - Lip thickness ratio: Normal(0.90, 0.20)
    - Mouth corner angle: Normal(1.0, 3.0)

    Returns dict mapping dimension id -> (mean, std).
    """
    import random

    def prox(value: float, ideal: float, sigma: float) -> float:
        return math.exp(-0.5 * ((value - ideal) / sigma) ** 2)

    def clip(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
        return max(lo, min(hi, v))

    # Face-jaw compat average (uniform draw from the lookup table values)
    compat_values = list({
        95, 85, 80, 70, 75, 85, 80, 60, 55, 60,
        85, 80, 75, 70, 55, 90, 80, 75, 60, 55,
        90, 80, 85, 60, 55, 80, 75, 70, 60, 65,
        80, 75, 70, 65, 55,
    })

    dims_accum: dict[str, list[float]] = {
        "proportion_harmony": [], "symmetry": [], "feature_refinement": [],
        "contour_definition": [], "facial_dimensionality": [], "feature_harmony": [],
        "age_defying": [], "distinctiveness": [], "photogenic": [], "approachability": [],
    }

    for _ in range(n):
        # -- Proportion Harmony inputs --
        courts = [random.gammavariate(25, 1) for _ in range(3)]
        total = sum(courts)
        courts = [c / total for c in courts]
        court_dev = max(abs(c - 0.333) for c in courts)
        court_s = clip(100 - court_dev * 350)
        five_r = random.gauss(5.0, 0.35)
        eyes_s = clip(100 - abs(five_r - 5.0) * 35)
        whr = random.gauss(0.76, 0.055)
        whr_s = clip(100 - abs(whr - 0.76) * 180)
        prop = int(court_s * 0.4 + eyes_s * 0.35 + whr_s * 0.25)
        dims_accum["proportion_harmony"].append(clip(prop))

        # -- Symmetry --
        sym = clip(random.gauss(82, 7), 40, 100)
        dims_accum["symmetry"].append(sym)

        # -- Feature Refinement --
        confs = [random.betavariate(3, 3) for _ in range(7)]
        refine = int(sum(confs) / 7 * 100)
        dims_accum["feature_refinement"].append(clip(refine))

        # -- Contour Definition --
        jaw_sh = random.gauss(0.55, 0.12)
        jaw_s = prox(jaw_sh, 0.65, 0.15) * 100
        cheek_r = random.gauss(0.76, 0.08)
        cheek_s = prox(cheek_r, 0.80, 0.10) * 100
        contour = int(jaw_s * 0.5 + cheek_s * 0.5)
        dims_accum["contour_definition"].append(clip(contour))

        # -- Facial Dimensionality --
        mt_bal = random.betavariate(5, 4)
        bridge = random.betavariate(4, 3)
        nose_len = random.gauss(0.33, 0.04)
        fh_ratio = random.gauss(0.33, 0.04)
        dim_s = int(mt_bal * 100 * 0.3 + bridge * 100 * 0.3
                    + prox(nose_len, 0.34, 0.06) * 100 * 0.2
                    + prox(fh_ratio, 0.33, 0.06) * 100 * 0.2)
        dims_accum["facial_dimensionality"].append(clip(dim_s))

        # -- Feature Harmony --
        brow_len = random.gauss(1.15, 0.15)
        r1 = prox(brow_len, 1.2, 0.25) * 100
        nose_wr = random.gauss(0.25, 0.04)
        mouth_wr = max(0.15, random.gauss(0.40, 0.04))
        r2 = prox(nose_wr / mouth_wr, 0.67, 0.12) * 100
        r3 = random.choice(compat_values)
        r4 = prox(fh_ratio, 0.33, 0.06) * 100
        lip_r = random.gauss(0.90, 0.20)
        r5 = prox(lip_r, 0.85, 0.20) * 100
        harmony = int(r1 * 0.20 + r2 * 0.20 + r3 * 0.25 + r4 * 0.15 + r5 * 0.20)
        dims_accum["feature_harmony"].append(clip(harmony))

        # -- Fun: Age Defying --
        fullness = prox(whr, 0.78, 0.08) * 100
        mid_bal = prox(courts[1], 0.333, 0.04) * 100
        avg_prom = random.betavariate(5, 4)
        age_raw = int(fullness * 0.4 + mid_bal * 0.3 + avg_prom * 100 * 0.3)
        dims_accum["age_defying"].append(clip(age_raw))

        # -- Fun: Distinctiveness --
        devs = [abs(c - 0.5) * 2 for c in confs]
        dist_raw = int(sum(devs) / len(devs) * 100)
        dims_accum["distinctiveness"].append(clip(dist_raw))

        # -- Fun: Photogenic --
        photo_raw = int(sym * 0.55 + prop * 0.45)
        dims_accum["photogenic"].append(clip(photo_raw))

        # -- Fun: Approachability --
        corner = random.gauss(1.0, 3.0)
        corner_s = clip(50 + corner * 5)
        eye_soft = random.choice([90, 80, 70, 55, 50])
        face_soft = random.choice([90, 80, 70, 65, 55, 55, 50])
        appr = int(corner_s * 0.4 + eye_soft * 0.3 + face_soft * 0.3)
        dims_accum["approachability"].append(clip(appr))

    result = {}
    for dim_id, values in dims_accum.items():
        m = sum(values) / len(values)
        variance = sum((v - m) ** 2 for v in values) / len(values)
        s = variance ** 0.5
        result[dim_id] = (round(m, 1), round(s, 1))

    return result
