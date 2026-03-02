"""Rules engine for physiognomy text generation.

Provides two modes:
- Entertainment: multi-dimensional scores, tags, brief descriptions (free tier)
- Detailed prompt: structured LLM prompt for deep analysis (paid tier)

Scoring methodology:
- Proportion harmony: deviation from Three Courts / Five Eyes ideals
- Symmetry: weighted bilateral comparison
- Feature coherence: how well individual features match overall face shape
- Distinctiveness: unique trait richness (tag count)

References:
- Lin & Zhou 2021 (Perception): Three Courts & Five Eyes validation
- Rhodes et al. (Psychonomic Bulletin): symmetry-attractiveness correlation
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any

# ---------------------------------------------------------------------------
# Bilingual template data
# ---------------------------------------------------------------------------

_FACE_SHAPE = {
    "round": {
        "zh-CN": {"label": "圆脸", "desc": "你的面部线条柔和饱满，天然有亲和力和甜美感，非常有镜头感。",
                  "beauty_tip": "侧分发型和层次感可以拉长视觉比例，修容时在颧骨下方打阴影效果很好。"},
        "en": {"label": "Round Face", "desc": "Your soft, full contours give a naturally warm and photogenic look.",
               "beauty_tip": "Side parts and layered styles elongate visually; contour below the cheekbones."},
    },
    "oval": {
        "zh-CN": {"label": "鹅蛋脸", "desc": "你的脸型比例非常协调，额宽颌窄的轮廓很有优势，适合多种风格。",
                  "beauty_tip": "你的脸型是百搭型，各种发型和妆容都能驾驭，可以大胆尝试。"},
        "en": {"label": "Oval Face", "desc": "Your balanced proportions and tapered jaw are versatile and flattering.",
               "beauty_tip": "Your face shape is highly versatile -- experiment boldly with different styles."},
    },
    "square": {
        "zh-CN": {"label": "方脸", "desc": "你的轮廓线条感很强，颌骨棱角分明，气场十足，很有高级感。",
                  "beauty_tip": "柔和的层次长发可以软化轮廓，在下颌角打阴影能增加柔美感。"},
        "en": {"label": "Square Face", "desc": "Your strong contours and defined jawline create a powerful, striking look.",
               "beauty_tip": "Soft layers soften the contour; shadow the jaw corners for a gentler finish."},
    },
    "long": {
        "zh-CN": {"label": "长脸", "desc": "你的面部线条修长舒展，给人优雅从容的感觉，很适合知性风格。",
                  "beauty_tip": "空气刘海可以缩短纵向比例，两侧蓬松的发型增加横向宽度感。"},
        "en": {"label": "Long Face", "desc": "Your elongated features create an elegant, composed impression.",
               "beauty_tip": "Wispy bangs shorten vertical proportions; volume on the sides adds width."},
    },
    "diamond": {
        "zh-CN": {"label": "菱形脸", "desc": "你的颧骨线条立体鲜明，面部轮廓有很强的辨识度，很有个性美。",
                  "beauty_tip": "法式刘海可以平衡额头和颧骨比例，下颌处的卷发增加柔和感。"},
        "en": {"label": "Diamond Face", "desc": "Your prominent cheekbones give you a distinctive, sculptured beauty.",
               "beauty_tip": "Curtain bangs balance forehead and cheekbones; curls at the jaw add softness."},
    },
    "heart": {
        "zh-CN": {"label": "心形脸", "desc": "你的宽额和精致下巴形成优美的倒三角，灵动又有少女感。",
                  "beauty_tip": "在下巴两侧增加发量可以平衡上宽下窄，腮红打在苹果肌效果很好。"},
        "en": {"label": "Heart Face", "desc": "Your broad forehead and delicate chin create a youthful, spirited look.",
               "beauty_tip": "Add volume at the jaw to balance proportions; blush on the apples looks great."},
    },
    "pear": {
        "zh-CN": {"label": "梨形脸", "desc": "你的下颌轮廓圆润有力，给人稳重可靠的感觉，气质沉稳。",
                  "beauty_tip": "在头顶和两侧增加蓬松感可以平衡比例，额头区域的高光能提升整体协调度。"},
        "en": {"label": "Pear Face", "desc": "Your full jawline creates a grounded, dependable impression.",
               "beauty_tip": "Volume at the crown balances proportions; forehead highlight improves harmony."},
    },
}

_EYE_SHAPE = {
    "phoenix": {
        "zh-CN": {"label": "丹凤眼", "desc": "你的眼角线条上扬，有一种独特的凌厉美感，非常有气场和辨识度。",
                  "beauty_tip": "上扬的眼线可以顺应眼型优势，微微上挑的睫毛方向让眼神更有力量。"},
        "en": {"label": "Phoenix Eyes", "desc": "Your upward-tilting corners create a striking, powerful gaze with distinctive charm.",
               "beauty_tip": "Winged eyeliner enhances your natural shape; upward-angled lashes add intensity."},
    },
    "almond": {
        "zh-CN": {"label": "杏仁眼", "desc": "你的眼型温润均匀，比例非常好，是妆容百搭的理想眼型。",
                  "beauty_tip": "杏仁眼是最百搭的眼型，各种眼妆风格都能驾驭，可以大胆尝试不同色彩。"},
        "en": {"label": "Almond Eyes", "desc": "Your well-proportioned eyes are beautifully versatile for any makeup style.",
               "beauty_tip": "Almond eyes suit any style -- experiment boldly with colors and techniques."},
    },
    "round": {
        "zh-CN": {"label": "圆眼", "desc": "你的眼睛大而明亮，自带无辜感和亲和力，非常有少女感。",
                  "beauty_tip": "在眼尾稍加延长的眼线可以拉长眼型，下眼线的卧蚕妆更增添可爱感。"},
        "en": {"label": "Round Eyes", "desc": "Your large, bright eyes naturally convey warmth and youthful charm.",
               "beauty_tip": "Extended liner at the outer corner elongates; aegyo-sal highlights add charm."},
    },
    "narrow": {
        "zh-CN": {"label": "细长眼", "desc": "你的眼型深邃有层次感，有一种知性清冷的美，很有东方韵味。",
                  "beauty_tip": "在眼中增加亮片或珠光提亮，可以让眼睛看起来更立体有神。"},
        "en": {"label": "Narrow Eyes", "desc": "Your deep-set, elongated eyes have an intellectual, cool beauty.",
               "beauty_tip": "Shimmer on the center lid adds dimension; avoid heavy liner on the lower lash line."},
    },
    "droopy": {
        "zh-CN": {"label": "垂眼", "desc": "你的眼角线条柔和自然，有一种温柔治愈的气质，很有亲和力。",
                  "beauty_tip": "在眼尾微微上扬的眼线可以提升眼神，浅色系眼影让眼部更显精神。"},
        "en": {"label": "Droopy Eyes", "desc": "Your softly downturned corners give a gentle, soothing quality.",
               "beauty_tip": "A slight upward flick at the outer corner lifts the gaze; light shadows brighten."},
    },
}

_NOSE_SHAPE = {
    "straight": {
        "zh-CN": {"label": "直鼻", "desc": "你的鼻梁线条流畅挺拔，比例匀称，是很好的修容基础。",
                  "beauty_tip": "沿鼻梁打一道细高光可以进一步突出立体感，鼻翼两侧轻扫阴影效果很自然。"},
        "en": {"label": "Straight Nose", "desc": "Your straight, well-proportioned bridge is an excellent foundation for contouring.",
               "beauty_tip": "A thin highlight down the bridge enhances dimension; gentle shadow on the sides."},
    },
    "straight_long": {
        "zh-CN": {"label": "悬胆鼻", "desc": "你的鼻梁高挺修长，面部立体感非常强，有天然的高级感。",
                  "beauty_tip": "鼻梁高光可以适当缩短，在鼻头略加阴影让鼻型更精致。"},
        "en": {"label": "Prominent Straight Nose", "desc": "Your tall, straight bridge creates striking facial dimension.",
               "beauty_tip": "Shorten the highlight slightly; a touch of shadow on the tip refines the shape."},
    },
    "aquiline": {
        "zh-CN": {"label": "鹰钩鼻", "desc": "你的鼻梁有自然的弧度，轮廓独特有个性，辨识度很高。",
                  "beauty_tip": "在鼻梁弧度处轻扫高光可以柔化线条，增添柔美感。"},
        "en": {"label": "Aquiline Nose", "desc": "Your naturally curved bridge gives a distinctive, characterful profile.",
               "beauty_tip": "Highlight at the curve softens the line and adds an elegant touch."},
    },
    "snub": {
        "zh-CN": {"label": "小巧鼻", "desc": "你的鼻型小巧精致，很有少女感，搭配你的五官非常和谐。",
                  "beauty_tip": "在鼻尖打一小点高光可以增加精致感，鼻影从眉头到鼻翼轻扫即可。"},
        "en": {"label": "Snub Nose", "desc": "Your petite nose is charmingly refined and harmonizes well with your features.",
               "beauty_tip": "A dot of highlight on the tip adds refinement; sweep shadow from brow to wing."},
    },
    "snub_wide": {
        "zh-CN": {"label": "蒜头鼻", "desc": "你的鼻头圆润饱满，有一种亲和可爱的感觉，很有亲切感。",
                  "beauty_tip": "在鼻翼两侧轻扫阴影可以视觉收窄鼻头，鼻梁高光让整体更立体。"},
        "en": {"label": "Bulbous Nose", "desc": "Your full, rounded tip gives a friendly, approachable charm.",
               "beauty_tip": "Shadow on the wings visually narrows the tip; bridge highlight adds dimension."},
    },
    "wide": {
        "zh-CN": {"label": "宽鼻", "desc": "你的鼻翼线条舒展大方，和面部整体比例很搭配。",
                  "beauty_tip": "在鼻翼两侧打阴影是最有效的修饰方式，高光集中在鼻梁中线。"},
        "en": {"label": "Wide Nose", "desc": "Your broad nostrils complement your overall facial proportions.",
               "beauty_tip": "Shadow along the wings is the most effective technique; center the highlight."},
    },
    "normal": {
        "zh-CN": {"label": "标准鼻", "desc": "你的鼻型端正协调，比例恰到好处，是天然的和谐加分项。",
                  "beauty_tip": "你的鼻型本身比例很好，日常只需轻扫高光增加立体感即可。"},
        "en": {"label": "Standard Nose", "desc": "Your balanced nose is a natural harmony bonus for your face.",
               "beauty_tip": "Your proportions are already ideal -- just a light highlight for added dimension."},
    },
}

_MOUTH_SHAPE = {
    "small": {
        "zh-CN": {"label": "樱桃口", "desc": "你的嘴形小巧精致，有一种含蓄优雅的美感，很有古典韵味。",
                  "beauty_tip": "在唇峰处用浅色唇线稍微外扩，可以让唇形看起来更饱满有型。"},
        "en": {"label": "Cherry Mouth", "desc": "Your petite lips have a subtle, classical elegance.",
               "beauty_tip": "Slightly overlining the cupid's bow adds fullness and definition."},
    },
    "wide": {
        "zh-CN": {"label": "阔口", "desc": "你的嘴形大方有型，笑起来特别有感染力，是天然的表情优势。",
                  "beauty_tip": "哑光质感的唇妆很适合你，让嘴形看起来更加利落有气场。"},
        "en": {"label": "Wide Mouth", "desc": "Your generous lips are wonderfully expressive, especially when smiling.",
               "beauty_tip": "Matte lip finishes look great on you, adding a polished, powerful touch."},
    },
    "upper_full": {
        "zh-CN": {"label": "上唇丰厚", "desc": "你的上唇丰满有型，唇线分明，很适合各种唇色。",
                  "beauty_tip": "选择和肤色相近的唇色可以突出唇形优势，渐变唇妆效果也很好。"},
        "en": {"label": "Full Upper Lip", "desc": "Your full upper lip is beautifully defined and suits many lip colors.",
               "beauty_tip": "MLBB shades highlight your lip shape; gradient lips look lovely too."},
    },
    "lower_full": {
        "zh-CN": {"label": "下唇丰厚", "desc": "你的下唇饱满圆润，很有性感魅力，天然的嘟嘟唇效果。",
                  "beauty_tip": "在下唇中央加一点透明唇蜜可以增强饱满感和光泽度。"},
        "en": {"label": "Full Lower Lip", "desc": "Your plump lower lip has a naturally alluring, pouty look.",
               "beauty_tip": "A touch of gloss on the lower center enhances fullness and shine."},
    },
    "upturned": {
        "zh-CN": {"label": "上扬嘴角", "desc": "你的嘴角自然上扬，天生有笑意，看起来亲切又阳光。",
                  "beauty_tip": "保持嘴角的自然弧度是你的优势，自然妆感的裸色唇妆最能衬托这个特点。"},
        "en": {"label": "Upturned Corners", "desc": "Your naturally upturned corners give you a sunny, approachable look.",
               "beauty_tip": "Embrace the natural curve; nude lip tones best complement this feature."},
    },
    "downturned": {
        "zh-CN": {"label": "下垂嘴角", "desc": "你的唇线弧度自然柔和，有一种冷淡高级的美感，很有气质。",
                  "beauty_tip": "在嘴角处用遮瑕轻微提亮，再用唇线笔在嘴角微微上扬，效果很自然。"},
        "en": {"label": "Downturned Corners", "desc": "Your natural lip curve has a cool, sophisticated elegance.",
               "beauty_tip": "Concealer at the corners and a slight upward lip liner flick look natural."},
    },
    "balanced": {
        "zh-CN": {"label": "匀称口型", "desc": "你的唇形比例均匀协调，是百搭的理想唇型，什么唇色都好看。",
                  "beauty_tip": "你的唇形不需要特别修饰，任何唇色和质地都能很好地呈现。"},
        "en": {"label": "Balanced Mouth", "desc": "Your well-proportioned lips are beautifully versatile for any lip look.",
               "beauty_tip": "Your lip shape needs no special correction -- any color and finish works well."},
    },
}

_EYEBROW_SHAPE = {
    "high_arch": {
        "zh-CN": {"label": "高弓眉", "desc": "你的眉弓弧度明显，眉形很有表现力，增添了面部的戏剧感。",
                  "beauty_tip": "保持自然的高弓弧度是你的优势，修眉时只需清理杂毛即可。"},
        "en": {"label": "High Arch", "desc": "Your pronounced arch adds expressiveness and dramatic flair to your look.",
               "beauty_tip": "Maintain the natural high arch -- just clean stray hairs when grooming."},
    },
    "straight": {
        "zh-CN": {"label": "一字眉", "desc": "你的眉形线条干净利落，有一种自然清新的美感，很有韩系风格。",
                  "beauty_tip": "用眉笔顺着自然方向轻描即可，一字眉搭配你的眼型很和谐。"},
        "en": {"label": "Straight Brows", "desc": "Your clean, straight brow line has a fresh, modern aesthetic.",
               "beauty_tip": "Light strokes following the natural direction; pairs well with your eye shape."},
    },
    "straight_long": {
        "zh-CN": {"label": "长直眉", "desc": "你的眉形修长平直，让面部看起来很舒展大气，有大方美。",
                  "beauty_tip": "眉尾保持自然延伸即可，避免过度修剪让眉形失去舒展感。"},
        "en": {"label": "Long Straight Brows", "desc": "Your extended straight brows give your face an open, generous feel.",
               "beauty_tip": "Let the tail extend naturally; avoid over-trimming to keep the expansive look."},
    },
    "soft_arch": {
        "zh-CN": {"label": "柔弓眉", "desc": "你的眉形自然柔和，弧度恰到好处，衬托出温和亲切的气质。",
                  "beauty_tip": "柔弓眉是非常理想的眉型，保持现有弧度即可，是很好的修容搭配。"},
        "en": {"label": "Soft Arch", "desc": "Your gently curved brows perfectly complement a warm, approachable look.",
               "beauty_tip": "Soft arch is an ideal shape -- maintain the current curve for beautiful framing."},
    },
    "long_arch": {
        "zh-CN": {"label": "长弓眉", "desc": "你的眉形修长有弧度，增添了优雅的气质，很有女人味。",
                  "beauty_tip": "用眉膏固定自然弧度，眉尾的延伸可以让面部看起来更精致。"},
        "en": {"label": "Long Arch", "desc": "Your elongated arch adds an elegant, feminine sophistication.",
               "beauty_tip": "Set with brow gel; the extended tail makes your face appear more refined."},
    },
}

_FOREHEAD_SHAPE = {
    "high": {
        "zh-CN": {"label": "高额", "desc": "你的额头开阔大方，让面部上半部分非常有存在感，显得大气。",
                  "beauty_tip": "空气刘海或法式刘海可以适度修饰额头比例，让整体更平衡。"},
        "en": {"label": "High Forehead", "desc": "Your expansive forehead gives your upper face a grand, open presence.",
               "beauty_tip": "Wispy or curtain bangs can balance proportions beautifully."},
    },
    "medium": {
        "zh-CN": {"label": "中额", "desc": "你的额头比例恰好，面部纵向比例很协调，是很好的基础。",
                  "beauty_tip": "额头比例已经很理想，露额和刘海造型都很适合你。"},
        "en": {"label": "Medium Forehead", "desc": "Your proportional forehead creates a beautifully balanced foundation.",
               "beauty_tip": "Both swept-back and bangs styles suit your balanced proportions."},
    },
    "low": {
        "zh-CN": {"label": "低额", "desc": "你的面部中下部分比例突出，整体显得紧凑有力，很有存在感。",
                  "beauty_tip": "避免厚重刘海遮挡额头，露额发型或侧分可以优化纵向比例。"},
        "en": {"label": "Low Forehead", "desc": "Your compact forehead makes your mid and lower face stand out with presence.",
               "beauty_tip": "Avoid heavy bangs; swept-back or side-parted styles optimize proportions."},
    },
}

_JAWLINE_SHAPE = {
    "square": {
        "zh-CN": {"label": "方颌", "desc": "你的下颌线条方正有力，轮廓感很强，有一种干练飒爽的高级美。",
                  "beauty_tip": "在下颌角处打阴影可以柔化线条，搭配柔和的发型效果很好。"},
        "en": {"label": "Square Jaw", "desc": "Your strong, angular jawline creates a powerful, high-fashion look.",
               "beauty_tip": "Shadow at the jaw corners softens the line; pair with soft hairstyles."},
    },
    "wide_round": {
        "zh-CN": {"label": "宽圆颌", "desc": "你的下颌圆润饱满，面部轮廓很有包容感，看起来亲切和善。",
                  "beauty_tip": "两侧碎发可以修饰脸型宽度，修容时在腮帮处轻扫阴影效果自然。"},
        "en": {"label": "Wide Round Jaw", "desc": "Your full, rounded jaw gives a warm, approachable softness.",
               "beauty_tip": "Face-framing wisps slim the width; contour along the sides for a natural look."},
    },
    "pointed": {
        "zh-CN": {"label": "尖颌", "desc": "你的下巴尖巧精致，让面部线条有收束感，显得灵动精致。",
                  "beauty_tip": "你的下巴线条已经很好，在下巴正面打一点高光可以增添精致感。"},
        "en": {"label": "Pointed Jaw", "desc": "Your delicately tapered chin gives your face a refined, spirited quality.",
               "beauty_tip": "A touch of highlight on the chin front enhances the refined finish."},
    },
    "angular": {
        "zh-CN": {"label": "棱角颌", "desc": "你的颌线轮廓分明有棱角，面部线条感很强，非常有个性。",
                  "beauty_tip": "利用修容强调或柔化棱角都可以，取决于你想要帅气还是柔美的风格。"},
        "en": {"label": "Angular Jaw", "desc": "Your defined jawline creates strong facial lines full of character.",
               "beauty_tip": "Contour to either emphasize or soften the angles, depending on your desired look."},
    },
    "moderate": {
        "zh-CN": {"label": "匀称颌", "desc": "你的下颌比例协调适中，轮廓自然柔和，是百搭的理想颌型。",
                  "beauty_tip": "你的颌线已经很均衡，日常不需要特别修容，保持自然即可。"},
        "en": {"label": "Moderate Jaw", "desc": "Your balanced jawline is naturally harmonious and beautifully versatile.",
               "beauty_tip": "Your jawline is already well-balanced -- minimal contouring needed."},
    },
}

# Twelve Palaces templates (simplified 6-palace subset)
_TWELVE_PALACES = {
    "yintang": {
        "zh-CN": {"label": "命宫(印堂)", "good": "印堂开阔，心胸宽广，为人豁达。", "neutral": "印堂适中，性格沉稳，处事有度。", "narrow": "印堂略窄，思虑较多，心思细腻。"},
        "en": {"label": "Destiny Palace", "good": "Wide space between brows suggests an open and magnanimous character.", "neutral": "Moderate spacing suggests composure and balance.", "narrow": "Narrow spacing suggests deep contemplation and sensitivity."},
    },
    "tianzhai": {
        "zh-CN": {"label": "田宅宫", "good": "眉眼间距开阔，心态从容，对人宽厚。", "neutral": "眉眼间距适中，处事稳妥。", "narrow": "眉眼紧凑，性格专注，行动果断。"},
        "en": {"label": "Property Palace", "good": "Wide brow-eye gap suggests a calm and generous nature.", "neutral": "Moderate gap suggests steady disposition.", "narrow": "Compact spacing suggests focus and decisiveness."},
    },
    "guanlu": {
        "zh-CN": {"label": "官禄宫", "good": "额头饱满宽阔，才思敏捷，善于思考。", "neutral": "额头比例适中，思维清晰。", "narrow": "额部紧凑，注重实践，行胜于言。"},
        "en": {"label": "Career Palace", "good": "Full, broad forehead suggests quick thinking and intellectual strength.", "neutral": "Proportional forehead suggests clear thinking.", "narrow": "Compact forehead suggests a practical, action-first approach."},
    },
    "caibu": {
        "zh-CN": {"label": "财帛宫", "good": "鼻头丰满圆润，理财意识强，善于积累。", "neutral": "鼻头比例适中，消费理性。", "narrow": "鼻尖精巧，审美敏锐，追求品质。"},
        "en": {"label": "Wealth Palace", "good": "Full, rounded nose tip suggests strong financial awareness.", "neutral": "Proportional nose suggests balanced spending habits.", "narrow": "Refined nose tip suggests strong aesthetic taste and quality focus."},
    },
    "fuqi": {
        "zh-CN": {"label": "夫妻宫", "good": "太阳穴饱满，人际关系融洽，重视感情。", "neutral": "太阳穴适中，感情观务实。", "narrow": "太阳穴略凹，独立自主，享受独处。"},
        "en": {"label": "Spouse Palace", "good": "Full temples suggest harmonious relationships and emotional warmth.", "neutral": "Moderate temples suggest a practical approach to relationships.", "narrow": "Slight indentation suggests independence and comfort with solitude."},
    },
    "xiongdi": {
        "zh-CN": {"label": "兄弟宫", "good": "眉形修长有力，社交广泛，朋友缘佳。", "neutral": "眉形适中，人际关系稳定。", "narrow": "眉形简洁，交友精而不杂。"},
        "en": {"label": "Siblings Palace", "good": "Long, strong brows suggest wide social circles and strong friendships.", "neutral": "Moderate brows suggest stable social relationships.", "narrow": "Simple brows suggest selective, quality friendships."},
    },
    "qianyi": {
        "zh-CN": {"label": "迁移宫", "good": "太阳穴区域饱满，适应力强，利于变动发展。", "neutral": "太阳穴适中，安守本分，稳中求进。", "narrow": "太阳穴略窄，性格安定，偏好稳定环境。"},
        "en": {"label": "Migration Palace", "good": "Full temple area suggests adaptability and benefit from change.", "neutral": "Moderate temple suggests steady, gradual progress.", "narrow": "Narrower temple suggests preference for stability."},
    },
    "jie_e": {
        "zh-CN": {"label": "疾厄宫", "good": "山根高挺，精力充沛，身体底子好。", "neutral": "山根适中，健康状况平稳。", "narrow": "山根较低，需注意养生保健。"},
        "en": {"label": "Health Palace", "good": "Prominent nose bridge root suggests vitality and strong constitution.", "neutral": "Moderate bridge root suggests steady health.", "narrow": "Lower bridge root suggests attention to wellness."},
    },
    "zinv": {
        "zh-CN": {"label": "子女宫", "good": "卧蚕丰润，亲和力强，子女缘佳。", "neutral": "下眼适中，家庭观念务实。", "narrow": "下眼平整，独立自主，注重个人空间。"},
        "en": {"label": "Children Palace", "good": "Full under-eye area suggests warmth and strong family bonds.", "neutral": "Moderate area suggests practical family values.", "narrow": "Flat under-eye area suggests independence and personal focus."},
    },
    "nupu": {
        "zh-CN": {"label": "奴仆宫", "good": "下颊丰满，领导力强，易得下属拥戴。", "neutral": "下颊适中，团队关系和谐。", "narrow": "下颊较窄，偏好独立工作。"},
        "en": {"label": "Servants Palace", "good": "Full lower cheeks suggest leadership and ability to inspire others.", "neutral": "Moderate area suggests harmonious team dynamics.", "narrow": "Narrower area suggests preference for independent work."},
    },
    "fumu": {
        "zh-CN": {"label": "父母宫", "good": "额角饱满，家庭关系融洽，受长辈庇佑。", "neutral": "额角适中，家庭关系平稳。", "narrow": "额角较窄，独立成长，自我奋斗。"},
        "en": {"label": "Parents Palace", "good": "Full forehead-brow area suggests harmonious family ties and elder support.", "neutral": "Moderate area suggests stable family relationships.", "narrow": "Narrower area suggests self-reliance and independence."},
    },
    "fude": {
        "zh-CN": {"label": "福德宫", "good": "额角至太阳穴宽阔，内心充实，精神富足。", "neutral": "福德宫适中，知足常乐。", "narrow": "福德宫较窄，性格务实，不尚空想。"},
        "en": {"label": "Fortune Palace", "good": "Broad forehead-temple area suggests spiritual contentment and inner richness.", "neutral": "Moderate area suggests contentment and balance.", "narrow": "Compact area suggests pragmatism and practical focus."},
    },
}

# Five Mountains templates
_FIVE_MOUNTAINS = {
    "balanced": {
        "zh-CN": "五岳端正，面部骨骼支撑均衡，整体气韵和谐。",
        "en": "Five Mountains are well-balanced, with harmonious facial bone structure and overall presence.",
    },
    "unbalanced": {
        "zh-CN": "五岳各有侧重，面部结构个性鲜明，辨识度高。",
        "en": "Five Mountains show distinct emphasis, creating a highly recognizable facial structure.",
    },
}

# Maps feature key -> template dict
_ALL_TEMPLATES: dict[str, dict[str, dict[str, dict[str, str]]]] = {
    "face_shape": _FACE_SHAPE,
    "eyes": _EYE_SHAPE,
    "nose": _NOSE_SHAPE,
    "mouth": _MOUTH_SHAPE,
    "eyebrows": _EYEBROW_SHAPE,
    "forehead": _FOREHEAD_SHAPE,
    "jawline": _JAWLINE_SHAPE,
}

# Entertainment tags (fun labels based on combinations)
_TAG_RULES: list[tuple[str, dict[str, str]]] = [
    ("phoenix_eyes", {"zh-CN": "凤目生威", "en": "Commanding Phoenix Eyes"}),
    ("balanced_courts", {"zh-CN": "三庭匀称", "en": "Balanced Three Courts"}),
    ("high_symmetry", {"zh-CN": "面部对称", "en": "Facial Symmetry"}),
    ("straight_nose", {"zh-CN": "鼻梁挺直", "en": "Straight Bridge"}),
    ("wide_forehead", {"zh-CN": "天庭饱满", "en": "Full Forehead"}),
    ("upturned_mouth", {"zh-CN": "嘴角上扬", "en": "Upturned Lips"}),
    ("oval_face", {"zh-CN": "脸型端正", "en": "Classic Face Shape"}),
    ("strong_jaw", {"zh-CN": "地阁方圆", "en": "Strong Foundation"}),
    ("expressive_brows", {"zh-CN": "眉清目秀", "en": "Expressive Features"}),
    ("golden_ratio", {"zh-CN": "五眼均衡", "en": "Five-Eye Harmony"}),
    ("mountain_balance", {"zh-CN": "五岳端正", "en": "Balanced Mountains"}),
    ("yintang_open", {"zh-CN": "印堂开阔", "en": "Open Destiny Palace"}),
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _get_template(feature_key: str, shape_id: str, locale: str) -> dict[str, str]:
    """Get label, desc, and beauty_tip for a given feature+shape, with fallback."""
    templates = _ALL_TEMPLATES.get(feature_key, {})
    shape = templates.get(shape_id, {})
    return shape.get(locale, shape.get("zh-CN", {"label": shape_id, "desc": "", "beauty_tip": ""}))


def _proximity(value: float, ideal: float, sigma: float) -> float:
    """Gaussian proximity: 1.0 when value==ideal, falls off with sigma."""
    return math.exp(-0.5 * ((value - ideal) / sigma) ** 2)


_SCORE_FLOOR = 15  # Minimum feature score to avoid extreme outliers


def _feature_score(feature_key: str, features: dict[str, Any]) -> int:
    """Compute a score (0-100) for a single feature based on its measurements.

    Uses Gaussian proximity for smooth falloff with a floor to prevent
    unrealistically low scores from minor deviations.
    """
    raw = features.get("raw_ratios", {})

    if feature_key == "face_shape":
        whr = raw.get("face_width_height_ratio", 0.76)
        return max(_SCORE_FLOOR, int(_proximity(whr, 0.76, 0.10) * 100))
    elif feature_key == "eyes":
        angle = abs(raw.get("eye_corner_angle_avg", 0))
        # Lower angle is better; map via proximity to 0 degrees
        return max(_SCORE_FLOOR, int(_proximity(angle, 0, 8.0) * 90))
    elif feature_key == "nose":
        straightness = raw.get("nose_bridge_straightness", 0.5)
        return max(_SCORE_FLOOR, min(100, int(straightness * 100)))
    elif feature_key == "mouth":
        lip_r = raw.get("lip_thickness_ratio", 1.0)
        return max(_SCORE_FLOOR, int(_proximity(lip_r, 0.85, 0.25) * 100))
    elif feature_key == "eyebrows":
        arch = raw.get("eyebrow_arch_ratio", 0.15)
        return max(_SCORE_FLOOR, int(_proximity(arch, 0.15, 0.12) * 100))
    elif feature_key == "forehead":
        hr = raw.get("forehead_height_ratio", 0.33)
        return max(_SCORE_FLOOR, int(_proximity(hr, 0.33, 0.08) * 100))
    elif feature_key == "jawline":
        wr = raw.get("jaw_width_ratio", 0.78)
        return max(_SCORE_FLOOR, int(_proximity(wr, 0.78, 0.12) * 100))
    elif feature_key == "symmetry":
        sym = raw.get("symmetry_score", 80)
        return max(_SCORE_FLOOR, min(100, int(sym)))

    return 50


def _compute_tags(features: dict[str, Any], locale: str) -> list[str]:
    """Select applicable tags based on features."""
    tags: list[str] = []
    raw = features.get("raw_ratios", {})
    shapes = {
        k: features.get(k, {}).get("shape_id", "")
        for k in ["face_shape", "eyes", "nose", "mouth", "eyebrows", "forehead", "jawline"]
    }

    mountains = features.get("five_mountains", {})
    palaces = features.get("twelve_palaces", {})

    checks = {
        "phoenix_eyes": shapes["eyes"] == "phoenix",
        "balanced_courts": features.get("three_courts", {}).get("balanced", False),
        "high_symmetry": raw.get("symmetry_score", 0) > 85,
        "straight_nose": shapes["nose"] in ("straight", "straight_long"),
        "wide_forehead": shapes["forehead"] == "high",
        "upturned_mouth": shapes["mouth"] == "upturned",
        "oval_face": shapes["face_shape"] == "oval",
        "strong_jaw": shapes["jawline"] in ("square", "angular"),
        "expressive_brows": shapes["eyebrows"] in ("high_arch", "long_arch"),
        "golden_ratio": abs(raw.get("five_eyes_ratio", 5.0) - 5.0) < 0.3,
        "mountain_balance": mountains.get("balance", 0) > 0.7,
        "yintang_open": palaces.get("yintang", {}).get("ratio", 1.0) > 1.1,
    }

    for tag_key, labels in _TAG_RULES:
        if checks.get(tag_key, False):
            tags.append(labels.get(locale, labels["zh-CN"]))

    return tags


def _build_summary(features: dict[str, Any], locale: str) -> str:
    """Build a 2-3 sentence summary from feature templates."""
    face_id = features.get("face_shape", {}).get("shape_id", "oval")
    sym_score = features.get("symmetry", {}).get("overall_score", 75)
    courts = features.get("three_courts", {})

    face_tpl = _get_template("face_shape", face_id, locale)

    # Find the highest-scoring feature as standout
    feature_keys = ["eyes", "nose", "mouth", "eyebrows"]
    standout_key = max(feature_keys, key=lambda k: _feature_score(k, features))
    standout_id = features.get(standout_key, {}).get("shape_id", "")

    if locale == "zh-CN":
        court_desc = "三庭匀称" if courts.get("balanced") else "三庭比例略有偏差"
        standout_tpl = _get_template(standout_key, standout_id, locale)
        standout_desc = f"{standout_tpl['label']}最为突出"
        conclusion = "整体面部结构协调，五官搭配和谐。"
        return f"从面部比例看，{court_desc}；五官之中，{standout_desc}。{conclusion}"
    else:
        court_desc = "balanced proportions" if courts.get("balanced") else "slightly asymmetric proportions"
        standout_tpl = _get_template(standout_key, standout_id, locale)
        standout_desc = f"the {standout_tpl['label'].lower()} stands out"
        conclusion = "Overall facial structure is harmonious with well-matched features."
        return f"Proportional analysis shows {court_desc}; among features, {standout_desc}. {conclusion}"


# --- Twelve Palaces & Five Mountains text ---

def _palace_text(palace_key: str, features: dict[str, Any], locale: str) -> str:
    """Generate text for a single palace."""
    palaces = features.get("twelve_palaces", {})
    palace = palaces.get(palace_key, {})
    templates = _TWELVE_PALACES.get(palace_key, {}).get(locale, {})

    ratio = palace.get("ratio", palace.get("score", 0.5))
    ideal = palace.get("ideal")

    if ideal is not None:
        dev = abs(ratio - ideal) / ideal if ideal > 0 else 0
        if dev < 0.15:
            return templates.get("good", "")
        elif dev < 0.35:
            return templates.get("neutral", "")
        else:
            return templates.get("narrow", "")

    # For score-based palaces (no ideal reference)
    if ratio > 0.35:
        return templates.get("good", "")
    elif ratio > 0.2:
        return templates.get("neutral", "")
    return templates.get("narrow", "")


def _mountains_text(features: dict[str, Any], locale: str) -> str:
    """Generate Five Mountains analysis text."""
    mountains = features.get("five_mountains", {})
    balance = mountains.get("balance", 0.5)
    key = "balanced" if balance > 0.6 else "unbalanced"
    entry = _FIVE_MOUNTAINS[key]
    return entry.get(locale) or entry.get("zh-CN", "")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_profile(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Generate profile-tier face reading from extracted features.

    Returns a dict with nested `features` dict and metadata.
    """
    if locale not in ("zh-CN", "en"):
        locale = "zh-CN"

    feature_keys = ["face_shape", "eyes", "nose", "mouth", "eyebrows", "forehead", "jawline", "symmetry"]
    feat_dict: dict[str, Any] = {}

    for key in feature_keys:
        feat = features.get(key, {})
        shape_id = feat.get("shape_id", "")
        if key == "symmetry":
            score = _feature_score(key, features)
            sym_val = feat.get("overall_score", 75)
            if locale == "zh-CN":
                label = "高度对称" if sym_val > 85 else ("较对称" if sym_val > 70 else "略有不对称")
                desc = f"你的面部对称度{sym_val:.0f}分，" + (
                    "左右均衡协调，是很好的天然底子。" if sym_val > 80
                    else "轻微的不对称反而增添了个人特色，完全不需要担心。"
                )
                beauty_tip = ("对称度已经很高，保持自然妆容即可。" if sym_val > 80
                              else "可以通过眉形和修容技巧来增强视觉对称感。")
            else:
                label = "Highly Symmetric" if sym_val > 85 else ("Fairly Symmetric" if sym_val > 70 else "Slightly Asymmetric")
                desc = f"Your symmetry score is {sym_val:.0f}. " + (
                    "Well-balanced features are a wonderful natural foundation."
                    if sym_val > 80
                    else "Slight asymmetry adds unique character -- nothing to worry about."
                )
                beauty_tip = ("Your symmetry is excellent -- minimal correction needed." if sym_val > 80
                              else "Brow shaping and contouring can enhance visual symmetry.")
            feat_dict[key] = {"label": label, "score": score, "description": desc, "beauty_tip": beauty_tip}
        else:
            tpl = _get_template(key, shape_id, locale)
            score = _feature_score(key, features)
            entry: dict[str, Any] = {
                "label": tpl["label"],
                "score": score,
                "description": tpl.get("desc", ""),
                "beauty_tip": tpl.get("beauty_tip", ""),
            }
            secondary_id = feat.get("secondary_id")
            if secondary_id:
                sec_tpl = _get_template(key, secondary_id, locale)
                entry["secondary_label"] = sec_tpl["label"]
                entry["secondary_confidence"] = feat.get("secondary_confidence", 0)
            feat_dict[key] = entry

    tags = _compute_tags(features, locale)
    summary = _build_summary(features, locale)
    disclaimer = (
        "本分析基于面部比例数据，仅供参考。每个人都有独一无二的美。"
        if locale == "zh-CN"
        else "This analysis is based on facial proportions, for reference only. Everyone has unique beauty."
    )

    return {
        "features": feat_dict,
        "tags": tags,
        "summary": summary,
        "disclaimer": disclaimer,
    }


def build_llm_prompt(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> tuple[str, str]:
    """Build system and user prompts for LLM-based detailed analysis.

    Returns (system_prompt, user_prompt).
    Structured as 8 numbered sections for reliable parsing.
    """
    raw = features.get("raw_ratios", {})
    shapes = {}
    shape_labels = {}
    for key in ["face_shape", "eyes", "nose", "mouth", "eyebrows", "forehead", "jawline"]:
        feat = features.get(key, {})
        sid = feat.get("shape_id", "unknown")
        shapes[key] = sid
        tpl = _get_template(key, sid, locale)
        shape_labels[key] = tpl.get("label", sid)

    courts = features.get("three_courts", {})
    five_eyes = features.get("five_eyes", {})
    symmetry = features.get("symmetry", {})
    palaces = features.get("twelve_palaces", {})
    mountains = features.get("five_mountains", {})

    if locale == "zh-CN":
        system_prompt = (
            "你是一位精通中国传统面相学的专家，擅长结合面部比例数据与相学理论进行专业分析。"
            "你熟悉三庭五眼、五岳四渎、十二宫等传统分析框架。"
            "请基于提供的面部测量数据，给出科学与传统相学结合的面部特征解读。"
            "注意：分析应聚焦于面部结构特征与性格特质的关联，避免涉及具体运势预测。"
            "语气专业但易懂，每个部分2-3句话，使用连贯文字（不要使用列表符号或markdown格式）。"
            "请将测量数据自然地融入分析文本中。\n\n"
            "关键术语参考：三庭（天庭/中庭/地阁）、五眼、五岳（额为南岳、鼻为中岳、颏为北岳、左右颧为东西岳）、"
            "印堂（命宫）、山根、准头、人中、法令线、权骨、田宅宫、夫妻宫。\n\n"
            "示例输出格式：\n"
            "1. 三庭比例为上庭33.5%、中庭34.2%、下庭32.3%，三庭基本均等，"
            "说明面部纵向结构协调，传统相学中认为三庭均衡者各阶段发展平稳。\n"
            "2. 五眼比例为4.8，与理想值5.0的偏差仅0.2，"
            "五官横向分布均匀，面部整体比例和谐。"
        )
        user_prompt = (
            f"以下是面部特征测量数据，请进行详细的面相分析：\n\n"
            f"【基础数据】\n"
            f"- 脸型：{shape_labels['face_shape']}（宽高比 {raw.get('face_width_height_ratio', 'N/A')}）\n"
            f"- 三庭比例：上庭 {courts.get('upper', 'N/A')}，中庭 {courts.get('middle', 'N/A')}，下庭 {courts.get('lower', 'N/A')}（{'均衡' if courts.get('balanced') else '略有偏差'}）\n"
            f"- 五眼比例：{five_eyes.get('ratio', 'N/A')}（理想值5.0，偏差 {five_eyes.get('ideal_deviation', 'N/A')}）\n"
            f"- 对称度：{symmetry.get('overall_score', 'N/A')}分\n\n"
            f"【五官数据】\n"
            f"- 眼型：{shape_labels['eyes']}（眼角倾斜 {raw.get('eye_corner_angle_avg', 'N/A')}度，宽高比 {raw.get('eye_width_height_ratio_avg', 'N/A')}）\n"
            f"- 鼻型：{shape_labels['nose']}（长度比 {raw.get('nose_length_ratio', 'N/A')}，宽度比 {raw.get('nose_width_ratio', 'N/A')}，鼻梁直度 {raw.get('nose_bridge_straightness', 'N/A')}）\n"
            f"- 嘴型：{shape_labels['mouth']}（宽度比 {raw.get('mouth_width_ratio', 'N/A')}，唇厚比 {raw.get('lip_thickness_ratio', 'N/A')}，嘴角角度 {raw.get('mouth_corner_angle', 'N/A')}度）\n"
            f"- 眉型：{shape_labels['eyebrows']}（弓高比 {raw.get('eyebrow_arch_ratio', 'N/A')}，长度比 {raw.get('eyebrow_length_ratio', 'N/A')}）\n"
            f"- 额头：{shape_labels['forehead']}（高度比 {raw.get('forehead_height_ratio', 'N/A')}）\n"
            f"- 下颌：{shape_labels['jawline']}（宽度比 {raw.get('jaw_width_ratio', 'N/A')}，角度 {raw.get('jaw_angle_sharpness', 'N/A')}）\n\n"
            f"【十二宫数据】\n"
            f"- 命宫(印堂)宽度比：{palaces.get('yintang', {}).get('ratio', 'N/A')}（理想~1.0倍眼宽）\n"
            f"- 田宅宫(眉眼距)：{palaces.get('tianzhai', {}).get('ratio', 'N/A')}\n"
            f"- 官禄宫(额)：{palaces.get('guanlu', {}).get('score', 'N/A')}\n"
            f"- 财帛宫(鼻头宽度比)：{palaces.get('caibu', {}).get('ratio', 'N/A')}\n"
            f"- 夫妻宫(太阳穴)：{palaces.get('fuqi', {}).get('ratio', 'N/A')}\n"
            f"- 兄弟宫(眉)：{palaces.get('xiongdi', {}).get('score', 'N/A')}\n"
            f"- 迁移宫(太阳穴深度)：{palaces.get('qianyi', {}).get('ratio', 'N/A')}\n"
            f"- 疾厄宫(山根)：{palaces.get('jie_e', {}).get('ratio', 'N/A')}\n"
            f"- 子女宫(卧蚕)：{palaces.get('zinv', {}).get('ratio', 'N/A')}\n"
            f"- 奴仆宫(下颊)：{palaces.get('nupu', {}).get('ratio', 'N/A')}\n"
            f"- 父母宫(日月角)：{palaces.get('fumu', {}).get('ratio', 'N/A')}\n"
            f"- 福德宫(额角)：{palaces.get('fude', {}).get('ratio', 'N/A')}\n\n"
            f"【五岳数据】\n"
            f"- 南岳(额)：{mountains.get('south', {}).get('prominence', 'N/A')}\n"
            f"- 中岳(鼻)：{mountains.get('center', {}).get('prominence', 'N/A')}\n"
            f"- 北岳(颏)：{mountains.get('north', {}).get('prominence', 'N/A')}\n"
            f"- 东岳(右颧)：{mountains.get('east', {}).get('prominence', 'N/A')}\n"
            f"- 西岳(左颧)：{mountains.get('west', {}).get('prominence', 'N/A')}\n"
            f"- 五岳均衡度：{mountains.get('balance', 'N/A')}\n\n"
            f"请严格按以下8个编号输出分析（每部分2-3句连贯文字）：\n"
            f"1. 三庭分析\n"
            f"2. 五眼分析\n"
            f"3. 眼相详析\n"
            f"4. 鼻相详析\n"
            f"5. 口相详析\n"
            f"6. 眉相详析\n"
            f"7. 额颌与五岳\n"
            f"8. 综合特征解读"
        )
    else:
        system_prompt = (
            "You are an expert in traditional Chinese face reading (physiognomy) and facial aesthetics. "
            "You are familiar with Three Courts & Five Eyes, Five Mountains, and Twelve Palaces frameworks. "
            "Analyze facial features based on measurement data, combining scientific proportional analysis "
            "with traditional physiognomy insights. "
            "Focus on facial structure and personality trait correlations; avoid specific fortune predictions. "
            "Keep each section to 2-3 sentences of flowing prose (no bullet points or markdown). "
            "Naturally integrate measurement data into your analysis text.\n\n"
            "Key terminology: Three Courts (upper/middle/lower), Five Eyes, Five Mountains "
            "(forehead=South, nose=Center, chin=North, cheekbones=East/West), "
            "Yintang (Destiny Palace), Property Palace, Spouse Palace.\n\n"
            "Example output format:\n"
            "1. The Three Courts ratio shows upper 33.5%, middle 34.2%, lower 32.3%, "
            "nearly equal proportions indicating balanced vertical facial structure. "
            "Traditional physiognomy considers evenly distributed courts a sign of steady development.\n"
            "2. Five Eyes ratio of 4.8, with only 0.2 deviation from the ideal 5.0, "
            "suggests harmonious horizontal feature distribution."
        )
        user_prompt = (
            f"Facial measurement data for detailed physiognomy analysis:\n\n"
            f"[Base Data]\n"
            f"- Face shape: {shape_labels['face_shape']} (width-height ratio: {raw.get('face_width_height_ratio', 'N/A')})\n"
            f"- Three Courts: upper {courts.get('upper', 'N/A')}, middle {courts.get('middle', 'N/A')}, lower {courts.get('lower', 'N/A')} ({'balanced' if courts.get('balanced') else 'slightly uneven'})\n"
            f"- Five Eyes ratio: {five_eyes.get('ratio', 'N/A')} (ideal: 5.0, deviation: {five_eyes.get('ideal_deviation', 'N/A')})\n"
            f"- Symmetry: {symmetry.get('overall_score', 'N/A')}/100\n\n"
            f"[Feature Data]\n"
            f"- Eyes: {shape_labels['eyes']} (corner angle: {raw.get('eye_corner_angle_avg', 'N/A')} deg, W/H ratio: {raw.get('eye_width_height_ratio_avg', 'N/A')})\n"
            f"- Nose: {shape_labels['nose']} (length ratio: {raw.get('nose_length_ratio', 'N/A')}, width ratio: {raw.get('nose_width_ratio', 'N/A')}, straightness: {raw.get('nose_bridge_straightness', 'N/A')})\n"
            f"- Mouth: {shape_labels['mouth']} (width ratio: {raw.get('mouth_width_ratio', 'N/A')}, lip ratio: {raw.get('lip_thickness_ratio', 'N/A')}, corner angle: {raw.get('mouth_corner_angle', 'N/A')} deg)\n"
            f"- Eyebrows: {shape_labels['eyebrows']} (arch ratio: {raw.get('eyebrow_arch_ratio', 'N/A')}, length ratio: {raw.get('eyebrow_length_ratio', 'N/A')})\n"
            f"- Forehead: {shape_labels['forehead']} (height ratio: {raw.get('forehead_height_ratio', 'N/A')})\n"
            f"- Jawline: {shape_labels['jawline']} (width ratio: {raw.get('jaw_width_ratio', 'N/A')}, angle: {raw.get('jaw_angle_sharpness', 'N/A')})\n\n"
            f"[Twelve Palaces]\n"
            f"- Destiny Palace (yintang width ratio): {palaces.get('yintang', {}).get('ratio', 'N/A')} (ideal ~1.0x)\n"
            f"- Property Palace (brow-eye gap): {palaces.get('tianzhai', {}).get('ratio', 'N/A')}\n"
            f"- Career Palace (forehead): {palaces.get('guanlu', {}).get('score', 'N/A')}\n"
            f"- Wealth Palace (nose tip width): {palaces.get('caibu', {}).get('ratio', 'N/A')}\n"
            f"- Spouse Palace (temple): {palaces.get('fuqi', {}).get('ratio', 'N/A')}\n"
            f"- Siblings Palace (brow): {palaces.get('xiongdi', {}).get('score', 'N/A')}\n"
            f"- Migration Palace (temple depth): {palaces.get('qianyi', {}).get('ratio', 'N/A')}\n"
            f"- Health Palace (nose bridge root): {palaces.get('jie_e', {}).get('ratio', 'N/A')}\n"
            f"- Children Palace (under-eye): {palaces.get('zinv', {}).get('ratio', 'N/A')}\n"
            f"- Servants Palace (lower cheek): {palaces.get('nupu', {}).get('ratio', 'N/A')}\n"
            f"- Parents Palace (forehead-brow): {palaces.get('fumu', {}).get('ratio', 'N/A')}\n"
            f"- Fortune Palace (forehead-temple): {palaces.get('fude', {}).get('ratio', 'N/A')}\n\n"
            f"[Five Mountains]\n"
            f"- South (forehead): {mountains.get('south', {}).get('prominence', 'N/A')}\n"
            f"- Center (nose): {mountains.get('center', {}).get('prominence', 'N/A')}\n"
            f"- North (chin): {mountains.get('north', {}).get('prominence', 'N/A')}\n"
            f"- East (R cheekbone): {mountains.get('east', {}).get('prominence', 'N/A')}\n"
            f"- West (L cheekbone): {mountains.get('west', {}).get('prominence', 'N/A')}\n"
            f"- Balance score: {mountains.get('balance', 'N/A')}\n\n"
            f"Please provide analysis in exactly 8 numbered sections (2-3 sentences each, flowing prose):\n"
            f"1. Three Courts Analysis\n"
            f"2. Five Eyes Analysis\n"
            f"3. Eye Analysis\n"
            f"4. Nose Analysis\n"
            f"5. Mouth Analysis\n"
            f"6. Eyebrow Analysis\n"
            f"7. Forehead, Jawline & Five Mountains\n"
            f"8. Overall Character Insights"
        )

    return system_prompt, user_prompt


def generate_detailed_fallback(
    features: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """Generate detailed analysis text using templates when LLM is unavailable.

    Returns a dict with keys: narrative, three_courts, five_eyes,
    twelve_palaces, five_mountains, and per-feature analyses.
    """
    courts = features.get("three_courts", {})
    five_eyes = features.get("five_eyes", {})

    result: dict[str, Any] = {}

    if locale == "zh-CN":
        balanced = courts.get("balanced", False)
        result["three_courts"] = (
            f"三庭比例为上庭{courts.get('upper', 0):.1%}、中庭{courts.get('middle', 0):.1%}、下庭{courts.get('lower', 0):.1%}。"
            + ("三庭均衡协调，面部纵向比例端正，结构和谐。" if balanced
               else "三庭比例略有偏差，面部纵向结构富有层次感。")
        )
        ratio = five_eyes.get("ratio", 5.0)
        result["five_eyes"] = (
            f"五眼比例为{ratio:.1f}（理想值5.0）。"
            + ("五眼均衡，五官横向分布匀称，整体和谐度高。" if abs(ratio - 5.0) < 0.5
               else f"五眼偏差{five_eyes.get('ideal_deviation', 0):.1f}，五官排列个性鲜明。")
        )
    else:
        balanced = courts.get("balanced", False)
        result["three_courts"] = (
            f"Three Courts ratio: upper {courts.get('upper', 0):.1%}, middle {courts.get('middle', 0):.1%}, lower {courts.get('lower', 0):.1%}. "
            + ("Well-balanced vertical proportions create a harmonious facial structure." if balanced
               else "Slight variation in proportions adds visual depth and dimension to the face.")
        )
        ratio = five_eyes.get("ratio", 5.0)
        result["five_eyes"] = (
            f"Five Eyes ratio: {ratio:.1f} (ideal: 5.0). "
            + ("Balanced distribution indicates overall facial harmony." if abs(ratio - 5.0) < 0.5
               else f"Deviation of {five_eyes.get('ideal_deviation', 0):.1f} gives distinctive character to the features.")
        )

    # Twelve Palaces summary
    palace_texts = []
    for pk in ["yintang", "tianzhai", "guanlu", "caibu", "fuqi", "xiongdi",
               "qianyi", "jie_e", "zinv", "nupu", "fumu", "fude"]:
        text = _palace_text(pk, features, locale)
        if text:
            palace_texts.append(text)
    result["twelve_palaces"] = " ".join(palace_texts)

    # Five Mountains summary
    result["five_mountains"] = _mountains_text(features, locale)

    # Per-feature detailed text
    feature_analyses: dict[str, str] = {}
    for key in ["eyes", "nose", "mouth", "eyebrows", "forehead", "jawline"]:
        shape_id = features.get(key, {}).get("shape_id", "")
        tpl = _get_template(key, shape_id, locale)
        conf = features.get(key, {}).get("confidence", 0)
        secondary_id = features.get(key, {}).get("secondary_id")

        if locale == "zh-CN":
            text = f"{tpl['label']}：{tpl['desc']}"
            if secondary_id and conf < 0.6:
                sec_tpl = _get_template(key, secondary_id, locale)
                text += f" 同时也兼具{sec_tpl['label']}的部分特征。"
        else:
            text = f"{tpl['label']}: {tpl['desc']}"
            if secondary_id and conf < 0.6:
                sec_tpl = _get_template(key, secondary_id, locale)
                text += f" Also shows some {sec_tpl['label'].lower()} characteristics."
        feature_analyses[key] = text

    result["feature_analyses"] = feature_analyses

    # Build full narrative from all parts
    parts = [result["three_courts"], result["five_eyes"]]
    if result.get("twelve_palaces"):
        parts.append(result["twelve_palaces"])
    if result.get("five_mountains"):
        parts.append(result["five_mountains"])
    for desc in feature_analyses.values():
        parts.append(desc)
    result["narrative"] = " ".join(parts)

    return result
