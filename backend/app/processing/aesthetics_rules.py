"""Aesthetics recommendation engine for FaceMap.

Pure computation module -- no I/O, no network, no database.
All functions accept the `features` dict produced by extract_features().
"""

from __future__ import annotations

import hashlib
import math
from typing import Any


def _pick(variants: list | tuple, *keys: str):
    """Deterministically select a variant based on feature combination.

    Uses MD5 hash for cross-process stability (Python hash() is randomized).
    Same feature keys always produce the same variant.
    """
    seed = hashlib.md5("".join(keys).encode()).digest()
    return variants[seed[0] % len(variants)]

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_AVG_IPD_MM = 63.0  # Average inter-pupillary distance (mm)

# Per-dimension percentile distribution parameters (mean, std).
# Derived via Monte-Carlo simulation of each scoring formula with
# anthropometric input distributions (see `calibrate_percentile_params()`).
# Recalibrate when scoring formulas change or when real user data is available.
# Calibrated via Monte-Carlo with realistic anthropometric distributions.
# Run calibration script after changing scoring formulas.
# Calibrated via Monte-Carlo with realistic anthropometric distributions.
# Widened stds where no real population data exists (conservative estimates).
_PERCENTILE_PARAMS: dict[str, tuple[float, float]] = {
    "proportion_harmony":    (73.6, 12.5),
    "symmetry":              (78.9, 8.9),
    "feature_refinement":    (75.7, 9.1),
    "contour_definition":    (69.9, 19.6),
    "facial_dimensionality": (66.4, 8.9),
    "feature_harmony":       (67.0, 11.4),
    # Fun indices
    "age_defying":           (66.7, 11.4),
    "distinctiveness":       (74.5, 6.5),
    "photogenic":            (74.3, 7.5),
    "approachability":       (67.3, 7.0),
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

# Tiered descriptions for each dimension. Each tier has 2+ variants.
# These give the radar chart dimension scores a conversational voice.
_DIM_DESC: dict[str, dict[str, dict[str, list[str]]]] = {
    "proportion_harmony": {
        "zh-CN": {
            "high": [
                "三庭五眼的比例几乎教科书级别——面部各区域分配均匀，看起来特别舒展。",
                "面部比例很匀称，上中下三部分节奏刚好，不会让人觉得哪里'多了'或'少了'。",
            ],
            "mid": [
                "整体比例不错，大的框架是协调的。小的偏差反而给了你一些个性——比'完美标准'有趣。",
                "面部比例中上水准——不是严格的黄金分割，但人眼看着舒服，这就够了。",
            ],
            "low": [
                "比例有自己的个性——不走'标准美'路线，但辨识度反而更高。造型可以帮你扬长避短。",
                "面部比例不算常规，不过这也正是你长得'不像别人'的原因。用发型和修容来平衡就好。",
            ],
        },
        "en": {
            "high": [
                "Near-textbook facial proportions -- each zone gets a fair share, and the face reads as open and balanced.",
                "The proportions are notably even: upper, middle, and lower face all flow naturally without anything feeling 'too much' or 'too little.'",
            ],
            "mid": [
                "Overall proportions are solid -- the framework is balanced. Minor deviations give you character over 'perfect standard.'",
                "Above-average proportional balance. Not clinical golden-ratio territory, but it looks right to the eye -- that's what matters.",
            ],
            "low": [
                "Proportions have their own personality -- they don't follow the 'standard beauty' playbook, but that's exactly why you're more recognizable. Styling can work wonders.",
                "Facial proportions aren't textbook, but that's precisely what makes you look like no one else. Hairstyle and contouring can balance things easily.",
            ],
        },
    },
    "symmetry": {
        "zh-CN": {
            "high": [
                "左右脸的匹配度很高——五官位置、大小都高度一致，拍照时正面侧面都扛得住。",
                "面部均衡感出色，左右几乎镜像。这种对称在镜头前是一种安静但强大的优势。",
            ],
            "mid": [
                "对称性中上——有轻微的左右差异，但整体看着是协调的。这种程度的不对称完全在正常范围内。",
                "左右不完全镜像，但整体和谐度不错。比起完美对称，这种'有呼吸感'的脸反而更耐看。",
            ],
            "low": [
                "左右差异比较明显——不过这也意味着你的脸比'标准脸'更有辨识度。找到你更好的角度是关键。",
                "对称度不是你的强项，但性格和记忆点才是。很多有魅力的脸都不对称，关键在于风格自信。",
            ],
        },
        "en": {
            "high": [
                "Left-right alignment is excellent -- features match up in both size and position. Looks great from any angle.",
                "Outstanding facial balance, nearly a mirror image. This symmetry is a quiet but powerful camera advantage.",
            ],
            "mid": [
                "Symmetry is above average -- slight left-right differences exist, but the overall impression is balanced. Perfectly normal range.",
                "Not a perfect mirror, but the harmony holds. Faces with this kind of 'breathing room' often look more interesting than textbook-symmetric ones.",
            ],
            "low": [
                "Left-right differences are noticeable -- but that also makes your face more distinctive than a 'standard' one. Finding your best angle is key.",
                "Symmetry isn't your strongest suit, but personality and memorability are. Many charismatic faces are asymmetric -- it's about owning the style.",
            ],
        },
    },
    "feature_refinement": {
        "zh-CN": {
            "high": [
                "五官的精致度很高——每个部位的比例都接近审美理想值，组合在一起有一种'刚刚好'的精致感。",
                "鼻唇眼眉的各项比例都很到位，像是被精心调校过。这种精致感是天生的底子。",
            ],
            "mid": [
                "五官比例整体不错，有几个部位特别出彩，有几个更偏'自然派'。这种mix反而比全精致更有亲和力。",
                "精致度中上——不是每个比例都精准，但有自己的好看法则。不需要面面俱到才叫精致。",
            ],
            "low": [
                "五官走的是'个性路线'而非'精致路线'——比例上不追求完美，但辨识度和记忆点更强。",
                "精致度不算最高，不过这意味着你的脸更有故事感。比千篇一律的'精致脸'有看头多了。",
            ],
        },
        "en": {
            "high": [
                "Feature refinement is excellent -- each element sits close to its aesthetic ideal, and together they create a precisely calibrated look.",
                "Nose, lips, eyes, brows -- the ratios all line up well. This level of refinement is a natural gift.",
            ],
            "mid": [
                "Overall feature ratios are solid, with some parts shining brighter than others. This mix of polished and natural is actually more approachable than all-around perfection.",
                "Refinement is above average -- not every ratio is textbook, but you have your own beauty logic. Refinement doesn't require perfection across the board.",
            ],
            "low": [
                "Your features follow a 'character' rather than 'refinement' path -- not chasing perfect ratios, but higher in distinctiveness and memorability.",
                "Refinement isn't the headline, but that means your face has more narrative. Far more interesting than cookie-cutter 'polished' faces.",
            ],
        },
    },
    "contour_definition": {
        "zh-CN": {
            "high": [
                "面部轮廓线条锐利清晰——颌线和颧骨的存在感让你的脸很'立体'，拍照时光影效果特别好。",
                "骨骼轮廓感很强，面部的线条干净利落。这种轮廓清晰度意味着你不怎么需要修容就能有立体效果。",
            ],
            "mid": [
                "轮廓线条中等偏好——不算特别棱角分明，但也不模糊。这种适中的清晰度其实是最'不挑风格'的。",
                "面部轮廓既不太锐利也不太柔和，属于百搭型。修容可以让你在两个方向自由切换。",
            ],
            "low": [
                "轮廓线条偏柔和，骨骼存在感不那么强——不过柔和的轮廓天然显年轻、显亲切。修容就是你的好朋友。",
                "面部线条圆润柔和，不走'骨骼感'路线。好处是抗老和亲和力都是加分项，修容则可以按需制造轮廓感。",
            ],
        },
        "en": {
            "high": [
                "Facial contours are sharp and defined -- jawline and cheekbones have real presence, making your face look sculpted. Photographs beautifully with natural shadows.",
                "Strong skeletal definition with clean, crisp lines. This contour clarity means you barely need contouring for a 3D effect.",
            ],
            "mid": [
                "Contour definition is in the sweet spot -- not angular, not soft. This moderate clarity is actually the most versatile for any style.",
                "Neither too sharp nor too rounded -- a versatile range where contouring can take you in either direction at will.",
            ],
            "low": [
                "Softer contour lines with less bony prominence -- the upside is that soft contours naturally look younger and more approachable. Contouring is your best friend.",
                "Rounded, gentle facial lines rather than angular bone structure. The trade-off: anti-aging advantage and warmth. Contouring can sculpt definition when you want it.",
            ],
        },
    },
    "facial_dimensionality": {
        "zh-CN": {
            "high": [
                "面部立体感很强——五岳（额、鼻、颧、颌）的高低起伏明显，侧面轮廓很有层次。这种三维感在镜头前尤其加分。",
                "从侧面看，面部的纵深感很好——鼻梁的支撑、额骨的饱满、颌线的走势都在制造立体效果。",
            ],
            "mid": [
                "立体感中等偏上——面部有一定的纵深，但不算特别'凸'。正面看很和谐，侧面可以通过高光+阴影来增强层次。",
                "面部的三维感不错，各山丘有一定高度但不夸张。这种中等立体度其实最百搭，不挑光线不挑角度。",
            ],
            "low": [
                "面部偏平面化——五官的前后层次不太明显。不过平面感强的脸在正面照片里反而很上镜，而且修容效果会特别显著。",
                "立体感不算突出，面部结构偏平。好消息是：修容对你的效果比立体脸更明显——一点高光和阴影就能制造很大的变化。",
            ],
        },
        "en": {
            "high": [
                "Strong facial dimensionality -- the peaks and valleys (forehead, nose, cheekbones, jaw) create clear depth. The side profile is especially striking.",
                "Excellent depth from the side -- nasal bridge support, forehead fullness, and jawline trajectory all contribute to a sculpted 3D effect.",
            ],
            "mid": [
                "Moderate dimensionality -- there's decent depth, but it's not dramatically projected. Looks harmonious straight-on; highlight + shadow can boost the profile.",
                "Facial 3D structure is respectable without being exaggerated. This middle ground is actually the most forgiving for any lighting or angle.",
            ],
            "low": [
                "The face is relatively flat in projection -- front-to-back depth isn't dramatic. The upside: flat faces are often very photogenic straight-on, and contouring yields dramatic results.",
                "Dimensionality is on the lower side. Good news: contouring has a bigger payoff on flatter faces -- a little highlight and shadow go a long way.",
            ],
        },
    },
    "feature_harmony": {
        "zh-CN": {
            "high": [
                "五官之间的搭配很默契——眉眼鼻唇的比例关系、脸型和颌线的配合度都很高。这种整体协调感让你的脸'读'起来很流畅。",
                "各五官单独看不一定最极致，但放在一起的化学反应很好——就像乐队成员各自不是顶级但合奏出彩。",
            ],
            "mid": [
                "五官协调性中上——大多数组合都很和谐，个别搭配有一点小摩擦，但不影响整体观感。有点像穿搭里的'混搭风'。",
                "整体搭配不错，有些部位之间的呼应关系比另一些更好。这种'不完全统一'的感觉反而比全套matched更有看点。",
            ],
            "low": [
                "五官各有个性——单看都有亮点，但放在一起不是传统的'协调'路线。不过这恰好意味着你的脸更不容易跟别人撞。",
                "五官之间有一些'碰撞感'——不是坏事，很多有辨识度的脸就是靠这种不按常理的搭配出圈的。",
            ],
        },
        "en": {
            "high": [
                "Features complement each other beautifully -- brow-eye-nose-lip ratios and face-jaw compatibility are all high. The face 'reads' smoothly as a whole.",
                "Individually, no single feature needs to be extreme -- but together the chemistry is excellent, like a band where every member makes the group better.",
            ],
            "mid": [
                "Feature harmony is above average -- most pairings work well, with minor friction here and there that doesn't hurt the overall impression. Think 'eclectic' rather than 'uniform.'",
                "Overall coordination is solid, with some feature relationships stronger than others. This 'not-quite-matching' feel can actually be more interesting than full uniformity.",
            ],
            "low": [
                "Each feature has personality on its own -- together they don't follow a conventional 'harmony' script. But that's exactly why your face is harder to confuse with someone else's.",
                "There's some 'collision' between features -- not a bad thing. Many of the most distinctive faces break the conventional harmony rules.",
            ],
        },
    },
}

_FUN_INDEX_LABELS = {
    "age_defying": {"zh-CN": "冻龄指数", "en": "Age-Defying Index"},
    "distinctiveness": {"zh-CN": "辨识度指数", "en": "Distinctiveness Index"},
    "photogenic": {"zh-CN": "上镜指数", "en": "Photogenic Index"},
    "approachability": {"zh-CN": "亲和力指数", "en": "Approachability Index"},
}

_FUN_INDEX_DESC: dict[str, dict[str, dict[str, list[str]]]] = {
    "age_defying": {
        "zh-CN": {
            "high": [
                "时光对你格外温柔——面部轮廓的饱满度和匀称感让你看起来比同龄人年轻，冻龄指数超过了{pct}%的人。",
                "你的面部结构有天然的抗老优势：对称性高、轮廓饱满，冻龄表现超过了{pct}%的同龄人。",
            ],
            "mid": [
                "面部轮廓保持得不错，冻龄表现中上，超过了{pct}%的同龄人。不过冻龄最大的秘诀还是防晒和心态。",
                "冻龄指数超过了{pct}%的同龄人——面部的匀称度是你的加分项。日常防晒能让这个优势保持更久。",
            ],
            "low": [
                "冻龄指数不是你的强项——但话说回来，辨识度和个性才是你的资产，比千篇一律的'冻龄脸'有趣多了。",
                "冻龄指数排在前{inv_pct}%，不过面部的个人特色远比'看起来年轻'有价值。做好防晒就是最好的冻龄方案。",
            ],
        },
        "en": {
            "high": [
                "Time has been kind -- facial fullness and symmetry make you look younger than your peers. Age-defying index tops {pct}%.",
                "Your facial structure has natural anti-aging advantages: high symmetry, full contours. Age-defying performance exceeds {pct}% of peers.",
            ],
            "mid": [
                "Facial contours are holding up well -- age-defying index exceeds {pct}% of peers. The real secret? Sunscreen and mindset.",
                "Age-defying index tops {pct}% -- your facial balance is the key contributor. Consistent sun protection keeps this advantage going.",
            ],
            "low": [
                "Age-defying isn't your strongest suit -- but distinctiveness and character are your real assets, far more interesting than a generic 'youthful' face.",
                "Age-defying index is in the top {inv_pct}% range, but personal character is worth more than 'looking young.' Sunscreen is still the best anti-aging move.",
            ],
        },
    },
    "distinctiveness": {
        "zh-CN": {
            "high": [
                "你的五官组合辨识度极高——在人群中属于一眼就能被认出的类型，超过了{pct}%的人。",
                "面部特征个性鲜明，特征的'纯度'很高，辨识度超过了{pct}%的人。这种独特性是天生的，别人学不来。",
            ],
            "mid": [
                "五官有自己的特色，辨识度超过了{pct}%的人。通过造型强化亮点特征可以进一步提升记忆度。",
                "辨识度表现中上，超过了{pct}%的人——你的五官不算'大众脸'，有自己的记忆点。",
            ],
            "low": [
                "你的五官搭配偏向'和谐均衡型'而非'个性突出型'——辨识度排在前{inv_pct}%。不过和谐本身就是一种稀缺的美。",
                "辨识度不算最高，但'和谐'和'个性'是两种不同的美学方向——你在前者上得分更高。",
            ],
        },
        "en": {
            "high": [
                "Your feature combination is extremely distinctive -- the kind recognized instantly in a crowd. Tops {pct}%.",
                "Facial features have strong character with high 'purity' -- distinctiveness exceeds {pct}%. This uniqueness is innate.",
            ],
            "mid": [
                "Your features have their own character, ranking above {pct}% in distinctiveness. Emphasizing highlights through styling boosts memorability.",
                "Distinctiveness is above average at {pct}% -- your face has its own signature, not a 'generic' look.",
            ],
            "low": [
                "Your features lean 'harmoniously balanced' rather than 'standout individual' -- top {inv_pct}%. But harmony itself is a rare beauty.",
                "Distinctiveness isn't the highest, but 'harmony' and 'individuality' are two different aesthetic paths -- you score higher on the former.",
            ],
        },
    },
    "photogenic": {
        "zh-CN": {
            "high": [
                "你的面部比例和对称性天然适合镜头——上镜指数超过了{pct}%的人。拍照时不用想太多，自然表情就很好看。",
                "镜头前是你的主场——面部比例协调、对称性高，上镜指数超过了{pct}%的人。不用修图也能打。",
            ],
            "mid": [
                "上镜指数超过了{pct}%的人，面部比例在镜头前表现不错。找到最佳角度会让效果再上一个台阶。",
                "面部比例和对称性中上水准，上镜指数超过了{pct}%的人。掌握好光线和角度，效果会比肉眼更好。",
            ],
            "low": [
                "上镜指数不算最高——但很多好看的脸拍照不一定上镜，这和面部结构的'平面化'程度有关。多试试不同角度。",
                "上镜指数排在前{inv_pct}%——'不上镜'和'不好看'完全是两回事。三维的魅力未必能被照片捕捉到。",
            ],
        },
        "en": {
            "high": [
                "Your proportions and symmetry are naturally camera-ready -- photogenic index tops {pct}%. Just be yourself; it works.",
                "The camera loves you -- balanced proportions, high symmetry. Photogenic index exceeds {pct}%. Great even without retouching.",
            ],
            "mid": [
                "Photogenic index tops {pct}% -- your proportions perform well on camera. Finding your best angle would push it further.",
                "Facial balance is above average, photogenic index exceeds {pct}%. Master lighting and angles for even better results.",
            ],
            "low": [
                "Photogenic index isn't the highest -- many attractive faces don't photograph well. It's about how 3D features flatten. Experiment with angles.",
                "Photogenic index is in the top {inv_pct}% -- 'not photogenic' and 'not attractive' are very different things. Try different angles.",
            ],
        },
    },
    "approachability": {
        "zh-CN": {
            "high": [
                "你的面部特征组合天然让人觉得亲切——嘴角弧度、眼神柔和度都在加分，亲和力超过了{pct}%的人。",
                "亲和力超过了{pct}%——你的五官传达出温暖和善意，这种'好相处'的感觉是天生的社交资本。",
            ],
            "mid": [
                "亲和力超过了{pct}%的人，面部整体给人中性偏友善的感觉。微笑的时候亲和力会大幅提升。",
                "面部传达的亲和感超过了{pct}%的人——不算最'暖'，但也不冷。恰好的距离感也是一种魅力。",
            ],
            "low": [
                "亲和力不是你面部的主打——但'不好惹'的气场也是一种稀缺特质，比'好说话'酷多了。",
                "亲和力指数偏低，但这恰好是'距离感美学'——清冷比甜美更难得。微笑时的反差感会是你的杀手锏。",
            ],
        },
        "en": {
            "high": [
                "Your features naturally read as warm -- mouth curve and eye softness both add points. Approachability tops {pct}%.",
                "Approachability exceeds {pct}% -- your features project warmth and goodwill. 'Easy to be around' is innate social capital.",
            ],
            "mid": [
                "Approachability tops {pct}% -- the overall impression is neutral-to-friendly. A smile kicks it up significantly.",
                "Approachability above {pct}% -- not the warmest, but definitely not cold. The right amount of distance has its own charm.",
            ],
            "low": [
                "Approachability isn't your main trait -- but a 'don't mess with me' aura is rare and cooler than 'easygoing.'",
                "Approachability runs lower, meaning your face has 'distant beauty' -- cool reads as more elevated. Your smile contrast is a secret weapon.",
            ],
        },
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
    # Gaussian instead of linear cliff: smooth decay, no hard zero.
    # σ=0.08 accounts for MediaPipe landmark 10 not being the true hairline.
    court_s = _proximity(court_dev, 0, 0.08) * 100
    five_ratio = features.get("five_eyes", {}).get("ratio", 5.0)
    eyes_s = _proximity(five_ratio, 5.0, 0.8) * 100
    whr = raw.get("face_width_height_ratio", 0.76)
    whr_s = _proximity(whr, 0.76, 0.12) * 100
    proportion_raw = int(court_s * 0.4 + eyes_s * 0.35 + whr_s * 0.25)

    # -- Symmetry --
    symmetry_raw = int(features.get("symmetry", {}).get("overall_score", 75))

    # -- Feature Refinement --
    # How close key facial ratios are to their ideal values.
    # Each sub-score uses Gaussian proximity with the same sigma as the
    # corresponding dimension, ensuring consistent sensitivity.
    _ref_nose = _proximity(raw.get("nose_length_ratio", 0.19), 0.19, 0.05)
    _ref_inter = _proximity(raw.get("inter_eye_distance_ratio", 1.0), 1.0, 0.25)
    _ref_lip = _proximity(raw.get("lip_thickness_ratio", 1.0), 0.68, 0.22)
    _ref_mouth = _proximity(raw.get("mouth_width_ratio", 0.40), 0.40, 0.10)
    _ref_eye = _proximity(raw.get("eye_width_height_ratio_avg", 3.0), 2.8, 0.8)
    _ref_brow = _proximity(raw.get("eyebrow_arch_ratio", 0.15), 0.16, 0.08)
    _ref_face = _proximity(whr, 0.76, 0.12)
    refinement_raw = int((_ref_nose * 0.20 + _ref_inter * 0.15 + _ref_lip * 0.15
                          + _ref_mouth * 0.15 + _ref_eye * 0.15 + _ref_brow * 0.10
                          + _ref_face * 0.10) * 100)

    # -- Contour Definition --
    jaw_sharpness = raw.get("jaw_angle_sharpness", 0.5)
    jaw_s = _proximity(jaw_sharpness, 0.65, 0.10) * 100
    cheek_ratio = features.get("face_shape", {}).get("cheekbone_width_ratio", 0.75)
    cheek_s = _proximity(cheek_ratio, 0.80, 0.10) * 100
    contour_raw = int(jaw_s * 0.5 + cheek_s * 0.5)

    # -- Facial Dimensionality --
    mountains = features.get("five_mountains", {})
    mountain_balance = mountains.get("balance", 0.5)
    bridge_straight = raw.get("nose_bridge_straightness", 0.5)
    nose_len = raw.get("nose_length_ratio", 0.19)
    forehead_hr = raw.get("forehead_height_ratio", 0.33)
    dim_mountain = mountain_balance * 100
    dim_bridge = bridge_straight * 100
    dim_nose = _proximity(nose_len, 0.19, 0.04) * 100
    dim_forehead = _proximity(forehead_hr, 0.33, 0.06) * 100
    dimensionality_raw = int(dim_mountain * 0.3 + dim_bridge * 0.3 + dim_nose * 0.2 + dim_forehead * 0.2)

    # -- Feature Harmony (5 cross-feature rules) --
    inter_eye = raw.get("inter_eye_distance_ratio", 1.0)
    nose_wr = raw.get("nose_width_ratio", 0.25)
    mouth_wr = raw.get("mouth_width_ratio", 0.40)
    lip_ratio = raw.get("lip_thickness_ratio", 1.0)
    brow_arch = raw.get("eyebrow_arch_ratio", 0.15)
    brow_len = raw.get("eyebrow_length_ratio", 1.0)

    # Rule 1: Eyebrow baseline span / eye width ratio (ideal ~1.55)
    eye_whr_avg = raw.get("eye_width_height_ratio_avg", 3.0)
    r1 = _proximity(brow_len, 1.55, 0.25) * 100

    # Rule 2: Nose width / mouth width ratio (ideal ~0.67)
    nose_mouth = nose_wr / mouth_wr if mouth_wr > 0 else 0.67
    r2 = _proximity(nose_mouth, 0.67, 0.12) * 100

    # Rule 3: Face-jaw shape compatibility
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    jaw_sid = features.get("jawline", {}).get("shape_id", "moderate")
    r3 = _face_jaw_compat(face_sid, jaw_sid)

    # Rule 4: Inter-eye distance ratio (ideal ~1.0 eye width)
    r4 = _proximity(inter_eye, 1.0, 0.15) * 100

    # Rule 5: Lip ratio (upper/lower). Golden ratio ≈ 1:1.6 → 0.625.
    # Slightly higher to include Asian aesthetic preference for fuller lower lip.
    r5 = _proximity(lip_ratio, 0.68, 0.22) * 100

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
            {"key": "nose_length", "value": round(raw.get("nose_length_ratio", 0), 3), "ideal": 0.19},
            {"key": "eye_whr", "value": round(raw.get("eye_width_height_ratio_avg", 0), 2), "ideal": 2.8},
            {"key": "lip_ratio", "value": round(raw.get("lip_thickness_ratio", 0), 3), "ideal": 0.68},
            {"key": "face_whr", "value": round(whr, 3), "ideal": 0.76},
        ]),
        ("contour_definition", contour_raw, [
            {"key": "jaw_sharpness", "value": round(jaw_sharpness, 3), "ideal": 0.65},
            {"key": "cheekbone_ratio", "value": round(cheek_ratio, 3), "ideal": 0.80},
        ]),
        ("facial_dimensionality", dimensionality_raw, [
            {"key": "mountain_balance", "value": round(mountain_balance, 3)},
            {"key": "nose_bridge_straightness", "value": round(bridge_straight, 3)},
            {"key": "nose_length_ratio", "value": round(nose_len, 3), "ideal": 0.19},
            {"key": "forehead_height_ratio", "value": round(forehead_hr, 3), "ideal": 0.33},
        ]),
        ("feature_harmony", harmony_raw, [
            {"key": "brow_length_ratio", "value": round(brow_len, 3), "ideal": 1.55},
            {"key": "nose_mouth_ratio", "value": round(nose_mouth, 3), "ideal": 0.67},
            {"key": "face_jaw_compat", "value": face_sid + "/" + jaw_sid},
            {"key": "inter_eye_distance", "value": round(inter_eye, 3), "ideal": 1.0},
            {"key": "lip_ratio", "value": round(lip_ratio, 3), "ideal": 0.68},
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

    # Build seed for deterministic variant selection
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    eye_sid = features.get("eyes", {}).get("shape_id", "almond")

    dims = []
    for dim_id, raw_score, basis in dim_entries:
        clamped = max(0, min(100, raw_score))
        pct = _dim_percentile(clamped, dim_id)
        # Pick tiered description
        dim_desc_data = _DIM_DESC.get(dim_id, {}).get(locale, _DIM_DESC.get(dim_id, {}).get("zh-CN", {}))
        tier = "high" if pct >= 70 else ("mid" if pct >= 40 else "low")
        desc_variants = dim_desc_data.get(tier, [""])
        dim_description = _pick(desc_variants, dim_id, face_sid, eye_sid) if desc_variants else ""
        dims.append({
            "id": dim_id,
            "label": _DIM_LABELS[dim_id].get(locale, _DIM_LABELS[dim_id]["zh-CN"]),
            "score": clamped,
            "percentile": pct,
            "description": dim_description,
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

_GENE_CARD_TEMPLATES = {
    "zh-CN": [
        # 1. Impression-first
        "{impression}——这是你的面部给人的核心印象。{face_trait}构建了整体框架，{eye_trait}赋予了神采，而{jaw_trait}恰到好处地收住了节奏。",
        # 2. Eye-first
        "第一眼看你，最先被注意到的是{eye_trait}。配合{face_trait}和{jaw_trait}，{impression}的气质浑然天成。",
        # 3. Composition
        "{face_trait}是画布，{eye_trait}是焦点，{jaw_trait}是收尾——三者搭配出的{impression}感，辨识度很高。",
        # 4. Contrast
        "{face_trait}给了你柔和的底色，{eye_trait}又加了一笔锐利，{jaw_trait}做了平衡——整体的{impression}有层次感。",
        # 5. Rhythm
        "面部的节奏感不错：{face_trait}定调，{eye_trait}提速，到{jaw_trait}稳稳收住。整体读下来就是{impression}。",
    ],
    "en": [
        "{impression} -- that's the core impression your face gives. {face_trait} builds the frame, {eye_trait} brings it to life, and a {jaw_trait} closes it with just the right rhythm.",
        "The first thing people notice is your {eye_trait}. Paired with {face_trait} and a {jaw_trait}, the {impression} quality comes naturally.",
        "{face_trait} sets the canvas, {eye_trait} draws focus, {jaw_trait} closes the composition -- together they read as distinctly {impression}.",
        "{face_trait} provides a soft foundation, {eye_trait} adds an edge, and a {jaw_trait} balances it out -- the {impression} vibe has real layers.",
        "The face has good rhythm: {face_trait} sets the tone, {eye_trait} picks up the pace, and a {jaw_trait} holds the finish. The overall read: {impression}.",
    ],
}

# Strength observations: weave in top dimension descriptions naturally.
# {h0_desc} and {h1_desc} are the descriptions of the top 2 dimensions.
_STRENGTH_TEMPLATES = {
    "zh-CN": [
        "简单来说，{h0_short}和{h1_short}是你最值得自信的两张牌——打好这两张就够了。",
        "你的底牌很明确：{h0_short}，加上{h1_short}的配合，风格辨识度很高。",
        "优势集中在{h0_short}和{h1_short}上——自信地展示这两点，比什么修饰都有效。",
    ],
    "en": [
        "In a nutshell, {h0_short} and {h1_short} are your two strongest cards -- play them well and you're set.",
        "Your edge is clear: {h0_short}, backed by {h1_short}. High style recognition.",
        "Strengths cluster around {h0_short} and {h1_short} -- showing these off beats any correction.",
    ],
}

# Short observational phrases for each dimension (used in strength templates).
# These replace reading dimension labels like "比例和谐" with actual observations.
_DIM_SHORT: dict[str, dict[str, str]] = {
    "proportion_harmony": {"zh-CN": "比例上的天然优势", "en": "natural proportional balance"},
    "symmetry": {"zh-CN": "出色的面部均衡感", "en": "excellent facial symmetry"},
    "feature_refinement": {"zh-CN": "五官的精致比例", "en": "refined feature proportions"},
    "contour_definition": {"zh-CN": "清晰的轮廓线条", "en": "crisp contour definition"},
    "facial_dimensionality": {"zh-CN": "突出的面部立体感", "en": "strong facial depth"},
    "feature_harmony": {"zh-CN": "五官之间的默契配合", "en": "great inter-feature harmony"},
}


def generate_gene_card(
    features: dict[str, Any],
    dimensions: list[dict[str, Any]],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Generate composite facial personality description with varied narratives."""
    from app.processing.physiognomy_rules import _match_cross_features

    loc = locale if locale in _GENE_TRAITS else "zh-CN"
    traits = _GENE_TRAITS[loc]

    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    eye_sid = features.get("eyes", {}).get("shape_id", "almond")
    jaw_sid = features.get("jawline", {}).get("shape_id", "moderate")
    nose_sid = features.get("nose", {}).get("shape_id", "normal")

    face_trait = traits["face_shape"].get(face_sid, traits["face_shape"]["oval"])
    eye_trait = traits["eyes"].get(eye_sid, traits["eyes"]["almond"])
    jaw_trait = traits["jawline"].get(jaw_sid, traits["jawline"]["moderate"])

    impressions = _IMPRESSIONS.get(loc, _IMPRESSIONS["zh-CN"])
    impression = impressions.get((face_sid, eye_sid))
    if not impression:
        _FALLBACK = {
            "zh-CN": {"oval": "温婉大方", "round": "亲切可爱", "square": "飒爽利落",
                      "heart": "灵巧精致", "diamond": "个性独特", "long": "优雅从容", "pear": "稳重大气"},
            "en": {"oval": "graceful", "round": "charming", "square": "bold",
                   "heart": "delicate", "diamond": "distinctive", "long": "elegant", "pear": "composed"},
        }
        impression = _FALLBACK.get(loc, _FALLBACK["zh-CN"]).get(face_sid, "")

    # Pick narrative template deterministically based on feature combination
    templates = _GENE_CARD_TEMPLATES.get(loc, _GENE_CARD_TEMPLATES["zh-CN"])
    desc = _pick(templates, face_sid, eye_sid, jaw_sid, nose_sid).format(
        face_trait=face_trait,
        eye_trait=eye_trait,
        jaw_trait=jaw_trait,
        impression=impression,
    )

    # Append cross-feature observation if available
    cross_obs = _match_cross_features(features, loc)
    if cross_obs:
        desc = desc + " " + cross_obs[0]

    # Highlights: top 3 dimension labels for pills/tags
    highlights = _compute_highlights(features, dimensions, locale)

    # Strength observation using short dimension descriptions
    sorted_dims = sorted(dimensions, key=lambda d: d["score"], reverse=True)
    if len(sorted_dims) >= 2:
        h0_id = sorted_dims[0]["id"]
        h1_id = sorted_dims[1]["id"]
        h0_short = _DIM_SHORT.get(h0_id, {}).get(loc, sorted_dims[0]["label"])
        h1_short = _DIM_SHORT.get(h1_id, {}).get(loc, sorted_dims[1]["label"])
        strength_templates = _STRENGTH_TEMPLATES.get(loc, _STRENGTH_TEMPLATES["zh-CN"])
        strength = _pick(strength_templates, face_sid, eye_sid, "strength").format(
            h0_short=h0_short, h1_short=h1_short,
        )
        desc = desc + " " + strength

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

    # Age-defying: symmetry + balanced mid-court + mountain prominence.
    # Replaced face WHR (a shape indicator, not youth indicator) with symmetry.
    sym_s = features.get("symmetry", {}).get("overall_score", 75)
    mid_court = features.get("three_courts", {}).get("middle", 0.333)
    mid_balance = _proximity(mid_court, 0.333, 0.04) * 100
    mountains = features.get("five_mountains", {})
    avg_prominence = sum(
        mountains.get(k, {}).get("prominence", 0.5) for k in ("south", "north", "center", "east", "west")
    ) / 5.0
    mountain_s = avg_prominence * 100
    age_raw = int(sym_s * 0.45 + mid_balance * 0.30 + mountain_s * 0.25)
    age_pct = _dim_percentile(age_raw, "age_defying")

    # Distinctiveness: classifier clarity (absolute match quality).
    # Old formula abs(conf-0.5)*2 measured classifier ambiguity (opposite!).
    # High clarity = distinctive, well-defined features.
    clarity_scores = []
    for key in ("face_shape", "eyes", "nose", "mouth", "eyebrows"):
        clarity = features.get(key, {}).get("clarity", 0.5)
        clarity_scores.append(clarity)
    dist_raw = int(sum(clarity_scores) / len(clarity_scores) * 100) if clarity_scores else 50
    dist_pct = _dim_percentile(dist_raw, "distinctiveness")

    # Photogenic: symmetry + proportion harmony + contour definition.
    sym_score = dim_map.get("symmetry", 75)
    prop_score = dim_map.get("proportion_harmony", 70)
    contour_score = dim_map.get("contour_definition", 65)
    photo_raw = int(sym_score * 0.40 + prop_score * 0.35 + contour_score * 0.25)
    photo_pct = _dim_percentile(photo_raw, "photogenic")

    # Approachability: mouth corners + eye shape + face shape
    corner_angle = raw.get("mouth_corner_angle", 0.0)
    # Neutral mouth (0 degrees) should score decently; only strongly
    # downturned mouths should be heavily penalized.
    corner_s = min(100, max(0, 65 + corner_angle * 3))
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

    # Build seed for deterministic variant selection
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    eye_sid_for_seed = features.get("eyes", {}).get("shape_id", "almond")

    result = []
    for idx_id, pct in indices:
        tier = "high" if pct >= 75 else ("mid" if pct >= 40 else "low")
        lang_data = _FUN_INDEX_DESC[idx_id].get(loc, _FUN_INDEX_DESC[idx_id]["zh-CN"])
        variants = lang_data[tier]
        inv_pct = 100 - pct
        desc = _pick(variants, idx_id, face_sid, eye_sid_for_seed).format(
            pct=pct, inv_pct=inv_pct,
        )
        result.append({
            "id": idx_id,
            "label": _FUN_INDEX_LABELS[idx_id].get(loc, _FUN_INDEX_LABELS[idx_id]["zh-CN"]),
            "percentile": pct,
            "description": desc,
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
        "big_smile": [
            "自然大笑的时候是你最有感染力的状态——嘴角自然上扬就好，不用刻意控制幅度。",
            "你的五官组合笑起来很好看，大方地笑就是你的最佳表情。想一件真正开心的事，镜头会替你抓到那个瞬间。",
        ],
        "subtle_smile": [
            "嘴角微微上扬的浅笑最衬你——不用咧嘴，那种'刚想到什么有趣的事'的表情就刚好。",
            "你的五官更适合克制的表情——微笑而非大笑，优雅但不刻意。试试只用嘴角笑、眼神保持放松。",
        ],
        "confident": [
            "自信地直视镜头，嘴角带一点弧度就够了——你的眼型配合这种表情会特别有气场。",
            "表情上不需要'用力'——直视镜头、嘴角微收，让你的眼神来说话。你的五官组合很适合这种'不怒自威'的感觉。",
        ],
        "relaxed": [
            "最自然的状态就是你最好的状态——试试在拍照前深呼吸一次，放松下巴和眉毛，让表情自然流露。",
            "不用找什么特定的表情，放松就好。想想你最舒服的周末午后的感觉，那种松弛感比任何pose都好看。",
        ],
    },
    "en": {
        "big_smile": [
            "Your most infectious moment is a genuine laugh -- just let the corners rise naturally, no need to control the amplitude.",
            "Your feature combo looks great when you smile big. Just think of something genuinely fun and let the camera catch the moment.",
        ],
        "subtle_smile": [
            "A subtle upturn of the corners suits you best -- that 'just thought of something amusing' expression hits perfectly.",
            "Your features favor restraint -- a smile rather than a grin, elegant but not staged. Try smiling with just the corners while keeping your eyes relaxed.",
        ],
        "confident": [
            "Look straight at the camera with a slight curve at the lips -- your eye shape makes this expression particularly commanding.",
            "No need to force anything -- direct eye contact, lips slightly set, let your eyes do the talking. Your features are built for that effortless authority.",
        ],
        "relaxed": [
            "Your best look is your most natural -- try a deep breath before the shot, relax your jaw and brows, and let your expression happen.",
            "Don't hunt for a specific expression, just relax. Think of your most comfortable weekend afternoon -- that ease looks better than any pose.",
        ],
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

    # Build rationale with personality
    face_sid = features.get("face_shape", {}).get("shape_id", "oval")
    if loc == "zh-CN":
        rationale_parts = []
        if best_side != "center":
            side_reasons = [
                f"你的{labels[best_side]}轮廓线条更流畅，眉眼的表现力也更好",
                f"对比下来{labels[best_side]}的骨骼线条和光影层次更出彩",
            ]
            rationale_parts.append(_pick(side_reasons, face_sid, eye_sid, "side"))
        else:
            center_reasons = [
                "你的面部对称度很高，正面就是你的最佳角度——不需要刻意找侧面",
                "正面直拍最能发挥你天然的均衡优势，省去找角度的功夫",
            ]
            rationale_parts.append(_pick(center_reasons, face_sid, eye_sid, "center"))
        if vertical_angle == "slight_down":
            rationale_parts.append("微微俯拍能让上庭和中庭的比例更舒展")
        elif vertical_angle == "slight_up":
            rationale_parts.append("微微仰一点能拉长下半脸的线条，让颌线更好看")
        rationale = "，".join(rationale_parts) + "。"
    else:
        rationale_parts = []
        if best_side != "center":
            side_reasons = [
                f"Your {labels[best_side]} has smoother contours and more expressive brow-eye dynamics",
                f"The {labels[best_side]} shows better bone structure and light-shadow interplay",
            ]
            rationale_parts.append(_pick(side_reasons, face_sid, eye_sid, "side"))
        else:
            center_reasons = [
                "Your symmetry is high enough that a straight-on angle is your best bet -- no need to hunt for a side",
                "A front-facing shot plays to your natural balance -- skip the angle search",
            ]
            rationale_parts.append(_pick(center_reasons, face_sid, eye_sid, "center"))
        if vertical_angle == "slight_down":
            rationale_parts.append("a slight downward angle lets the upper and mid-face proportions breathe")
        elif vertical_angle == "slight_up":
            rationale_parts.append("a slight upward tilt elongates the lower face and flatters the jawline")
        rationale = "; ".join(rationale_parts) + "."

    # Pick expression tip variant
    tip_variants = tips[expression_key]
    expression_tip = _pick(tip_variants, face_sid, eye_sid, "expr")

    return {
        "best_side": best_side,
        "vertical_angle": vertical_angle,
        "expression_tip": expression_tip,
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
    nose_len = raw.get("nose_length_ratio", 0.19)
    mouth_wr = raw.get("mouth_width_ratio", 0.40)
    insights.append({
        "type": "proportion_map",
        "title": {"zh-CN": "比例全景", "en": "Proportion Overview"}[loc],
        "brief": {
            "zh-CN": f"面宽比{whr:.2f}（理想0.76），鼻长比{nose_len:.2f}（理想0.19）",
            "en": f"Face width ratio {whr:.2f} (ideal 0.76), nose length ratio {nose_len:.2f} (ideal 0.19)",
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
    - Eyebrow length ratio (baseline span): Normal(1.55, 0.20)
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
        # -- Proportion Harmony (Gaussian proximity formulas) --
        courts = [random.gammavariate(25, 1) for _ in range(3)]
        total = sum(courts)
        courts = [c / total for c in courts]
        court_dev = max(abs(c - 0.333) for c in courts)
        court_s = prox(court_dev, 0, 0.05) * 100
        five_r = random.gauss(5.0, 0.35)
        eyes_s = prox(five_r, 5.0, 0.8) * 100
        whr = random.gauss(0.76, 0.055)
        whr_s = prox(whr, 0.76, 0.12) * 100
        prop = int(court_s * 0.4 + eyes_s * 0.35 + whr_s * 0.25)
        dims_accum["proportion_harmony"].append(clip(prop))

        # -- Symmetry (3% tolerance, 1.5x penalty) --
        sym = clip(random.gauss(79, 9), 40, 100)
        dims_accum["symmetry"].append(sym)

        # -- Feature Refinement (ideal-proximity aggregate) --
        _s_nose = prox(random.gauss(0.19, 0.03), 0.19, 0.04)
        _s_inter = prox(random.gauss(1.15, 0.15), 1.0, 0.25)
        _s_lip = prox(random.gauss(0.90, 0.20), 0.68, 0.22)
        _s_mouth = prox(max(0.15, random.gauss(0.40, 0.06)), 0.40, 0.08)
        _s_eye = prox(random.gauss(3.0, 0.6), 2.8, 0.8)
        _s_brow = prox(random.gauss(0.15, 0.05), 0.16, 0.06)
        _s_face = prox(whr, 0.76, 0.12)
        refine = int((_s_nose * 0.20 + _s_inter * 0.15 + _s_lip * 0.15
                      + _s_mouth * 0.15 + _s_eye * 0.15 + _s_brow * 0.10
                      + _s_face * 0.10) * 100)
        dims_accum["feature_refinement"].append(clip(refine))

        # -- Contour Definition --
        # jaw_sharpness = chin_width / jaw_width, typical 0.55-0.90
        jaw_sh = random.gauss(0.70, 0.10)
        jaw_s = prox(jaw_sh, 0.65, 0.10) * 100
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
        brow_len = random.gauss(1.55, 0.20)
        r1 = prox(brow_len, 1.55, 0.25) * 100
        nose_wr = random.gauss(0.25, 0.04)
        mouth_wr = max(0.15, random.gauss(0.40, 0.04))
        r2 = prox(nose_wr / mouth_wr, 0.67, 0.12) * 100
        r3 = random.choice(compat_values)
        _inter_eye = random.gauss(1.15, 0.15)
        r4 = prox(_inter_eye, 1.0, 0.15) * 100
        lip_r = random.gauss(0.90, 0.20)
        r5 = prox(lip_r, 0.68, 0.22) * 100
        harmony = int(r1 * 0.20 + r2 * 0.20 + r3 * 0.25 + r4 * 0.15 + r5 * 0.20)
        dims_accum["feature_harmony"].append(clip(harmony))

        # -- Fun: Age Defying (uses symmetry, not face WHR) --
        sym_s = sym
        mid_bal = prox(courts[1], 0.333, 0.04) * 100
        avg_prom = random.betavariate(5, 4)
        age_raw = int(sym_s * 0.45 + mid_bal * 0.30 + avg_prom * 100 * 0.25)
        dims_accum["age_defying"].append(clip(age_raw))

        # -- Fun: Distinctiveness (uses clarity, not abs(conf-0.5)) --
        dist_clarities = [random.betavariate(6, 2) for _ in range(5)]
        dist_raw = int(sum(dist_clarities) / len(dist_clarities) * 100)
        dims_accum["distinctiveness"].append(clip(dist_raw))

        # -- Fun: Photogenic (sym + prop + contour) --
        photo_raw = int(sym * 0.40 + prop * 0.35 + contour * 0.25)
        dims_accum["photogenic"].append(clip(photo_raw))

        # -- Fun: Approachability --
        corner = random.gauss(1.0, 3.0)
        corner_s = clip(65 + corner * 3)
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
