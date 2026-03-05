"""Face similarity comparison service -- orchestrates detection and comparison."""

from __future__ import annotations

import asyncio
import logging
import random
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
# Fun title / description generation (multiple variants per tier)
# ---------------------------------------------------------------------------

_TITLE_TIERS_ZH: list[tuple[int, list[str]]] = [
    (90, [
        "DNA 验证通过! 亲生的没跑了!",
        "基因复制粘贴了属于是!",
        "这不就是同一个模子刻出来的?",
        "亲子鉴定可以省了!",
    ]),
    (75, [
        "高度疑似亲属关系!",
        "这相似度, 怕不是失散多年的兄弟?",
        "隔壁老王表示很紧张...",
        "妈妈看了都要怀疑人生!",
    ]),
    (60, [
        "有点像... 隔壁老王?",
        "嗯, 确实有那么点意思...",
        "五官有些神似, 巧合还是命运?",
        "你们是不是去过同一家整形医院?",
    ]),
    (40, [
        "大概... 是远房亲戚?",
        "相似度一般, 硬说像也不是不行...",
        "八竿子能打着的那种关系",
        "有点像, 又不是很像, 量子纠缠?",
    ]),
    (20, [
        "确定不是路人甲?",
        "这个相似度, 只能说大家都是人类...",
        "唯一的共同点: 都有两只眼睛一个鼻子",
        "AI 已经尽力找相似点了, 真的难...",
    ]),
    (0, [
        "完全不搭边, 认贼做父实锤!",
        "相似度约等于零, 隔壁老王都不认!",
        "你确定不是在测试我的底线?",
        "这两张脸唯一的关系就是被你放在了一起",
    ]),
]

_TITLE_TIERS_EN: list[tuple[int, list[str]]] = [
    (90, [
        "DNA confirmed! Definitely related!",
        "Copy-paste genetics detected!",
        "Same mold, different batch!",
        "Save your money on the paternity test!",
    ]),
    (75, [
        "Highly suspicious resemblance!",
        "Long-lost siblings, perhaps?",
        "The mailman is getting nervous...",
        "Mom's got some explaining to do!",
    ]),
    (60, [
        "Kinda similar... the mailman?",
        "Hmm, there's something there...",
        "Same plastic surgeon, maybe?",
        "Coincidence or destiny?",
    ]),
    (40, [
        "Maybe... distant cousins?",
        "If you squint hard enough...",
        "Connected by a very long thread",
        "Quantum entanglement of faces?",
    ]),
    (20, [
        "Are you sure you're related?",
        "The only similarity: both human",
        "Two eyes, one nose... that's about it",
        "AI tried really hard to find similarities...",
    ]),
    (0, [
        "Not even close! Case closed!",
        "Zero resemblance, even the mailman says no!",
        "Are you testing my limits here?",
        "The only connection: you put them side by side",
    ]),
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

# Per-region score-based descriptions (multiple variants per tier)
_REGION_DESC_ZH: dict[str, list[tuple[int, list[str]]]] = {
    "eyes": [
        (80, [
            "眼睛简直如出一辙, 怕不是同一双眼!",
            "这双眼睛的相似度, 让人不得不怀疑...",
            "眼神都是一样的, 基因太强大了!",
        ]),
        (60, [
            "眼睛有几分相似, 神韵有点像",
            "眼型有些接近, 细看还是能分辨",
            "眼睛区域有一定的家族感",
        ]),
        (40, [
            "眼睛差异开始显现, 各有各的特色",
            "眼型不太一样, 但都挺好看的",
            "眼睛不太像, 大概是各随各妈?",
        ]),
        (0, [
            "眼睛完全不同, 各走各的路",
            "这两双眼睛, 八竿子打不着",
            "眼部区域差异明显, 不是一家人",
        ]),
    ],
    "nose": [
        (80, [
            "鼻子简直是复制粘贴!",
            "同款鼻子, 是不是去了同一家医院?",
            "鼻型高度一致, 遗传学的胜利!",
        ]),
        (60, [
            "鼻子有些相似, 轮廓接近",
            "鼻型有点像, 侧面看更明显",
            "鼻子区域有一定相似度",
        ]),
        (40, [
            "鼻子差别有点大, 各有各的风格",
            "鼻型不太一样, 一个秀气一个立体?",
            "鼻子区域相似度一般般",
        ]),
        (0, [
            "鼻子完全不同款, 没有可比性",
            "鼻部差异显著, 各有千秋",
            "这两个鼻子, 不是一个系列的",
        ]),
    ],
    "mouth": [
        (80, [
            "嘴巴几乎一模一样! 笑起来肯定更像!",
            "唇型高度相似, 连微笑弧度都接近",
            "同款嘴巴, 说话的样子估计也很像!",
        ]),
        (60, [
            "嘴巴有些相似, 唇型接近",
            "嘴部轮廓有一定的相似感",
            "嘴巴区域还算像, 笑起来可能更明显",
        ]),
        (40, [
            "嘴巴差异不小, 各有各的表情包",
            "唇型有些不同, 但都很有特色",
            "嘴巴不太像, 表达方式各异",
        ]),
        (0, [
            "嘴巴完全不像, 天差地别",
            "唇部差异很大, 完全不同的风格",
            "这两张嘴, 不可能是一家的",
        ]),
    ],
    "jawline": [
        (80, [
            "脸型轮廓高度相似, 一看就是一家人!",
            "下颌线几乎重合, 基因的力量!",
            "脸型真的很像, 侧脸更明显!",
        ]),
        (60, [
            "脸型有些相似, 轮廓有点接近",
            "下颌线有一定相似度, 算是同类型",
            "脸型区域有家族感, 但不算特别明显",
        ]),
        (40, [
            "脸型不太一样, 一个圆润一个棱角分明?",
            "下颌线差异比较明显, 各有型",
            "脸型轮廓不太像, 拍合照就知道了",
        ]),
        (0, [
            "脸型完全不同, 不是一个系列",
            "轮廓差异太大, 怎么看都不像",
            "脸型是最不像的部分了",
        ]),
    ],
    "overall_face": [
        (80, [
            "整体看来非常相似, 站一起绝对被认成亲人!",
            "五官整体组合高度一致, 厉害了!",
            "整体面部相似度爆表, 都不用做DNA了!",
        ]),
        (60, [
            "整体有些相似, 某些角度看更明显",
            "五官组合有一定相似感, 不算特别像",
            "整体来看, 有那么点家族的影子",
        ]),
        (40, [
            "整体差异不小, 仔细看才能找到相似点",
            "五官组合不太一样, 各有各的美",
            "整体上像远房亲戚, 如果要硬说的话",
        ]),
        (0, [
            "整体看来毫无相似之处, 认贼做父!",
            "五官组合完全不同, 是路人没跑了",
            "整体面部: 完全不搭, 别勉强了",
        ]),
    ],
}

_REGION_DESC_EN: dict[str, list[tuple[int, list[str]]]] = {
    "eyes": [
        (80, [
            "These eyes are practically identical! Same sparkle!",
            "Eye similarity off the charts - genetics don't lie!",
            "Mirror eyes! Even the gaze matches!",
        ]),
        (60, [
            "Eyes show some family resemblance",
            "Similar eye shape, look closer to see differences",
            "Eyes have a familial vibe to them",
        ]),
        (40, [
            "Eyes are starting to differ, each has their charm",
            "Eye shapes don't quite match up",
            "Eyes tell different stories here",
        ]),
        (0, [
            "Eyes are worlds apart, no connection here",
            "Completely different eyes, not even close",
            "These eyes have never met before",
        ]),
    ],
    "nose": [
        (80, [
            "Nose: copy-paste detected!",
            "Same nose model! Factory settings identical!",
            "Nose match is uncanny - same sculptor!",
        ]),
        (60, [
            "Noses show some resemblance in profile",
            "Similar nose shape, especially from the side",
            "Nose region has a decent match",
        ]),
        (40, [
            "Noses are different styles entirely",
            "Nose shapes diverge noticeably",
            "Different nose vibes, different face vibes",
        ]),
        (0, [
            "Noses couldn't be more different",
            "Nose comparison: worlds apart",
            "These noses are from different planets",
        ]),
    ],
    "mouth": [
        (80, [
            "Same smile, same mouth! Twins alert!",
            "Lip shapes match perfectly - same smile energy!",
            "Mouth area is a dead ringer! Same laugh?",
        ]),
        (60, [
            "Mouths have some similarities in shape",
            "Lip contours show a moderate resemblance",
            "Similar-ish mouths, smiles might match more",
        ]),
        (40, [
            "Mouths differ quite a bit, unique expressions",
            "Lip shapes aren't really matching up",
            "Different mouth styles, different smiles",
        ]),
        (0, [
            "Mouths are completely different, no match at all",
            "Lip area shows zero resemblance",
            "These mouths have nothing in common",
        ]),
    ],
    "jawline": [
        (80, [
            "Jawlines match perfectly! Same face shape!",
            "Face contours overlap - genetic blueprint!",
            "Same jawline - profiles could be swapped!",
        ]),
        (60, [
            "Jawlines show some similarity in shape",
            "Face contours have a moderate resemblance",
            "Similar face structure in some angles",
        ]),
        (40, [
            "Face shapes are quite different",
            "Jawlines diverge - round vs angular?",
            "Different face contours, different characters",
        ]),
        (0, [
            "Jawlines are nothing alike, total mismatch",
            "Face shapes couldn't be more different",
            "Jawline comparison: not even in the same ballpark",
        ]),
    ],
    "overall_face": [
        (80, [
            "Overall: strikingly similar! Relatives for sure!",
            "Face-to-face match is remarkable! Family vibes!",
            "Overall similarity is through the roof!",
        ]),
        (60, [
            "Some overall resemblance, visible in certain angles",
            "Faces share a moderate family-like similarity",
            "There's a hint of family resemblance overall",
        ]),
        (40, [
            "Overall difference is noticeable, need to squint",
            "Faces don't match up well overall",
            "Like distant cousins at best, overall",
        ]),
        (0, [
            "Overall: absolutely nothing in common!",
            "These faces have zero family connection",
            "Overall verdict: strangers, no doubt!",
        ]),
    ],
}

# Ratio observation templates (always generated, not just when matching)
_RATIO_OBS_ZH: dict[str, list[tuple[str, str, str]]] = {
    # region -> [(ratio_key, close_template, diff_template), ...]
    "eyes": [("eye_distance_ratio", "眼距比例几乎一样", "眼距比例相差{pct}")],
    "nose": [("nose_length_ratio", "鼻长比例很接近", "鼻长比例有{pct}的差异")],
    "mouth": [("mouth_width_ratio", "嘴宽比例几乎一致", "嘴宽比例相差{pct}")],
    "jawline": [("face_aspect_ratio", "脸型长宽比很相似", "脸型长宽比差了{pct}")],
}

_RATIO_OBS_EN: dict[str, list[tuple[str, str, str]]] = {
    "eyes": [("eye_distance_ratio", "eye spacing ratios are nearly identical", "eye spacing differs by {pct}")],
    "nose": [("nose_length_ratio", "nose proportions are very close", "nose proportions differ by {pct}")],
    "mouth": [("mouth_width_ratio", "mouth-to-face ratios are nearly identical", "mouth-to-face ratios differ by {pct}")],
    "jawline": [("face_aspect_ratio", "face aspect ratios are very similar", "face aspect ratios differ by {pct}")],
}

_RATIO_CLOSE_THRESHOLD = 0.03  # consider ratios "close" if diff < 3%

# Narrative templates
_NARRATIVE_ZH: list[tuple[int, list[str]]] = [
    (90, [
        "你们的{best}简直如出一辙({best_score}%)! {worst}也高达{worst_score}%, 几乎找不到差异。这对比结果, 不是亲人都没人信!",
        "从{best}到{worst}, 每个部位都高度相似! 综合{overall}%的相似度, 基因的力量令人叹服。",
    ]),
    (75, [
        "你们的{best}最为相似({best_score}%), 而{worst}稍有差异({worst_score}%)。总体来看, 像是同一棵家族树上的枝叶!",
        "{best}区域的相似度({best_score}%)让人印象深刻! 虽然{worst}只有{worst_score}%, 但整体{overall}%的匹配度相当可观。",
    ]),
    (60, [
        "你们的{best}最像({best_score}%), 但{worst}就差远了({worst_score}%)。总体{overall}%的相似度, 属于\"远看有点像\"的程度。",
        "{best}({best_score}%)是最大的相似点, {worst}({worst_score}%)则各有特色。有些角度看挺像的!",
    ]),
    (40, [
        "{best}是唯一有点像的地方({best_score}%), {worst}就完全不搭了({worst_score}%)。总体{overall}%, 属于\"硬要说也能找到相似点\"。",
        "虽然{best}有{best_score}%的相似度, 但{worst}只有{worst_score}%拖了后腿。总体来看, 更像是路人关系。",
    ]),
    (0, [
        "最像的{best}也才{best_score}%, {worst}更是只有{worst_score}%。总体{overall}%的结果说明: 你们可能不是一个星球的。",
        "{best}({best_score}%)算是勉强及格, 但{worst}({worst_score}%)彻底暴露了真相。总体{overall}%, 认贼做父的实锤。",
    ]),
]

_NARRATIVE_EN: list[tuple[int, list[str]]] = [
    (90, [
        "Your {best} are practically identical ({best_score}%)! Even {worst} scores {worst_score}%. This level of similarity is hard to argue with!",
        "From {best} to {worst}, every feature matches! An overall {overall}% similarity - genetics at work!",
    ]),
    (75, [
        "Your {best} match best ({best_score}%), while {worst} shows some variation ({worst_score}%). Overall, you look like branches of the same family tree!",
        "The {best} similarity ({best_score}%) is impressive! Despite {worst} at {worst_score}%, the overall {overall}% match is noteworthy.",
    ]),
    (60, [
        "Your {best} match well ({best_score}%), but {worst} tells a different story ({worst_score}%). At {overall}% overall, you look alike from certain angles.",
        "{best} ({best_score}%) is the strongest connection, while {worst} ({worst_score}%) diverges. Partial family vibes!",
    ]),
    (40, [
        "{best} is the only real similarity ({best_score}%), while {worst} is way off ({worst_score}%). At {overall}%, you'd need to squint really hard.",
        "Despite {best} at {best_score}%, {worst} at {worst_score}% weighs things down. Overall {overall}% says: acquaintances, maybe.",
    ]),
    (0, [
        "Even the best match ({best} at {best_score}%) is low, and {worst} at {worst_score}% seals the deal. At {overall}%, you might be from different planets.",
        "{best} ({best_score}%) is the closest thing to a match, but {worst} ({worst_score}%) says it all. Overall {overall}%: case closed.",
    ]),
]


# ---------------------------------------------------------------------------
# Content generation functions
# ---------------------------------------------------------------------------

def _get_title(score: int, locale: str) -> str:
    tiers = _TITLE_TIERS_ZH if locale.startswith("zh") else _TITLE_TIERS_EN
    for threshold, titles in tiers:
        if score >= threshold:
            return random.choice(titles)
    return random.choice(tiers[-1][1])


def _get_summary(score: int, locale: str) -> str:
    if locale.startswith("zh"):
        return f"两张脸的综合相似度为 {score}%。"
    return f"Overall facial similarity is {score}%."


def _get_disclaimer(locale: str) -> str:
    if locale.startswith("zh"):
        return "本工具仅供娱乐, 不具备真实亲缘鉴定能力。"
    return "This tool is for entertainment only and has no real genetic testing capability."


def _generate_region_description(
    region: str,
    score: int,
    ratios1: dict[str, float],
    ratios2: dict[str, float],
    locale: str,
) -> str:
    """Generate fun description for a region, always returns a non-empty string."""
    is_zh = locale.startswith("zh")
    parts: list[str] = []

    # Score-based description (always generated)
    desc_table = _REGION_DESC_ZH if is_zh else _REGION_DESC_EN
    region_descs = desc_table.get(region, [])
    for threshold, variants in region_descs:
        if score >= threshold:
            parts.append(random.choice(variants))
            break

    # Ratio observation (always generated when data available)
    ratio_obs = _RATIO_OBS_ZH if is_zh else _RATIO_OBS_EN
    for ratio_key, close_tpl, diff_tpl in ratio_obs.get(region, []):
        v1 = ratios1.get(ratio_key)
        v2 = ratios2.get(ratio_key)
        if v1 is not None and v2 is not None:
            diff = abs(v1 - v2)
            if diff < _RATIO_CLOSE_THRESHOLD:
                text = close_tpl
            else:
                pct = f"{diff * 100:.1f}%"
                text = diff_tpl.format(pct=pct)
            if not is_zh:
                text = text[0].upper() + text[1:] if text else text
            parts.append(text)

    return " ".join(parts) if parts else ""


def _generate_narrative(
    ranked_regions: list[dict[str, Any]],
    overall_score: int,
    locale: str,
) -> str:
    """Generate a 2-3 sentence comparison narrative."""
    is_zh = locale.startswith("zh")
    tiers = _NARRATIVE_ZH if is_zh else _NARRATIVE_EN
    region_names = _REGION_NAMES_ZH if is_zh else _REGION_NAMES_EN

    # Best and worst are first and last in the ranked list
    best = ranked_regions[0]
    worst = ranked_regions[-1]

    template = ""
    for threshold, templates in tiers:
        if overall_score >= threshold:
            template = random.choice(templates)
            break

    if not template:
        template = random.choice(tiers[-1][1])

    return template.format(
        best=region_names.get(best["region"], best["region"]),
        best_score=best["score"],
        worst=region_names.get(worst["region"], worst["region"]),
        worst_score=worst["score"],
        overall=overall_score,
    )


def _generate_fun_facts(
    ratios1: dict[str, float],
    ratios2: dict[str, float],
    ranked_regions: list[dict[str, Any]],
    locale: str,
) -> list[str]:
    """Generate 1-3 fun geometric observations with actual numbers."""
    is_zh = locale.startswith("zh")
    facts: list[str] = []

    # Ratio-based observations with actual values
    ratio_facts = {
        "eye_distance_ratio": (
            ("你们的眼距占脸宽的比例分别是 {v1:.1%} 和 {v2:.1%}, {comment}",
             "Eye spacing: {v1:.1%} vs {v2:.1%} of face width - {comment}"),
        ),
        "nose_length_ratio": (
            ("鼻长占脸高的比例: {v1:.1%} vs {v2:.1%}, {comment}",
             "Nose length: {v1:.1%} vs {v2:.1%} of face height - {comment}"),
        ),
        "mouth_width_ratio": (
            ("嘴宽占脸宽的比例: {v1:.1%} vs {v2:.1%}, {comment}",
             "Mouth width: {v1:.1%} vs {v2:.1%} of face width - {comment}"),
        ),
        "face_aspect_ratio": (
            ("脸型长宽比: {v1:.2f} vs {v2:.2f}, {comment}",
             "Face aspect ratio: {v1:.2f} vs {v2:.2f} - {comment}"),
        ),
    }

    # Gather all ratio comparisons, sort by interestingness (extremes first)
    observations: list[tuple[float, str]] = []
    for key, (templates,) in ratio_facts.items():
        v1 = ratios1.get(key)
        v2 = ratios2.get(key)
        if v1 is None or v2 is None:
            continue

        diff = abs(v1 - v2)
        tpl = templates[0] if is_zh else templates[1]

        if diff < 0.01:
            comment = "几乎完全一致!" if is_zh else "almost identical!"
            priority = 1.0  # very close = interesting
        elif diff < 0.03:
            comment = "非常接近" if is_zh else "very close"
            priority = 0.8
        elif diff > 0.08:
            comment = "差异显著!" if is_zh else "quite different!"
            priority = 0.9  # very different = also interesting
        else:
            comment = "有一定差异" if is_zh else "some difference"
            priority = 0.3

        text = tpl.format(v1=v1, v2=v2, comment=comment)
        observations.append((priority, text))

    # Sort by priority (most interesting first), take top 2
    observations.sort(key=lambda x: x[0], reverse=True)
    facts.extend(text for _, text in observations[:2])

    # Region spread observation
    if len(ranked_regions) >= 2:
        best = ranked_regions[0]
        worst = ranked_regions[-1]
        spread = best["score"] - worst["score"]
        best_name = _REGION_NAMES_ZH.get(best["region"], best["region"]) if is_zh else _REGION_NAMES_EN.get(best["region"], best["region"])
        worst_name = _REGION_NAMES_ZH.get(worst["region"], worst["region"]) if is_zh else _REGION_NAMES_EN.get(worst["region"], worst["region"])

        if spread > 30:
            if is_zh:
                facts.append(f"有趣的是, {best_name}({best['score']}%)和{worst_name}({worst['score']}%)的差距高达{spread}分, 像是拼接了两个不同的人!")
            else:
                facts.append(f"Interestingly, {best_name} ({best['score']}%) and {worst_name} ({worst['score']}%) differ by {spread} points - like a face mashup!")
        elif spread < 10:
            if is_zh:
                facts.append(f"各区域相似度很均匀(最大差距仅{spread}分), 像还是不像, 全方位统一!")
            else:
                facts.append(f"All regions are remarkably consistent (max spread: only {spread} points) - uniformly similar or different!")

    return facts[:3]


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

    # Collect region data and sort by score for ranking
    region_order = ["eyes", "nose", "mouth", "jawline", "overall_face"]
    region_list: list[dict[str, Any]] = []
    for name in region_order:
        region_data = raw["regions"].get(name, {})
        score = region_data.get("score", 0)
        desc = _generate_region_description(name, score, ratios1, ratios2, locale)
        region_list.append({
            "region": name,
            "score": score,
            "description": desc,
        })

    # Rank by score (highest = rank 1)
    ranked = sorted(region_list, key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
        if i == 0:
            r["badge"] = "best_match"
        elif i == len(ranked) - 1:
            r["badge"] = "least_match"
        else:
            r["badge"] = None

    best_region = ranked[0]["region"]
    worst_region = ranked[-1]["region"]

    # Generate narrative and fun facts
    narrative = _generate_narrative(ranked, overall_score, locale)
    fun_facts = _generate_fun_facts(ratios1, ratios2, ranked, locale)

    # Restore original display order
    region_map = {r["region"]: r for r in ranked}
    regions_ordered = [region_map[name] for name in region_order]

    return {
        "regions": regions_ordered,
        "overall_score": overall_score,
        "title": _get_title(overall_score, locale),
        "summary": _get_summary(overall_score, locale),
        "disclaimer": _get_disclaimer(locale),
        "narrative": narrative,
        "fun_facts": fun_facts if fun_facts else None,
        "best_region": best_region,
        "worst_region": worst_region,
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
