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
from typing import Any


def _pick(variants: list | tuple, *keys: str):
    """Deterministically select a variant based on feature combination.

    Uses MD5 hash for cross-process stability (Python hash() is randomized).
    Same feature keys always produce the same variant.
    """
    seed = hashlib.md5("".join(keys).encode()).digest()
    return variants[seed[0] % len(variants)]


# ---------------------------------------------------------------------------
# Bilingual template data
# ---------------------------------------------------------------------------

_FACE_SHAPE = {
    "round": {
        "zh-CN": {"label": "圆脸", "desc": [
            "面部线条柔和饱满，天然带着亲和力。这种脸型上镜时会显得格外有感染力，尤其是笑起来的时候。",
            "圆润的轮廓让你的面部自带一种'无攻击性'的亲切感——这在社交场合其实是很大的优势。不过别被柔和的线条骗了，配上对的妆容气场照样拉满。",
            "你的脸型属于人群里让人觉得好相处的类型，线条流畅没有棱角。有意思的是，圆脸在东亚审美里一直很吃香，天然减龄。",
        ], "beauty_tip": [
            "侧分发型可以拉长视觉比例，修容打在颧骨下方到下颌的位置效果最自然。",
            "层次感的中长发是圆脸的黄金搭档。修容的关键在颧骨下方那条线，轻扫就好别下手太重。",
            "想要显瘦首选侧分+颧骨阴影，想要保留甜感就选中分+苹果肌腮红，两个方向都适合你。",
        ]},
        "en": {"label": "Round Face", "desc": [
            "Soft, full contours that naturally radiate warmth. This face shape is especially photogenic -- your smile will be the standout.",
            "The rounded silhouette gives you an innately approachable quality -- a genuine social advantage. Don't let the softness fool you, though: with the right makeup, you can absolutely command a room.",
            "Your face shape reads as friendly and easy to be around, with smooth, angular-free lines. Fun fact: round faces tend to age gracefully, keeping that youthful look longer.",
        ], "beauty_tip": [
            "Side parts elongate the visual proportions; contour from below the cheekbones down to the jaw for the most natural effect.",
            "Layered mid-length hair is a round face's best friend. The contouring sweet spot is that line below the cheekbones -- go light.",
            "For a slimming effect: side part + cheekbone shadow. For keeping the sweet vibe: center part + apple blush. Both directions suit you well.",
        ]},
    },
    "oval": {
        "zh-CN": {"label": "鹅蛋脸", "desc": [
            "脸型比例很协调，额宽颌窄的过渡流畅自然。这种轮廓的好处是'百搭'——几乎不挑发型和妆容。",
            "鹅蛋脸被公认为最均衡的脸型之一，你的上宽下窄过渡很自然。不过也正因为太'标准'，反而需要靠五官和造型来创造记忆点。",
            "你的脸型是化妆师最喜欢的画布——比例匀称，不需要大幅修容就能出效果。各种风格都能驾驭，可以大胆折腾。",
        ], "beauty_tip": [
            "你的脸型本身就是优势，发型和妆容可以放开尝试，不用考虑太多'修饰'。",
            "鹅蛋脸的修容原则是'锦上添花而非矫正'——轻扫高光突出骨骼结构就够了。发型随意选，你的脸型不挑。",
            "想走清冷路线选直发露额，想要活力感选层次卷发——你的脸型的好处是什么方向都不会出错。",
        ]},
        "en": {"label": "Oval Face", "desc": [
            "Well-balanced proportions with a smooth taper from forehead to jaw. The perk of this shape: it's the ultimate all-rounder for hairstyles and makeup.",
            "Oval is widely considered the most balanced face shape, and your upper-to-lower transition is beautifully smooth. The flip side? You may need your features and styling to create that memorable edge.",
            "Your face shape is every makeup artist's dream canvas -- balanced proportions that look great with minimal contouring. Feel free to experiment boldly.",
        ], "beauty_tip": [
            "Your face shape is already an asset -- try different hairstyles and makeup freely without worrying about correction.",
            "For oval faces, contouring is about enhancement, not correction. A touch of highlight along the bone structure is enough. Pick any hairstyle -- your shape handles it.",
            "For a cool, sleek look: straight hair, forehead out. For energy: layered curls. The beauty of your face shape is that neither direction can go wrong.",
        ]},
    },
    "square": {
        "zh-CN": {"label": "方脸", "desc": [
            "颌骨线条分明，轮廓的骨骼感很强。这种脸型在高端时尚领域非常受青睐——很多超模都是方脸。",
            "方正的轮廓天然自带一种'不好惹'的气场，辨识度很高。不过方脸的另一面是笑起来反差感特别强，硬朗和温柔切换自如。",
            "你的骨骼架构感很突出，下颌角的存在感给整张脸定了一个'有力量'的基调。这种脸型不是所有人都能驾驭，但驾驭住了就是高级感。",
        ], "beauty_tip": [
            "柔和的长层次发型能平衡线条硬度，修容的重点在下颌角——轻扫阴影就能柔化。",
            "想强调气场就保留棱角，用修容强化骨骼线条；想走柔美路线就在下颌角打阴影、选波浪卷发。两个方向都很有看头。",
            "下颌角的阴影修容是最有效的手段，搭配侧分长发效果翻倍。不过如果你喜欢干练风格，完全不修饰也很酷。",
        ]},
        "en": {"label": "Square Face", "desc": [
            "Strong jawline definition with prominent bone structure. This face shape is highly prized in high fashion -- many top models share your contours.",
            "The angular silhouette gives you a natural 'don't mess with me' presence. But here's the thing: when you smile, the contrast is striking -- switching between strong and warm effortlessly.",
            "Your skeletal structure really stands out, with the jaw angles setting a 'powerful' tone for the whole face. Not everyone can pull off this shape, but when you do, it reads as pure sophistication.",
        ], "beauty_tip": [
            "Soft layered long hair balances the angular lines; focus contouring on the jaw corners with a light shadow to soften.",
            "To amplify presence: embrace the angles and contour to enhance bone structure. For a softer look: shadow the jaw corners and go with wavy hair. Both directions look great.",
            "Jaw corner shadow is the single most effective technique, and it doubles its impact with a side-parted long style. That said, if you prefer the sharp look, leaving it uncontoured is cool too.",
        ]},
    },
    "long": {
        "zh-CN": {"label": "长脸", "desc": [
            "面部线条修长舒展，纵向比例突出。这种脸型天然有一种从容优雅的气质，知性路线很适合你。",
            "修长的面部比例让你的五官有更多'呼吸空间'，不拥挤。不过长脸的一个小诀窍是用横向元素来平衡——刘海和蓬松两侧的发型效果立竿见影。",
            "你的面部纵向延展感很好，给人一种干净利落的印象。有意思的是，长脸在动态表情时反而比静态照片更有优势，表情的展开空间更大。",
        ], "beauty_tip": [
            "空气刘海是缩短纵向比例最省力的方法，两侧蓬松增加横向宽度感。",
            "修容思路是'横向扩展'：两侧腮红打宽一些，避免纵向拉长的高光。刘海选空气感或法式的，别选厚重齐刘海。",
            "蓬松的卷发在两侧增加体量感效果最好。修容时在发际线和下巴的边缘轻扫阴影，视觉上能缩短一些。",
        ]},
        "en": {"label": "Long Face", "desc": [
            "Elongated, gracefully extended facial lines with prominent vertical proportions. This shape naturally conveys composure and elegance -- the intellectual look suits you well.",
            "The extended proportions give your features more 'breathing room' -- nothing feels crowded. A small tip: horizontal elements work wonders for balance -- bangs and side volume deliver instant results.",
            "Great vertical extension that gives a clean, polished impression. Interestingly, long faces actually look better in motion than in static photos -- there's more room for expressions to unfold.",
        ], "beauty_tip": [
            "Wispy bangs are the easiest way to shorten vertical proportions; add volume at the sides for width.",
            "Think 'horizontal expansion': apply blush wider on the sides, avoid vertically elongating highlights. Go for airy or curtain bangs, not heavy straight-across ones.",
            "Voluminous curls adding body at the sides work best. Lightly shadow the hairline and chin edges when contouring to visually compact the length.",
        ]},
    },
    "diamond": {
        "zh-CN": {"label": "菱形脸", "desc": [
            "颧骨是你面部轮廓的主角，线条立体鲜明，辨识度很高。这种脸型在人群中一眼就能被注意到。",
            "菱形脸的特点是'中间宽、上下窄'，颧骨的存在感让面部自带立体雕塑感。不过额头和下巴相对窄一些，造型时注意平衡。",
            "你的面部结构很有雕塑感——颧骨的高度和角度决定了整张脸的个性基调。这种脸型在镜头前的光影效果特别好，天然带着'棱'。",
        ], "beauty_tip": [
            "法式刘海平衡额头和颧骨的比例，下颌处的卷发或碎发增加柔和感。",
            "颧骨是你的优势不用刻意弱化，高光打在颧骨最高点反而更出彩。额头区域可以用刘海修饰，下巴处加一点体量感。",
            "修容的核心是'填补上下'：额头两侧打亮拓宽，下巴处添加体量。颧骨本身足够突出，不需要额外强调。",
        ]},
        "en": {"label": "Diamond Face", "desc": [
            "Your cheekbones are the star of your facial contours -- sculpted, defined, and impossible to miss in a crowd.",
            "The diamond shape means 'wide in the middle, narrow top and bottom' -- those cheekbones give your face a natural 3D quality. Just mind the balance with a narrower forehead and chin when styling.",
            "Your facial structure has a sculptural quality -- the cheekbone height and angle set the personality tone for the whole face. This shape catches light beautifully on camera, with natural dimension.",
        ], "beauty_tip": [
            "Curtain bangs balance the forehead-to-cheekbone ratio; curls or wispy layers at the jaw add softness.",
            "Your cheekbones are an asset -- don't downplay them. Highlight on the highest point actually looks stunning. Use bangs for the forehead, and add some volume near the chin.",
            "The contouring strategy is 'fill top and bottom': brighten the temple area for width, add volume at the chin. The cheekbones already have enough presence on their own.",
        ]},
    },
    "heart": {
        "zh-CN": {"label": "心形脸", "desc": [
            "宽额配精致下巴，形成优美的倒三角轮廓。这种脸型天然显小，镜头前特别吃香。",
            "心形脸的轮廓线条像一个漂亮的倒三角——从宽阔的额头到尖巧的下巴，过渡流畅。这种脸型的辨识度来自下半脸的精致感。",
            "你的脸型属于'上半脸气场、下半脸精致'的组合。宽额给了你存在感，精致的下巴又收得恰到好处，整体比例看起来很灵动。",
        ], "beauty_tip": [
            "下巴两侧增加发量平衡上宽下窄的比例，腮红打在苹果肌效果很好。",
            "心形脸的修容思路是'弱化上部、充实下部'：太阳穴轻扫阴影收窄，下巴两侧用碎发或腮红增加柔和度。",
            "发型上选择在下颌位置有体量的款式——bob头或外翻卷发都不错。妆容方面苹果肌腮红能让整体更平衡。",
        ]},
        "en": {"label": "Heart Face", "desc": [
            "A broad forehead tapering to a delicate chin, forming a graceful inverted triangle. This shape naturally looks small on camera -- very photogenic.",
            "Your contour traces a beautiful inverted triangle -- from a wide forehead down to a refined chin, smoothly tapered. The signature of this shape is the delicacy in the lower face.",
            "Your face combines 'presence up top, refinement below.' The broad forehead gives you gravitas, while the delicate chin finishes things off perfectly -- the overall proportions feel lively.",
        ], "beauty_tip": [
            "Add hair volume at the jaw to balance the wider-top-narrower-bottom ratio; blush on the apples of the cheeks works nicely.",
            "The contouring logic is 'soften the top, fill the bottom': light temple shadow to narrow, plus face-framing layers or blush near the chin for softness.",
            "Hairstyles with volume at jaw level work well -- bobs or flipped-out curls are great options. Makeup-wise, apple blush brings everything into balance.",
        ]},
    },
    "pear": {
        "zh-CN": {"label": "梨形脸", "desc": [
            "下颌轮廓圆润有力，面部重心偏下，整体给人一种稳重踏实的印象。",
            "你的面部下半部分比上半部分更宽——这让整张脸有一种'稳固'的感觉。不过也正因为下颌有存在感，在造型上有很大的发挥空间。",
            "梨形脸的特点是下宽上窄，下颌的线条感很突出。这种脸型在动态中其实比静态更好看——说话和笑起来时下半脸的表情会很生动。",
        ], "beauty_tip": [
            "头顶蓬松和两侧增加体量来平衡比例，额头打亮可以提升整体协调度。",
            "发型关键词是'上部蓬松'——头顶体量感和额头区域的高光能有效平衡比例。避免贴头皮的造型。",
            "侧分大波浪是梨形脸的好搭档，在头顶创造体量的同时柔化下颌线条。额头区域用高光提亮效果明显。",
        ]},
        "en": {"label": "Pear Face", "desc": [
            "A full, strong jawline that grounds the face -- the center of gravity sits low, giving an impression of steadiness and reliability.",
            "Your lower face is wider than the upper, lending a sense of solidity. The upside: that strong jaw provides a lot of creative room for styling.",
            "The pear shape means narrower on top, wider below, with the jaw stealing focus. Interestingly, this shape looks even better in motion -- the lower face becomes very expressive when talking or laughing.",
        ], "beauty_tip": [
            "Crown volume and side fullness balance the proportions; highlighting the forehead area boosts overall harmony.",
            "The styling keyword is 'volume up top' -- crown height and forehead highlight effectively counterbalance. Avoid flat, slicked-back styles.",
            "Side-swept waves are a pear face's best friend, creating crown volume while softening the jawline. Forehead highlight makes a noticeable difference.",
        ]},
    },
}

_EYE_SHAPE = {
    "phoenix": {
        "zh-CN": {"label": "丹凤眼", "desc": [
            "眼尾的上扬弧度让你的眼神天然带着一点锐利感，这种眼型在东方审美里一直很受推崇。不过也正因为线条感强，笑起来的反差会格外有感染力。",
            "你的眼型属于人群里一眼就能被认出来的类型——眼角上扬的弧度刚刚好，有气场但不凶。有意思的是，这种眼型拍照时侧面往往比正面更有戏。",
            "丹凤眼的核心优势在于辨识度高，你的眼角弧度恰好在'清冷'和'亲和'之间。配合不同的眼妆可以在两个方向自由切换，可塑性很强。",
        ], "beauty_tip": [
            "顺着眼型上扬的方向画眼线效果最自然，睫毛也往上挑一些，强化天然优势。",
            "上扬眼线是标配，但偶尔试试下垂眼线反而会有惊喜——反差感很有趣。日常妆的话，只画上眼线就够了。",
            "清冷风走加长上扬眼线，可爱风走圆形放大的画法。你的眼型两种路线都能走通，关键看你当天想要什么氛围。",
        ]},
        "en": {"label": "Phoenix Eyes", "desc": [
            "The upward sweep of your eye corners gives your gaze a natural edge -- this shape has always been celebrated in Eastern aesthetics. The payoff: when you smile, the contrast is magnetic.",
            "Your eye shape is the kind that gets recognized instantly in a crowd -- the upward tilt hits that sweet spot between commanding and approachable. Interestingly, these eyes often look even more striking from the side.",
            "The core strength of phoenix eyes is distinctiveness, and your corner angle sits right between 'cool' and 'warm.' Different eye looks can shift you either way -- very versatile.",
        ], "beauty_tip": [
            "Follow the natural upward line when drawing eyeliner; angle lashes upward too for a cohesive look.",
            "Winged liner is the classic move, but try a downturned line sometime for an unexpected twist. For everyday, just a top liner is enough.",
            "For a cool vibe: extended wing. For a softer look: rounded, pupil-enlarging liner. Your eye shape can pull off both -- it's about the mood you want.",
        ]},
    },
    "almond": {
        "zh-CN": {"label": "杏仁眼", "desc": [
            "眼型比例匀称，内外眼角的位置刚好，宽高比很协调。这种眼型是化妆师公认最好上妆的类型——什么风格都接得住。",
            "杏仁眼被认为是'黄金眼型'，你的眼部线条温润又不失神采。不过因为太'标准'了，反而需要用眼妆来创造个性——好消息是什么风格都不会翻车。",
            "你的眼型比例接近教科书水准，不挑眼影色也不挑眼线画法。这算是一种'隐形优势'——看似平淡，实际操作空间极大。",
        ], "beauty_tip": [
            "杏仁眼什么都能试，想要日常感就走裸妆路线，想要出挑就大胆用色。",
            "没有硬伤就是最大的优势——烟熏、清透、复古、甜美，挑一个方向练精就好。不需要为'矫正'花心思。",
            "眼影可以大胆用色，你的眼型不挑。日常选大地色打底+眼尾微微拉长，正式场合直接上浓郁色也不会出错。",
        ]},
        "en": {"label": "Almond Eyes", "desc": [
            "Well-proportioned with perfectly placed inner and outer corners -- makeup artists universally agree this is the most versatile eye shape to work with.",
            "Almond eyes are considered the 'golden ratio' of eye shapes, with lines that are warm yet lively. The mild 'problem': they're so standard that you'll want eye makeup to add personality -- luckily, nothing can go wrong.",
            "Your eye proportions are textbook-level -- any shadow color, any liner style works. It's a 'stealth advantage' -- looks simple but the creative range is enormous.",
        ], "beauty_tip": [
            "Almond eyes can handle anything -- go minimal for daily wear, bold colors for standout moments.",
            "No flaws to fix is the biggest perk -- smoky, natural, vintage, cute. Pick a direction and master it. No correction needed.",
            "Go bold with shadow colors -- your eye shape won't fight them. For daily: earth tones with a slight outer extension. For formal: rich colors work just fine.",
        ]},
    },
    "round": {
        "zh-CN": {"label": "圆眼", "desc": [
            "眼睛大而明亮，虹膜露出比例高，天然有一种'清澈感'。这种眼型让你看起来比实际年龄年轻，笑起来尤其有感染力。",
            "圆圆的眼型自带一种天真无辜的气质——这不是装出来的，是骨骼和眼部比例决定的。不过别小看这个优势，很多人花大价钱都在追求这种效果。",
            "你的眼型属于'一看就觉得亲切'的类型，大而圆的轮廓让整张脸多了一份活力感。这种眼睛在表达情绪时特别生动，眼神的变化幅度大。",
        ], "beauty_tip": [
            "眼尾稍微拉长的眼线可以调节圆度，想保持可爱感就画卧蚕妆突出下眼。",
            "想要显成熟一点，用眼尾外延的长眼线；想保持甜感，圆形环绕眼线+下眼亮片效果绝佳。两个路线都很适合。",
            "卧蚕是你的加分项，用亮色眼影提亮下眼中部效果最好。眼线不需要画太粗，细细一条提神就够了。",
        ]},
        "en": {"label": "Round Eyes", "desc": [
            "Large and bright, with a high iris-to-white ratio that gives a natural 'clarity.' This eye shape makes you look younger than your age, especially when you smile.",
            "Round eyes carry an innate candid charm -- it's not an act, it's bone structure and proportions. Don't underestimate this: many people pay good money trying to achieve this exact effect.",
            "Your eye shape reads as instantly approachable -- the large, round contour adds a spark of vitality to the whole face. These eyes are especially expressive, with a wide range of emotional depth.",
        ], "beauty_tip": [
            "A slightly extended outer liner adjusts the roundness; for maximum cuteness, go with aegyo-sal (under-eye) highlight.",
            "For a more mature look: elongated outer wing. For sweet energy: round smudged liner + under-eye shimmer. Both routes work beautifully.",
            "Aegyo-sal is your bonus feature -- brighten the center of the lower lid with a light shimmer. Keep the liner thin; a fine line for definition is plenty.",
        ]},
    },
    "narrow": {
        "zh-CN": {"label": "细长眼", "desc": [
            "眼型修长深邃，眼裂宽度突出但纵向较窄，自带一种清冷知性的味道。这种眼型在淡妆和素颜时尤其有一种'高级感'。",
            "细长的眼型让你的眼神有一种'慢慢聚焦'的层次感——不是一眼看透，而是越看越有东西。这在东方审美中属于很有意境的类型。",
            "你的眼型线条流畅修长，比起圆眼的直白可爱，更多了一份内敛和深邃。有意思的是，这种眼型在表达认真和专注时格外有说服力。",
        ], "beauty_tip": [
            "眼中部用珠光或亮片提亮增加立体感，避免在下眼线画太重显得眼睛更窄。",
            "放大眼部的关键不是画粗眼线，而是用浅色在眼中提亮+卧蚕打亮。眼尾可以微微上扬，但不用刻意拉长。",
            "大地色和金属色眼影是你的好搭档，能给窄长的眼型增加深度和层次。关键技巧：眼中高光一定要打，这是让眼睛'亮起来'的核心。",
        ]},
        "en": {"label": "Narrow Eyes", "desc": [
            "Elongated and deep-set, with pronounced width but less height -- there's a natural cool, intellectual quality. This shape looks especially 'expensive' with minimal or no makeup.",
            "The elongated shape gives your gaze a 'slow focus' quality -- not immediately transparent, but the more you look, the more there is. This is a highly prized aesthetic in Eastern beauty.",
            "Your eye lines flow long and smooth -- more reserved and deep compared to round-eye directness. Interestingly, this eye shape is especially convincing when expressing focus and seriousness.",
        ], "beauty_tip": [
            "Shimmer or glitter at the center lid adds dimension; keep lower liner light to avoid making eyes appear narrower.",
            "The key to opening up the eyes isn't thick liner, but light shimmer at the center + aegyo-sal highlight. A slight upward tail is fine, but no need to elongate further.",
            "Earth tones and metallics are your allies, adding depth and layers to the elongated shape. The essential move: always highlight the center lid -- it's what makes the eyes 'light up.'",
        ]},
    },
    "droopy": {
        "zh-CN": {"label": "垂眼", "desc": [
            "眼尾自然下垂，线条柔和，让你的表情天然带着一种温柔治愈的气质。这种眼型在不笑的时候也像在微笑。",
            "垂眼的魅力在于'无攻击性'——你的眼神让人放松，这是一种很稀缺的面部特质。不过想要在正式场合更有气场的话，眼妆可以稍做调整。",
            "你的眼角线条自然向下，给整张脸营造了一种安静温和的氛围。有趣的是，这种眼型在近几年越来越受欢迎，很多人反而在追求'下垂眼'的妆容效果。",
        ], "beauty_tip": [
            "眼尾微微上挑的眼线可以提升眼神，浅色系眼影让眼部更有精神。",
            "日常可以顺着自然弧度画，保留温柔感；需要气场的场合就在眼尾上挑2-3mm。两种画法交替使用最有趣。",
            "关键技巧是眼尾的方向控制：平画保持中性，上挑增加锐利，顺着下垂画则强化温柔感。你的眼型可以通过这一个变量切换风格。",
        ]},
        "en": {"label": "Droopy Eyes", "desc": [
            "Naturally downturned outer corners with soft lines, giving your expression an innate gentle, soothing quality. This eye shape looks like it's smiling even when you're not.",
            "The charm of droopy eyes is their 'zero aggression' -- your gaze puts people at ease, which is a rare facial trait. For more authority in formal settings, a simple liner adjustment does the trick.",
            "Your eye corners droop naturally, creating a quiet, gentle atmosphere across the whole face. Fun fact: this eye shape has become increasingly sought-after -- many people actively try to recreate the 'puppy eye' look.",
        ], "beauty_tip": [
            "A slight upward flick at the outer corner lifts the gaze; light-colored shadows keep the eye area fresh.",
            "For daily: follow the natural curve to keep the gentle vibe. For impact: flick up 2-3mm at the outer corner. Alternating between both is the most fun approach.",
            "The key variable is outer corner direction: horizontal for neutral, upward for sharpness, downward to amplify softness. Your eye shape can switch styles with just this one tweak.",
        ]},
    },
}

_NOSE_SHAPE = {
    "straight": {
        "zh-CN": {"label": "直鼻", "desc": [
            "鼻梁线条流畅挺拔，从山根到鼻尖几乎没有弯曲。这种鼻型给面部中线提供了很好的纵向支撑，侧面轮廓会特别利落。",
            "直鼻是面部立体感的基石——你的鼻梁线条干净流畅，修容时几乎不需要矫正方向，顺着画就很好看。",
            "你的鼻梁像一条挺拔的中线，把面部左右均匀分割。这种鼻型不抢戏但很重要，是五官协调感的'定海神针'。",
        ], "beauty_tip": [
            "沿鼻梁打一道细高光突出立体感，鼻翼两侧轻扫阴影，效果自然又精致。",
            "你的鼻梁本身就是很好的修容基础，高光沿中线画就好，不用考虑方向修正。日常裸妆只打高光就够了。",
            "想要更锐利就强化鼻侧阴影，想要柔和就只用高光。你的鼻型给了你两个方向的选择权。",
        ]},
        "en": {"label": "Straight Nose", "desc": [
            "A clean, straight bridge from root to tip with barely any curve. This provides great vertical support for the facial center line -- your side profile will look especially sharp.",
            "A straight nose is the cornerstone of facial dimension -- your bridge line is clean and smooth, requiring almost no directional correction when contouring. Just follow the line.",
            "Your bridge acts as a crisp center line, dividing the face evenly. This nose doesn't steal the show but it's crucial -- the 'anchor' that holds all features in harmony.",
        ], "beauty_tip": [
            "A thin highlight down the bridge for dimension, gentle shadow on both sides -- natural and refined.",
            "Your bridge is already a great contouring canvas; just follow the center line. For everyday bare-face looks, highlight alone is enough.",
            "Want sharper? Intensify the side shadow. Want softer? Stick to just highlight. Your nose shape gives you both options.",
        ]},
    },
    "straight_long": {
        "zh-CN": {"label": "悬胆鼻", "desc": [
            "鼻梁高挺修长，面部的立体感主要靠它来撑。这种鼻型给整张脸定了一个'有深度'的基调，正面和侧面都很能打。",
            "你的鼻梁高度和长度都高于平均水准，这在面部立体感上是天然的加分项。不过也因为存在感强，拍照角度的影响会比普通鼻型更明显。",
            "悬胆鼻的核心优势是'架构感'——高挺的鼻梁让整张脸的纵深立刻丰富起来。有趣的是，这种鼻型在45度角拍照时最好看。",
        ], "beauty_tip": [
            "鼻梁高光不用打太长，在鼻尖稍微加一点阴影让鼻型更精致、更收敛。",
            "修容的重点不在鼻梁（已经够立体了），而在鼻尖和鼻翼的收窄。轻轻一扫就够，别下手太重。",
            "拍照时微微低头的角度最能发挥你的鼻型优势。修容方面，鼻尖的高光点要控制好大小——太大反而会显鼻头大。",
        ]},
        "en": {"label": "Prominent Straight Nose", "desc": [
            "A tall, long bridge that carries the face's dimensionality. This nose sets a 'depth-rich' tone for the whole face -- it looks great from both front and side.",
            "Your bridge height and length are both above average -- a natural boost to facial dimension. The flip side: because it's prominent, camera angles affect the look more than with smaller noses.",
            "The signature advantage of a prominent nose is 'architectural presence' -- the tall bridge instantly enriches facial depth. Fun fact: this nose type looks best at a 45-degree angle.",
        ], "beauty_tip": [
            "Keep the bridge highlight moderate in length; add a touch of shadow at the tip for a more refined, contained finish.",
            "The contouring priority isn't the bridge (it's already dimensional), but narrowing the tip and wings. A light touch is enough -- don't overdo it.",
            "A slight downward camera angle best showcases your nose. For contouring: control the size of the tip highlight -- too large and it can make the tip look bigger.",
        ]},
    },
    "aquiline": {
        "zh-CN": {"label": "鹰钩鼻", "desc": [
            "鼻梁带有自然的弧度，轮廓线条不是直的而是有故事的。这种鼻型辨识度极高，在西方审美中一直被视为'有性格'的标志。",
            "你的鼻梁弧线是独特的辨识符号——不追求直线的标准美，反而有一种不可复制的个人风格。这种鼻型在侧面看最有韵味。",
            "鹰钩鼻的弧度给面部增添了戏剧性的线条感。有意思的是，很多经典银幕形象的标志就是这种有弧度的鼻梁——辨识度是它最大的资产。",
        ], "beauty_tip": [
            "在鼻梁弧度处轻扫高光可以柔化线条，如果想强调个性则保持原样更酷。",
            "想柔化弧度：在弧线处打亮。想强化个性：在两侧加阴影让弧线更突出。这取决于你想要哪种风格。",
            "侧面的弧度是你的标志，修容时注意不要试图'修平'它——接受并强化比掩盖效果好得多。",
        ]},
        "en": {"label": "Aquiline Nose", "desc": [
            "A naturally curved bridge with a profile that tells a story. This nose type has extreme distinctiveness and has always been seen as a mark of 'character' in Western aesthetics.",
            "Your bridge curve is a unique identifier -- rather than chasing straight-line standards, it carries an irreplicable personal style. This nose type is at its most striking in profile.",
            "The aquiline curve adds dramatic line work to the face. Fun fact: many iconic screen presences are defined by exactly this kind of curved bridge -- distinctiveness is its greatest asset.",
        ], "beauty_tip": [
            "Highlight at the curve softens the line; if you want to emphasize character, leaving it as-is is even cooler.",
            "To soften the curve: brighten at the arc. To amplify character: shadow the sides to make the curve pop. It comes down to which style you're going for.",
            "The side-profile curve is your signature -- don't try to 'flatten' it with contouring. Embracing and enhancing works far better than concealing.",
        ]},
    },
    "snub": {
        "zh-CN": {"label": "小巧鼻", "desc": [
            "鼻型小巧精致，鼻梁不高但很协调。这种鼻型在面部整体中不抢戏，反而让其他五官成为焦点——是很好的'配角'。",
            "小巧的鼻型让面部整体显得更紧凑精致，有一种天然的少女感。和你的其他五官搭配起来不突兀，和谐度很高。",
            "你的鼻型属于'小而精'的类型——不以存在感取胜，而是用协调感加分。这种鼻型的好处是不挑角度，正面侧面差别不大。",
        ], "beauty_tip": [
            "鼻尖打一小点高光增加精致感，鼻影从眉头到鼻翼方向轻扫就好。",
            "不需要大面积修容，重点放在鼻尖的精致度上。一点高光+眉头到鼻侧的淡淡阴影就够了。",
            "修容时收窄鼻侧的阴影可以让鼻型看起来更挺拔，但不用追求'变高'——你的鼻型的优势在于协调，不在于高度。",
        ]},
        "en": {"label": "Snub Nose", "desc": [
            "Petite and refined, with a moderate bridge that harmonizes well. This nose doesn't steal focus, letting other features shine -- an excellent 'supporting player.'",
            "The small nose makes the whole face feel compact and delicate, with a natural youthful quality. It blends seamlessly with your other features -- high harmony score.",
            "Your nose is the 'small but precise' type -- it wins through coordination, not presence. The perk: it's angle-proof, looking consistent from front and side alike.",
        ], "beauty_tip": [
            "A dot of highlight on the tip adds refinement; sweep shadow lightly from the brow area down to the wings.",
            "No need for heavy contouring -- focus on tip refinement. A touch of highlight + a faint brow-to-side shadow does the job.",
            "Side shadow can make the nose appear slightly taller, but don't chase height -- your nose's strength is harmony, not prominence.",
        ]},
    },
    "snub_wide": {
        "zh-CN": {"label": "蒜头鼻", "desc": [
            "鼻头圆润饱满，线条柔和。在面相学里这种鼻型被认为是'福相'，在日常审美中则增添了一份亲切感。",
            "你的鼻头有一种可爱的圆润感——不锐利、不冷淡，给面部增添了温度。不过如果想要更精致的效果，鼻翼的修容就是关键。",
            "圆润的鼻头让你的面部中央有一种柔和的质感，和棱角分明的鼻型是完全不同的气质方向。这种鼻型在动态中（说话、笑）比照片里更有魅力。",
        ], "beauty_tip": [
            "鼻翼两侧轻扫阴影视觉收窄鼻头，鼻梁打高光增加整体立体感。",
            "修容的核心就一个动作：鼻翼两侧的阴影。画的时候用小号刷子，沿着鼻翼沟走，效果自然又有效。",
            "日常妆不用刻意修饰，正式场合在鼻翼收一下阴影就好。鼻头的高光点要小——小而亮比大而模糊好看。",
        ]},
        "en": {"label": "Bulbous Nose", "desc": [
            "Full, rounded tip with soft lines. In face reading tradition, this nose is considered auspicious; in everyday aesthetics, it adds a layer of approachability.",
            "Your nose tip has an endearing roundness -- not sharp, not cold, adding warmth to the face. For a more refined look, wing contouring is the key lever.",
            "The rounded tip gives your facial center a soft quality -- a completely different vibe from sharp noses. This nose type actually looks more charming in motion (talking, laughing) than in photos.",
        ], "beauty_tip": [
            "Light shadow along the wing creases visually narrows the tip; bridge highlight boosts overall dimension.",
            "The one essential move: shadow along the wing creases. Use a small brush, follow the crease line -- natural and effective.",
            "Skip contouring for daily wear; for formal occasions, a touch of wing shadow does the trick. Keep the tip highlight small -- small and bright beats large and diffused.",
        ]},
    },
    "wide": {
        "zh-CN": {"label": "宽鼻", "desc": [
            "鼻翼线条舒展，横向比例比较突出。这种鼻型给面部中部增加了宽度感，和你的整体脸宽比例其实是匹配的。",
            "宽鼻的存在感主要在鼻翼——横向展开的线条让面部中部更有体量。不过这也意味着修容的效果会特别明显，一点阴影就能改变很多。",
            "你的鼻翼比较开阔，面部横向的'锚定'作用很强。有趣的是，这种鼻型在正面和微侧面看的比例差异比其他鼻型大，稍微侧一点会更好看。",
        ], "beauty_tip": [
            "鼻翼两侧打阴影是最有效的修饰方式，高光集中在鼻梁中线——细细一条就好。",
            "修容时阴影沿鼻翼内侧走，不要画到鼻翼外缘。高光打在鼻梁中间，宽度控制在5mm以内效果最精致。",
            "拍照时微微侧脸可以让鼻型比例更好看。修容方面，鼻翼阴影+细中线高光是标准操作。",
        ]},
        "en": {"label": "Wide Nose", "desc": [
            "Broad nostrils with a horizontally prominent proportion. This nose adds width to the mid-face, and it actually matches your overall face width proportionally.",
            "A wide nose's presence is mainly at the wings -- the lateral spread gives the mid-face more volume. The upside: contouring makes a dramatic difference here, even a little shadow changes a lot.",
            "Your nostrils are quite open, providing strong horizontal anchoring to the face. Interestingly, this nose type shows more difference between front and slight-angle views than others -- a slight turn usually looks better.",
        ], "beauty_tip": [
            "Shadow along the wing creases is the most effective technique; keep the bridge highlight narrow and centered.",
            "Run the shadow along the inner edge of the wings, not the outer rim. Keep the bridge highlight under 5mm wide for the most refined effect.",
            "A slight face angle in photos optimizes the proportions. Standard contouring: wing shadow + thin center-line highlight.",
        ]},
    },
    "normal": {
        "zh-CN": {"label": "标准鼻", "desc": [
            "鼻型端正协调，比例刚好处于各项均值附近——不高不低、不宽不窄。这种鼻型是面部和谐感的天然加分项。",
            "标准鼻的好处是'不出错'——比例均衡，和任何脸型、眼型搭配都不会突兀。这反而是一种很强的底层优势。",
            "你的鼻型比例很匀称，属于那种不会被单独注意到但缺了会很明显的类型。面部和谐感有相当一部分功劳归它。",
        ], "beauty_tip": [
            "比例已经很好了，日常只需轻扫高光增加一点立体感就够。",
            "不需要修正，修容就是锦上添花——一条细高光沿鼻梁画下来，整张脸的立体感就会提升。",
            "简单最有效：一条细高光+鼻侧极淡的阴影。不要试图改变鼻型方向或比例——原本就很好的东西不需要改。",
        ]},
        "en": {"label": "Standard Nose", "desc": [
            "Well-proportioned and balanced, sitting right around average on every dimension -- not too tall, not too wide. This nose is a natural harmony booster for the whole face.",
            "A standard nose's advantage is reliability -- balanced proportions that never clash with any face or eye shape. This is actually a powerful baseline advantage.",
            "Your nose proportions are very even -- the kind that doesn't get noticed individually but would be clearly missed. A good chunk of your facial harmony credit goes here.",
        ], "beauty_tip": [
            "Proportions are already great; just a light highlight for a touch more dimension is all you need daily.",
            "No correction needed -- contouring is purely enhancement. A thin highlight line down the bridge lifts the whole face's dimensionality.",
            "Keep it simple: thin highlight + barely-there side shadow. Don't try to redirect or reshape -- what's already good doesn't need changing.",
        ]},
    },
}

_MOUTH_SHAPE = {
    "small": {
        "zh-CN": {"label": "樱桃口", "desc": [
            "嘴形小巧精致，在面部中的占比不大但很精致。这种唇型在东方审美中一直被视为含蓄优雅的代表。",
            "小巧的唇型让面部下三分之一显得格外精致紧凑。不过小嘴的另一面是表情幅度会显得更含蓄——微笑比大笑更适合你的面部语言。",
            "你的唇型属于'精致型'——面积不大但线条清晰。有趣的是，这种唇型涂深色唇膏的效果往往比浅色更出彩，因为精致感会被强化。",
        ], "beauty_tip": [
            "在唇峰处用浅色唇线稍微外扩，视觉上可以增加饱满度。",
            "深色系唇膏是你的秘密武器——小唇型驾驭深色反而比大唇型更精致。想要日常感就选裸色系。",
            "唇线笔是你的好朋友：沿着唇峰微微外扩1mm，然后填色。不需要大幅度改变，微调就能有明显效果。",
        ]},
        "en": {"label": "Cherry Mouth", "desc": [
            "Petite and precise, taking up a modest portion of the face but with clean definition. This lip shape has long been seen as the epitome of understated elegance in Eastern aesthetics.",
            "The small lip shape makes the lower third of the face feel especially refined and compact. The flip side: expressions will read as more subtle -- a soft smile suits your facial language better than a wide grin.",
            "Your lips are the 'precision' type -- small area but clear lines. Interestingly, dark lip colors often look better than light ones on this shape, because they amplify the refinement.",
        ], "beauty_tip": [
            "Slightly overlining the cupid's bow adds visual fullness.",
            "Dark lip colors are your secret weapon -- small lips carry bold shades more elegantly than full lips. For everyday, go with nudes.",
            "Lip liner is your best friend: trace just 1mm outside the cupid's bow, then fill. Small adjustments make a noticeable difference.",
        ]},
    },
    "wide": {
        "zh-CN": {"label": "阔口", "desc": [
            "嘴形大方有型，横向比例突出。这种唇型笑起来特别有感染力——嘴角的展开幅度大，表情会很生动。",
            "阔口的核心魅力在于'表情丰富'——你的面部下半部分在交流时是很有表现力的。不过静态时可能显得嘴部存在感偏强，哑光唇妆可以平衡。",
            "你的嘴形属于表情派——说话和笑的时候面部生动度很高。有趣的是，很多银幕上有感染力的面孔都是阔口型的。",
        ], "beauty_tip": [
            "哑光质感的唇妆让嘴形看起来更利落有气场，避免高光质地在唇中间大面积使用。",
            "选唇色时偏向和肤色接近的色调，不需要用深色刻意缩小——大方的唇型就应该大方地展示。哑光质地是最佳搭档。",
            "唇妆的关键是质地而非颜色：哑光或丝绒质地 > 水光 > 高亮。轮廓感是阔口的优势，不要用太多光泽把它模糊掉。",
        ]},
        "en": {"label": "Wide Mouth", "desc": [
            "Generously proportioned with a strong horizontal presence. This lip shape is incredibly infectious when smiling -- the wide stretch creates vivid, expressive facial dynamics.",
            "The core charm of a wide mouth is 'expressiveness' -- your lower face is very communicative in conversation. In still moments the mouth may feel dominant; matte lip finishes help balance.",
            "Your mouth is built for expression -- facial energy spikes when you talk or laugh. Fun fact: many of the most magnetic faces on screen share this wide lip type.",
        ], "beauty_tip": [
            "Matte lip finishes keep the shape looking clean and powerful; avoid glossy textures spread widely across the center.",
            "Pick lip shades close to your skin tone -- no need to minimize with dark colors. A generous mouth deserves generous display. Matte is your best texture.",
            "Texture matters more than color: matte/velvet > sheer > glossy. Contour is the wide mouth's asset -- don't blur it with too much shine.",
        ]},
    },
    "upper_full": {
        "zh-CN": {"label": "上唇丰厚", "desc": [
            "上唇比下唇更饱满，唇峰轮廓分明。这种唇型比例在唇形中算比较少见的，给嘴部增添了一种独特的丰盈感。",
            "上唇的丰厚度让你的唇型比例和大多数人不同——上重下轻的结构其实很有记忆点。唇色的选择空间很大。",
            "你的上唇丰满且唇线清晰，这在唇型中算是个性鲜明的类型。有趣的是，这种唇型在涂唇色时有一种天然的'渐变'效果。",
        ], "beauty_tip": [
            "接近肤色的唇色能突出唇形优势，渐变唇妆从上唇深色到下唇浅色的画法效果特别好。",
            "让上唇成为主角：选稍深一度的唇色，下唇用更浅的色调过渡。这种天然的上下差异值得利用而非掩盖。",
            "最适合你的画法是韩式渐变唇——从唇内向外晕染。上唇的丰厚度让这种画法效果特别好。",
        ]},
        "en": {"label": "Full Upper Lip", "desc": [
            "The upper lip is fuller than the lower, with a well-defined cupid's bow. This proportion is relatively uncommon, adding a distinctive fullness to the mouth.",
            "Your upper lip's fullness creates a top-heavy lip ratio that differs from most -- a memorable trait. The color palette you can work with is wide open.",
            "Full upper lip with crisp lip lines -- a distinctively characterized lip shape. Fun fact: this shape creates a natural 'gradient' effect when lip color is applied.",
        ], "beauty_tip": [
            "MLBB shades highlight the shape's advantage; a gradient from darker upper to lighter lower lip looks especially good.",
            "Let the upper lip take the lead: pick a shade one step deeper, blend lighter on the bottom. This natural difference is worth showcasing, not hiding.",
            "The Korean gradient technique works beautifully here -- blend from inner lip outward. Your upper lip fullness makes this technique especially effective.",
        ]},
    },
    "lower_full": {
        "zh-CN": {"label": "下唇丰厚", "desc": [
            "下唇饱满圆润，嘟嘟唇的效果是天然的。这种唇型的性感度很高，在面部下三分之一提供了很好的'体量感'。",
            "你的下唇有一种天然的饱满度——不少人靠注射才能达到的效果。这种唇型在光线下的光影效果特别好，唇部的立体感很强。",
            "下唇的丰厚让你的嘴部轮廓有一种柔软的质感，搭配各种唇色都很有感觉。不过因为下唇存在感强，唇妆的重点应该放在上唇的平衡上。",
        ], "beauty_tip": [
            "下唇中央加一点透明唇蜜增强饱满感和光泽度，效果立竿见影。",
            "善用你的天然优势：下唇中央一点高光或唇蜜就能放大这种饱满感。上唇可以用唇线笔稍微描一下增加存在感。",
            "唇妆策略是'下唇做光泽、上唇做轮廓'——下唇用光泽质地突出饱满，上唇用唇线笔描清楚边缘来平衡。",
        ]},
        "en": {"label": "Full Lower Lip", "desc": [
            "A plump, rounded lower lip -- the pouty look is completely natural. This lip shape scores high on sensuality, providing great 'volume' in the lower third of the face.",
            "Your lower lip has a natural fullness that many people seek through injections. This shape catches light beautifully, giving the mouth strong three-dimensional presence.",
            "The full lower lip gives your mouth a soft, lush quality that carries any lip color well. Since the lower lip draws attention, lip makeup focus should go to balancing the upper.",
        ], "beauty_tip": [
            "A touch of clear gloss at the lower center instantly enhances the fullness and shine.",
            "Play to your natural advantage: a dab of highlight or gloss at lower center amplifies the fullness. Use lip liner on the upper lip to boost its presence for balance.",
            "The lip strategy: 'gloss the bottom, define the top' -- glossy texture emphasizes lower fullness, while liner clarifies the upper edge for balance.",
        ]},
    },
    "upturned": {
        "zh-CN": {"label": "上扬嘴角", "desc": [
            "嘴角自然上扬，静态时也带着微笑的弧度。这种嘴型是天生的社交利器——人们在你还没开口前就觉得你亲切。",
            "你的嘴角线条天然上翘，给整张脸带来了一种'阳光感'。有趣的是，很多人花大价钱做嘴角提升术追求的就是你这种天然弧度。",
            "上扬嘴角让你的面部在放松状态下也显得友善——这种'静态笑容'在第一印象中非常加分，属于稀缺的面部特质。",
        ], "beauty_tip": [
            "保持嘴角的自然弧度就是你的优势，裸色系唇妆最能衬托这个特点。",
            "不需要刻意修饰——你的嘴角弧度本身就是加分项。唇妆选自然色调就好，让嘴角的弧度自己说话。",
            "涂唇膏时注意嘴角也要带到，不要只涂中间——你的嘴角弧度值得被展示出来。颜色选裸色到珊瑚色最搭。",
        ]},
        "en": {"label": "Upturned Corners", "desc": [
            "Naturally upturned corners that carry a smile even at rest. This mouth is a built-in social asset -- people feel warmth from you before you even speak.",
            "Your lip corners naturally curve upward, lending a 'sunny' quality to the whole face. Fun fact: many people pay for corner-lift procedures to achieve exactly this natural arc.",
            "Upturned corners make your face look friendly even in a neutral expression -- this 'resting smile' is a rare facial trait that scores huge on first impressions.",
        ], "beauty_tip": [
            "The natural curve is your asset; nude lip tones complement it best.",
            "No special technique needed -- your corner curve speaks for itself. Stick with natural tones and let the arc do the work.",
            "When applying lip color, make sure to reach the corners -- don't just color the center. Your curve deserves to be showcased. Nude to coral shades work best.",
        ]},
    },
    "downturned": {
        "zh-CN": {"label": "下垂嘴角", "desc": [
            "嘴角自然略向下，静态时带着一种清冷的表情。这种唇型在时尚圈反而是一种'高级脸'的标志——不谄媚、有态度。",
            "你的嘴角线条自然向下，给面部一种'不刻意讨好'的冷淡美。不过笑起来和静态的反差会特别大——这种反差本身就是魅力。",
            "下垂嘴角在不表达时会显得有点严肃，但这恰好是一种独特的面部个性。很多有'高冷感'的经典面孔都是这种唇型。",
        ], "beauty_tip": [
            "嘴角处用遮瑕轻微提亮，再用唇线笔在嘴角微微上扬——自然又有效。",
            "日常可以不刻意修饰，保留冷淡美；需要更亲和时在嘴角点一小点高光就能提升不少。关键是遮瑕打底要做到嘴角位置。",
            "唇线笔从嘴角向上延伸1-2mm是最简单的提升手段。不过如果你喜欢清冷的风格，完全不修饰也是一种态度。",
        ]},
        "en": {"label": "Downturned Corners", "desc": [
            "Naturally downturned corners that give a cool expression at rest. In fashion, this is actually a 'high-end face' marker -- it reads as uncompromising and attitude-rich.",
            "Your lip corners naturally curve down, lending a 'not trying to please' cool beauty. The payoff: when you do smile, the contrast is striking -- and that contrast itself is charismatic.",
            "Downturned corners read as somewhat serious at rest, but that's a distinct facial personality. Many iconic 'cool beauty' faces share this exact lip shape.",
        ], "beauty_tip": [
            "Concealer to brighten the corners plus a slight upward flick with lip liner -- simple and effective.",
            "For everyday: leave it as-is for that cool-beauty vibe. For warmth: a dot of highlight at the corners lifts noticeably. The key is extending your base concealer to the corners.",
            "Extending lip liner 1-2mm upward from the corners is the simplest lift. But if you like the cool aesthetic, not correcting it is a valid style choice too.",
        ]},
    },
    "balanced": {
        "zh-CN": {"label": "匀称口型", "desc": [
            "唇形比例均匀协调，上下唇厚度接近，嘴角位置中性。这种唇型的可塑性极强——化什么妆就是什么风格。",
            "均衡的唇型意味着你在唇妆上没有短板——不需要矫正任何方向，每一种风格都能干净利落地呈现。这是很多化妆师羡慕的底子。",
            "你的唇型比例几乎完美均衡，上下等厚、嘴角平直。好处是什么唇色和质地都配得上，不过也因此需要靠唇妆来创造个性和变化。",
        ], "beauty_tip": [
            "你的唇形不需要修饰，任何唇色和质地都能很好地呈现——随意发挥就好。",
            "不需要唇线修正，直接涂就行。建议多尝试不同色系和质地——你的唇型经得起任何实验。",
            "百搭唇型的快乐在于选择多：今天哑光红、明天水光裸、后天深色plum，换着来不会出错。",
        ]},
        "en": {"label": "Balanced Mouth", "desc": [
            "Even proportions with similar upper and lower lip thickness, and neutral corner position. This lip shape is extremely versatile -- whatever makeup you apply, that's the style you get.",
            "Balanced lips mean zero weaknesses to correct -- every style comes through clean and sharp. This is the kind of canvas many makeup artists wish they could work with.",
            "Your lip proportions are nearly perfectly balanced -- equal thickness, straight corners. The upside: every color and texture works. The downside: you'll need lip makeup to create personality.",
        ], "beauty_tip": [
            "No correction needed -- any lip color and finish will present well. Go wild.",
            "Skip the lip liner correction and just apply directly. Try different color families and textures -- your lip shape can handle any experiment.",
            "The joy of a versatile lip: matte red today, dewy nude tomorrow, deep plum next time. Rotate freely -- nothing will misfire.",
        ]},
    },
}

_EYEBROW_SHAPE = {
    "high_arch": {
        "zh-CN": {"label": "高弓眉", "desc": [
            "眉弓弧度明显，眉峰位置偏高，给面部增添了一份戏剧性的表现力。这种眉形在表达惊讶或质疑时效果尤其强烈。",
            "高挑的眉弓让你的面部上半部分多了一种'挑眉'的张力——即使不动，也像在讲故事。这种眉形在镜头前很有戏剧感。",
            "你的眉峰高度比平均偏高，给整张脸定了一个'有态度'的基调。有趣的是，高弓眉的人往往表情丰富度也高——眉毛的活动空间大。",
        ], "beauty_tip": [
            "保持自然的高弓弧度就好，修眉时只清理杂毛。不要试图降低眉峰——这是你的特色。",
            "眉峰是你的标志，修眉时注意保持而非削弱。用透明眉膏固定形状，其他不用多做。",
            "如果想柔化戏剧感，可以在眉峰处用浅色眉粉稍作过渡；想强化就用深色眉笔勾勒眉峰。两种方向看心情切换。",
        ]},
        "en": {"label": "High Arch", "desc": [
            "A pronounced arch with the peak sitting high, adding dramatic expressiveness to the face. This brow shape is especially powerful for conveying surprise or intensity.",
            "The tall arch gives your upper face a constant sense of 'raised-brow' energy -- even at rest, it tells a story. Very photogenic with great dramatic potential.",
            "Your brow peak is higher than average, setting an 'attitude-forward' tone for the whole face. Fun fact: people with high arches tend to be more facially expressive -- the brows have more room to move.",
        ], "beauty_tip": [
            "Keep the natural high arch; just clean stray hairs. Don't try to lower the peak -- it's your signature.",
            "The peak is your hallmark -- preserve it when grooming. Set with clear brow gel, and you're done.",
            "To soften the drama: lightly blend at the peak with a lighter brow powder. To amplify: define the peak with a darker pencil. Switch between moods as you like.",
        ]},
    },
    "straight": {
        "zh-CN": {"label": "一字眉", "desc": [
            "眉形线条平直干净，没有明显的弧度变化。这种眉型近几年在韩式审美中非常流行——给面部一种清新、不做作的感觉。",
            "一字眉的特点是'去戏剧化'——不像弓形眉那样有强烈的情绪感，而是走一种安静、干净的路线。配合你的眼型效果很协调。",
            "平直的眉形让面部整体显得更年轻、更清爽。不过一字眉对眉毛浓密度有要求——太稀疏的话需要用眉笔填补。",
        ], "beauty_tip": [
            "用眉笔顺着自然方向轻描即可，保持线条的平直感。",
            "一字眉的核心是'自然感'——不要画太精致太锐利。用眉粉比眉笔效果更柔和，更符合这种眉型的气质。",
            "想要更精神一些可以把眉尾稍微画长一点，但不要上扬。保持水平线条是一字眉的灵魂。",
        ]},
        "en": {"label": "Straight Brows", "desc": [
            "Clean, flat lines with no noticeable arch. This brow shape has been hugely popular in Korean aesthetics recently -- it gives the face a fresh, effortless feel.",
            "Straight brows are 'de-dramatized' -- not as emotionally charged as arched brows, opting for a quiet, clean vibe instead. Works harmoniously with your eye shape.",
            "Flat brows make the face look younger and fresher overall. One thing to note: straight brows need decent density -- if sparse, fill in with pencil strokes.",
        ], "beauty_tip": [
            "Light strokes following the natural direction; maintain the flat line.",
            "The core of straight brows is 'natural feel' -- don't make them too sharp or precise. Brow powder gives a softer result than pencil, matching this shape's vibe.",
            "For a more alert look, extend the tail slightly but keep it horizontal. The level line is the soul of straight brows.",
        ]},
    },
    "straight_long": {
        "zh-CN": {"label": "长直眉", "desc": [
            "眉形修长平直，眉尾延伸充分。这种眉型让面部看起来很舒展、很大气——像是给眼睛上方画了一条稳定的横线。",
            "长直眉的气质是'从容不迫'——修长的线条让面部横向拉宽，显得大方端庄。你的眉尾延伸得很好，不需要刻意加长。",
            "你的眉形既长且直，给面部增添了一种开阔感。有趣的是，这种眉型在古典审美中被称为'远山眉'，一直是被推崇的类型。",
        ], "beauty_tip": [
            "眉尾保持自然延伸就好，避免过度修剪。眉头用浅色、眉尾用深色的渐变画法效果最好。",
            "不要削短眉尾——长度是你这种眉型的优势。用眉膏固定方向，保持线条的流畅感。",
            "最适合的画法是眉头轻、眉中均匀、眉尾自然收尖。不需要刻意制造弧度——你的直线条本身就很好看。",
        ]},
        "en": {"label": "Long Straight Brows", "desc": [
            "Extended flat brows with a fully developed tail. This shape makes the face look expansive and composed -- like a stable horizontal line drawn above the eyes.",
            "Long straight brows project a 'calm confidence' -- the extended line widens the face visually, creating a generous, dignified feel. Your tail length is great as-is.",
            "Both long and straight, your brows add a sense of openness to the face. Fun fact: this shape is classically known as 'distant mountain brows' -- always been a celebrated type.",
        ], "beauty_tip": [
            "Let the tail extend naturally; avoid over-trimming. A gradient from lighter brow head to darker tail looks best.",
            "Don't shorten the tail -- length is this brow shape's strength. Set with brow gel to maintain the smooth direction.",
            "The ideal technique: light at the head, even through the middle, naturally tapered tail. No need for artificial curves -- your straight line is beautiful as-is.",
        ]},
    },
    "soft_arch": {
        "zh-CN": {"label": "柔弓眉", "desc": [
            "眉形自然柔和，弧度恰到好处——既不太平也不太挑。这种眉型被认为是'最不挑人'的，和几乎所有脸型都能搭配。",
            "柔弓眉的弧度刚好落在'亲切'和'精致'之间。你的眉型不需要大幅修改就很好看——这种天然的平衡感不是画出来的。",
            "你的眉弓有一个温柔的弧度，不张扬但很恰当。这种眉型在不同妆容风格中都能自然融入，存在感刚好——不抢戏也不缺位。",
        ], "beauty_tip": [
            "保持现有弧度就好，这是很理想的眉型基础。日常用眉膏固定方向即可。",
            "柔弓眉是修容的好搭档——不需要单独考虑眉形修饰的问题。如果非要动，建议只调整浓密度，不要改变弧度。",
            "你的眉型已经很好了，修眉的原则是'只减不加'——清理杂毛保持轮廓就够了。",
        ]},
        "en": {"label": "Soft Arch", "desc": [
            "A naturally gentle curve -- not too flat, not too peaked. This shape is considered the most universally flattering, harmonizing with virtually any face shape.",
            "The soft arch sits perfectly between 'friendly' and 'refined.' Your brows look great without major changes -- this kind of natural balance can't be drawn on.",
            "Your brow has a gentle arc, understated but just right. This shape integrates naturally into any makeup style -- present enough without stealing the scene.",
        ], "beauty_tip": [
            "Maintain the existing curve -- it's an ideal brow foundation. A setting gel to hold direction is all you need daily.",
            "Soft arch is contouring's best friend -- no separate brow strategy needed. If you must adjust, tweak density only, not the curve.",
            "Your brow shape is already great; grooming principle is 'subtract only' -- clean stray hairs to maintain the contour.",
        ]},
    },
    "long_arch": {
        "zh-CN": {"label": "长弓眉", "desc": [
            "眉形修长有弧度，线条像一张优雅的弓。这种眉型给面部增添了一种成熟精致的气质，很有女性魅力。",
            "长弓眉的特点是'兼顾长度和弧度'——既有舒展的视觉效果，又有柔和的弧线。你的眉尾延伸给面部增添了不少精致感。",
            "你的眉型既长且有弧度，在面部上方画出了一条优美的弧线。这种眉型在古典和现代审美中都很受欢迎——时间验证过的好看。",
        ], "beauty_tip": [
            "用眉膏固定自然弧度，眉尾自然延伸就好。不要把弧度修掉——那是你的特色。",
            "眉膏 > 眉笔，因为你需要的是'固定'而不是'描画'。保持自然的弧线走势，只在稀疏处稍微填补。",
            "想要更精致就用细头眉笔勾勒弧线，想要更自然就用眉粉轻扫。你的眉型底子好，两种画法都不会出错。",
        ]},
        "en": {"label": "Long Arch", "desc": [
            "Extended brows with a graceful curve -- the line draws like an elegant bow. This shape adds a mature, refined quality with strong feminine appeal.",
            "Long arch brows balance 'length and curve' -- the visual extension plus the soft arc. Your tail length adds real refinement to the face.",
            "Both long and arched, your brows trace a beautiful curve across the upper face. This shape is appreciated in both classical and modern aesthetics -- proven beautiful across eras.",
        ], "beauty_tip": [
            "Set with brow gel to hold the natural arc; let the tail extend naturally. Don't trim away the curve -- it's your feature.",
            "Brow gel > pencil, because you need 'hold' not 'drawing.' Follow the natural arc and only fill sparse spots.",
            "For more polish: define the arc with a fine-tip pencil. For more natural: sweep with brow powder. Your base shape is great either way.",
        ]},
    },
}

_FOREHEAD_SHAPE = {
    "high": {
        "zh-CN": {"label": "高额", "desc": [
            "额头开阔，面部上三分之一的比例比较突出。在面相学中高额被视为'天庭饱满'的好相，日常审美中则给人一种大气从容的感觉。",
            "你的额头高度高于平均，给面部上半部分带来了很强的存在感。这种额头适合露出来——挡住反而浪费了这份开阔感。",
            "高额的好处是让整张脸显得大方舒展，劣势是纵向比例偏长。不过刘海的存在就是为了解决这种'甜蜜的烦恼'的。",
        ], "beauty_tip": [
            "空气刘海或法式刘海能适度修饰比例，又不会完全遮住额头的优势。",
            "想露额就配侧分，把开阔感变成气场；想缩短比例就用空气刘海。两种选择取决于当天想要什么风格。",
            "修容时在发际线处轻扫一点阴影可以视觉上缩短额头，这比刘海更灵活——不影响发型选择。",
        ]},
        "en": {"label": "High Forehead", "desc": [
            "A broad forehead with a prominent upper-third proportion. In face reading, a high forehead ('full heavenly court') is considered auspicious; in everyday aesthetics, it conveys openness and composure.",
            "Your forehead height is above average, giving the upper face strong presence. This kind of forehead looks best exposed -- covering it up wastes the natural openness.",
            "The upside of a high forehead: the face looks generous and expansive. The trade-off: vertical proportions can run long. But that's exactly what bangs were invented for.",
        ], "beauty_tip": [
            "Wispy or curtain bangs moderate the proportions without hiding the forehead's advantage.",
            "Want to show it: side-part and own the presence. Want to shorten: airy bangs. The choice depends on what vibe you're going for that day.",
            "A touch of shadow at the hairline visually shortens the forehead -- more flexible than bangs since it doesn't limit your hairstyle options.",
        ]},
    },
    "medium": {
        "zh-CN": {"label": "中额", "desc": [
            "额头比例恰好，面部纵向三等分很均衡。这种额头是'不用操心'的类型——既不需要刘海修饰，露出来也很好看。",
            "你的额头高度处于黄金区间，上庭比例很协调。这意味着刘海和露额造型你都能自由切换，不用考虑修饰问题。",
            "中等额头是面部比例的'稳定器'——它不会成为你的亮点，但也绝不会是短板。面部整体协调感有一份功劳在它。",
        ], "beauty_tip": [
            "露额和刘海都适合你，不需要考虑修饰——想怎么来就怎么来。",
            "额头比例已经理想了，修容时不需要单独关注这个区域。把精力放在其他部位的修饰上。",
            "你的额头是百搭型的——剪刘海是为了时尚，不是为了修饰。想露就露，想遮就遮。",
        ]},
        "en": {"label": "Medium Forehead", "desc": [
            "Perfectly proportioned forehead with a balanced vertical third. This is the 'don't worry about it' type -- looks great with or without bangs.",
            "Your forehead height sits in the golden zone, with a well-balanced upper third. You can freely switch between bangs and forehead-out styles without proportion concerns.",
            "A medium forehead is the 'stabilizer' of facial proportions -- it won't be your highlight, but it'll never be a weakness either. Facial harmony owes it some credit.",
        ], "beauty_tip": [
            "Both bangs and swept-back styles work; no correction needed -- style however you like.",
            "Forehead proportions are already ideal; no special contouring needed here. Spend your effort on other areas.",
            "Your forehead is fully versatile -- bangs are for fashion, not correction. Show it or cover it as you please.",
        ]},
    },
    "low": {
        "zh-CN": {"label": "低额", "desc": [
            "额头较低，面部重心在中下部分。这种比例让面部整体显得紧凑有力——五官的密度感会比较高。",
            "低额意味着面部上三分之一比例偏短，但这不一定是劣势——五官聚拢反而让面部信息密度更高，看起来更有'内容'。",
            "你的额头偏低，面部的中下部分比例更突出。有趣的是，很多有辨识度的面孔其实都是低额型——紧凑的上部反而衬托了五官。",
        ], "beauty_tip": [
            "避免厚重刘海进一步压缩额头，露额发型或侧分可以视觉上拉长上庭。",
            "发型策略是'向上要空间'：头顶蓬松、避免紧贴头皮的造型。侧分比中分更能优化比例。",
            "修容小技巧：在发际线处用浅色高光提亮，视觉上可以延伸额头区域。配合蓬松的头顶发型效果翻倍。",
        ]},
        "en": {"label": "Low Forehead", "desc": [
            "A lower forehead with facial weight concentrated in the middle and lower zones. This proportion makes the face feel compact and powerful -- higher feature density.",
            "A low forehead means the upper third is shorter, but that's not necessarily a weakness -- features that cluster together actually make the face feel richer with more 'content.'",
            "Your forehead runs low, giving the mid and lower face more prominence. Fun fact: many highly distinctive faces are actually the low-forehead type -- the compact upper portion sets off the features.",
        ], "beauty_tip": [
            "Avoid heavy bangs that further compress the forehead; swept-back or side-parted styles visually lengthen the upper third.",
            "The styling strategy is 'claim vertical space': crown volume, avoid slicked-back looks. Side parts work better than center parts for proportions.",
            "Contouring tip: light highlight at the hairline visually extends the forehead area. Paired with a voluminous crown hairstyle, the effect doubles.",
        ]},
    },
}

_JAWLINE_SHAPE = {
    "square": {
        "zh-CN": {"label": "方颌", "desc": [
            "下颌线条方正有力，棱角感突出。这种颌型在高端时尚中一直是'骨骼美'的代表——轮廓感强的面孔往往更耐看。",
            "方颌给面部下半部分定了一个'有力量'的基调。不过别只看到'硬'——方颌的人笑起来往往特别好看，因为柔和的表情和硬朗的骨骼形成了有趣的对比。",
            "你的下颌角存在感很强，给整张脸增添了一种'稳固'的底盘感。有意思的是，近几年越来越多人开始追求颌线的存在感——'方'不再是需要修饰的目标。",
        ], "beauty_tip": [
            "在下颌角打阴影柔化线条，搭配柔和的发型效果很好。但如果你喜欢强势风格，完全不修也很酷。",
            "修容有两个方向：强调（用深色描颌线突出骨骼感）或柔化（在颌角打阴影）。选哪个取决于你今天想帅还是想美。",
            "下颌角的修容是'可选项'而非'必需项'——你可以用面部的碎发遮一点，也可以全露出来走气场路线。",
        ]},
        "en": {"label": "Square Jaw", "desc": [
            "Angular, powerful jaw lines with prominent bone structure. This jaw type has always been the poster child for 'skeletal beauty' in high fashion -- strong contours tend to age well.",
            "A square jaw anchors the lower face with a sense of power. But don't just see 'hard' -- people with square jaws often look especially striking when smiling, because the soft expression contrasts beautifully with the angular structure.",
            "Your jaw angles have strong presence, adding a 'solid foundation' to the whole face. Interestingly, visible jawlines have become increasingly desirable in recent years -- 'angular' is no longer something to contour away.",
        ], "beauty_tip": [
            "Shadow at the jaw corners to soften, paired with soft hairstyles. But if you prefer the commanding look, leaving it uncontoured is totally cool.",
            "Two contouring directions: emphasize (dark liner along the jaw for bone structure) or soften (shadow at the corners). Pick based on whether you want fierce or soft today.",
            "Jaw corner contouring is optional, not mandatory -- you can use face-framing wisps for a softer look, or go fully exposed for the power route.",
        ]},
    },
    "wide_round": {
        "zh-CN": {"label": "宽圆颌", "desc": [
            "下颌圆润饱满，线条柔和没有锐角。这种颌型让面部下半部分看起来稳定、亲切——是一种让人觉得好相处的面部特质。",
            "宽圆的下颌给你的脸增添了'体量感'——不尖锐、不冷淡，有一种踏实的质感。这种颌型在面相学中被视为'地阁方圆'的好相。",
            "你的下颌轮廓圆润有力，面部下半部分的存在感不弱。不过圆润的线条让这种'力量'变得温和，不会给人压迫感。",
        ], "beauty_tip": [
            "两侧碎发可以修饰宽度，修容时在腮帮两侧轻扫阴影效果自然。",
            "修容策略是'收窄两侧'：从下颌角到耳垂方向轻扫阴影。配合两侧的碎发或层次感发型效果翻倍。",
            "如果觉得下颌偏宽，最有效的方法不是修容而是发型——两侧有层次的中长发能视觉上收窄不少。",
        ]},
        "en": {"label": "Wide Round Jaw", "desc": [
            "Full, rounded jaw with soft lines and no sharp angles. This jaw type makes the lower face look stable and friendly -- a trait that reads as approachable.",
            "The wide, rounded jaw adds 'volume' to your face -- not sharp, not cold, with a grounded quality. In face reading, this shape is considered an auspicious 'solid foundation.'",
            "Your jaw contour is rounded and substantial -- the lower face has real presence. But the soft lines temper the strength, keeping it warm rather than imposing.",
        ], "beauty_tip": [
            "Face-framing wisps slim the width; light shadow along the sides when contouring for a natural look.",
            "Contouring strategy: 'narrow the sides' -- shadow from jaw angle toward the earlobe. Paired with layered side hair, the effect doubles.",
            "If the jaw feels wide, the most effective fix isn't contouring but hairstyle -- layered mid-length hair with side volume visually slims significantly.",
        ]},
    },
    "pointed": {
        "zh-CN": {"label": "尖颌", "desc": [
            "下巴尖巧精致，面部线条到下方有明显的收束感。这种颌型让脸看起来更小、更V字形——很上镜。",
            "尖颌是面部轮廓'画龙点睛'的部分——从脸颊到下巴的收缩线条让整张脸显得精致灵动。这种下巴型在镜头前特别讨好。",
            "你的下巴削尖的角度恰到好处，给面部收了一个漂亮的尾。不过尖颌也意味着下颌承重感弱一些——配合发型在下方增加体量效果会更平衡。",
        ], "beauty_tip": [
            "下巴线条已经很精致了，在下巴正面打一点高光就能锦上添花。",
            "你的下巴是加分项，不需要修饰。如果想要更有存在感，在下巴尖打一点高光增加聚焦就好。",
            "尖颌的修容原则是'强化而非矫正'——下巴高光 + 颧骨阴影可以进一步强化V字线条。不过日常不做也完全可以。",
        ]},
        "en": {"label": "Pointed Jaw", "desc": [
            "A delicately tapered chin with a clear narrowing from the cheeks down. This jaw type makes the face look smaller and more V-shaped -- very camera-friendly.",
            "A pointed chin is the 'finishing touch' of facial contours -- the narrowing line from cheeks to chin makes the whole face feel refined and spirited. This chin type is especially flattering on camera.",
            "Your chin tapers at just the right angle, giving the face a clean finish. The trade-off: less lower-face weight, so adding some volume at the bottom with hairstyling creates better balance.",
        ], "beauty_tip": [
            "The chin line is already refined; a dot of highlight on the chin front adds a nice finishing touch.",
            "Your chin is a plus -- no correction needed. For more presence, a highlight dot at the tip for focus is all it takes.",
            "The contouring principle for pointed chins is 'enhance, not correct' -- chin highlight + cheekbone shadow amplifies the V-line. But skipping it daily is perfectly fine.",
        ]},
    },
    "angular": {
        "zh-CN": {"label": "棱角颌", "desc": [
            "颌线轮廓分明，有清晰的转角和线条感。这种颌型给面部增添了很强的个性——辨识度高，在人群中容易被记住。",
            "棱角分明的颌线让你的面部下半部分充满线条张力。和圆润的颌型相比，你的面部语言更直接、更有力度。",
            "你的下颌骨线条棱角清晰，面部的'骨骼感'主要靠它来表达。有趣的是，这种颌型在光线下的明暗变化特别丰富——拍照时光影效果好。",
        ], "beauty_tip": [
            "想强调个性就用修容强化棱角，想走柔美路线就在转角处打阴影柔化。两个方向看心情。",
            "修容的两条路：帅气路线用深色沿颌线描画突出骨骼；柔美路线在转角处混合阴影模糊棱角。你的底子两种都能撑住。",
            "棱角颌在光影中特别好看，拍照时侧面打光能把线条感发挥到极致。日常修容只需轻轻柔化即可。",
        ]},
        "en": {"label": "Angular Jaw", "desc": [
            "Clearly defined jawline with sharp transitions and strong line work. This jaw adds major personality -- high distinctiveness, easy to remember in a crowd.",
            "The angular jawline fills your lower face with linear tension. Compared to rounder jaws, your facial language reads as more direct and powerful.",
            "Your jawbone lines are crisply angular, carrying the face's 'skeletal expression.' Fun fact: angular jaws show especially rich light-shadow variation -- great for photography.",
        ], "beauty_tip": [
            "To emphasize personality: contour to sharpen the angles. For a softer route: shadow at the transition points. Choose by mood.",
            "Two contouring paths: for edge, trace dark color along the jawline to highlight bone structure. For softness, blend shadow at the corners to blur the angles. Your foundation supports both.",
            "Angular jaws photograph beautifully; side-lighting in photos maximizes the line work. For everyday contouring, just a gentle softening touch is enough.",
        ]},
    },
    "moderate": {
        "zh-CN": {"label": "匀称颌", "desc": [
            "下颌比例协调适中，线条既不太方也不太尖。这种颌型的好处和鹅蛋脸类似——百搭，不挑发型和妆容。",
            "匀称的颌线是面部协调感的重要贡献者——它不会成为焦点，但默默地让整张脸的比例看起来更舒服。",
            "你的下颌比例很均衡，没有明显的特征倾向。这是一种'安静的优势'——不出错，不突兀，和任何上半脸的特征都能和谐搭配。",
        ], "beauty_tip": [
            "颌线已经很均衡了，日常不需要特别修容。把精力花在其他更有发挥空间的部位。",
            "不需要在下颌上花太多心思——它已经是'及格以上'的水平了。修容时顺带扫一下颌线是锦上添花，不做也行。",
            "百搭颌型的好处是：不用考虑下颌修容的问题，发型选择也不受限。省下来的时间研究眼妆吧。",
        ]},
        "en": {"label": "Moderate Jaw", "desc": [
            "Well-proportioned jaw -- neither too angular nor too pointed. Like the oval face, this jaw type is a universal match that doesn't limit hairstyle or makeup choices.",
            "A balanced jawline is a quiet contributor to facial harmony -- it won't be the focal point, but it keeps everything looking right.",
            "Your jaw proportions are very even with no dominant trait. This is a 'silent advantage' -- never wrong, never jarring, harmonizing effortlessly with whatever's above.",
        ], "beauty_tip": [
            "The jawline is already balanced; no special contouring needed daily. Spend the effort on areas with more creative potential.",
            "Don't overthink the jaw -- it's already above par. A light sweep along the jawline when contouring is a bonus, not a necessity.",
            "The perk of a versatile jaw: skip jaw contouring entirely, and hairstyle choices aren't limited either. Spend the saved time on eye makeup instead.",
        ]},
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
    # Single-feature tags
    ("phoenix_eyes", {"zh-CN": "凤目生威", "en": "Commanding Phoenix Eyes"}),
    ("almond_eyes", {"zh-CN": "杏目含情", "en": "Alluring Almond Eyes"}),
    ("round_eyes", {"zh-CN": "明眸善睐", "en": "Bright Round Eyes"}),
    ("balanced_courts", {"zh-CN": "三庭匀称", "en": "Balanced Three Courts"}),
    ("high_symmetry", {"zh-CN": "面部对称", "en": "Facial Symmetry"}),
    ("straight_nose", {"zh-CN": "鼻梁挺直", "en": "Straight Bridge"}),
    ("prominent_nose", {"zh-CN": "鼻若悬胆", "en": "Noble Bridge"}),
    ("wide_forehead", {"zh-CN": "天庭饱满", "en": "Full Forehead"}),
    ("upturned_mouth", {"zh-CN": "嘴角上扬", "en": "Upturned Lips"}),
    ("cherry_mouth", {"zh-CN": "口若含珠", "en": "Rosebud Lips"}),
    ("oval_face", {"zh-CN": "脸型端正", "en": "Classic Face Shape"}),
    ("strong_jaw", {"zh-CN": "地阁方圆", "en": "Strong Foundation"}),
    ("expressive_brows", {"zh-CN": "眉清目秀", "en": "Expressive Features"}),
    ("distant_brows", {"zh-CN": "眉如远山", "en": "Distant Mountain Brows"}),
    ("golden_ratio", {"zh-CN": "五眼均衡", "en": "Five-Eye Harmony"}),
    ("mountain_balance", {"zh-CN": "五岳端正", "en": "Balanced Mountains"}),
    ("yintang_open", {"zh-CN": "印堂开阔", "en": "Open Destiny Palace"}),
    # Compound-trait tags (only fire on specific combos)
    ("cool_beauty", {"zh-CN": "冷艳天成", "en": "Born Striking"}),
    ("sweet_face", {"zh-CN": "甜系长相", "en": "Sweet Aesthetic"}),
    ("classic_beauty", {"zh-CN": "古典挂", "en": "Classical Beauty"}),
    ("angular_edge", {"zh-CN": "棱角分明", "en": "Modern Edge"}),
    ("born_harmony", {"zh-CN": "天生和谐", "en": "Natural Harmony"}),
    ("camera_ready", {"zh-CN": "天生上镜", "en": "Camera Ready"}),
    ("warm_aura", {"zh-CN": "氛围感", "en": "Warm Aura"}),
]


# Cross-feature interaction observations.
# Each rule has conditions (dict of feature_key -> shape_id or set of IDs)
# and bilingual observation text.
_CROSS_FEATURE_RULES: list[dict[str, Any]] = [
    {
        "conditions": {"eyes": {"phoenix"}, "face_shape": {"oval", "diamond"}},
        "zh-CN": "凤眼搭配你的脸型轮廓，侧面看尤其有韵味——这种组合的辨识度在人群中属于相当高的。",
        "en": "Phoenix eyes paired with your face shape look especially striking from the side -- this combination's distinctiveness is quite rare.",
    },
    {
        "conditions": {"eyes": {"phoenix"}, "face_shape": {"square"}},
        "zh-CN": "方正的骨骼框架配上锐利的眼型，硬朗和凌厉兼备——这种搭配在超模脸里很常见。",
        "en": "Angular bone structure paired with sharp eyes -- strength meets intensity. This combination is common among supermodel faces.",
    },
    {
        "conditions": {"eyes": {"round"}, "mouth": {"upturned"}},
        "zh-CN": "圆眼配上扬嘴角，你的面部静态就带着笑意——这是天生的社交优势，让人不自觉想靠近。",
        "en": "Round eyes with upturned corners -- your face carries a natural smile at rest. A built-in social magnet.",
    },
    {
        "conditions": {"eyes": {"round", "almond"}, "face_shape": {"round", "oval"}},
        "zh-CN": "柔和的眼型配上圆润的脸型轮廓，整体氛围很温暖——属于'看着就让人放松'的类型。",
        "en": "Soft eye shape paired with gentle facial contours creates a warm overall aura -- the 'instantly relaxing' type.",
    },
    {
        "conditions": {"face_shape": {"heart"}, "jawline": {"pointed"}},
        "zh-CN": "从额到下巴，线条像一个流畅的倒三角——这种轮廓天然显脸小，拍照特别讨好。",
        "en": "From forehead to chin, the lines trace a smooth inverted triangle -- naturally face-slimming and very photogenic.",
    },
    {
        "conditions": {"forehead": {"high"}, "eyebrows": {"high_arch"}},
        "zh-CN": "饱满的额头配上高挑的眉弓，面部上半部分气场拉满——适合大胆露出额头。",
        "en": "A full forehead paired with high-arch brows fills the upper face with presence -- perfect for sweeping the hair back.",
    },
    {
        "conditions": {"nose": {"straight", "straight_long"}, "eyebrows": {"soft_arch", "long_arch"}},
        "zh-CN": "直挺的鼻梁和柔和的眉弓形成了'刚柔并济'的纵向线条——你的侧面轮廓会比正面更出彩。",
        "en": "A straight bridge with softly arched brows creates a 'firm meets gentle' vertical line -- your side profile likely outshines the front.",
    },
    {
        "conditions": {"mouth": {"small"}, "face_shape": {"oval", "heart"}},
        "zh-CN": "小巧唇型搭配你的脸型，有一种东方古典美的意境——精致含蓄，耐看度高。",
        "en": "A petite mouth with your face shape evokes classical Eastern beauty -- refined, subtle, and the kind that grows on you.",
    },
    {
        "conditions": {"face_shape": {"diamond", "heart"}, "nose": {"straight_long", "aquiline"}},
        "zh-CN": "立体的脸型轮廓配上有存在感的鼻型，面部的纵深感很强——拍照时光影效果会特别好。",
        "en": "Sculpted face contours paired with a prominent nose create deep facial dimension -- lighting and shadow effects will look stunning in photos.",
    },
    {
        "conditions": {"eyes": {"narrow"}, "face_shape": {"long"}},
        "zh-CN": "细长的眼型配上修长的脸型，整体有一种'清冷文艺'的风格——安静但很有味道。",
        "en": "Narrow eyes on a long face create a 'cool artistic' aesthetic -- quiet but full of character.",
    },
    {
        "conditions": {"jawline": {"square", "angular"}, "face_shape": {"square", "diamond"}},
        "zh-CN": "有棱角的颌线配合你的脸型，骨骼感是你面部美学的核心——这种'硬朗美'正在变得越来越受欢迎。",
        "en": "Angular jawline complementing your face shape -- bone structure is the heart of your facial aesthetic. This 'strong beauty' is increasingly celebrated.",
    },
    {
        "conditions": {"eyes": {"droopy"}, "mouth": {"upturned"}},
        "zh-CN": "垂眼的柔和配上扬嘴角的明快，上下形成了一种有趣的对比——温柔中透着一点阳光。",
        "en": "The softness of droopy eyes meets the brightness of upturned lips -- an intriguing contrast, gentle with a touch of sunshine.",
    },
    {
        "conditions": {"eyebrows": {"straight", "straight_long"}, "eyes": {"phoenix"}},
        "zh-CN": "平直的眉线和上扬的眼尾形成了一个动态的角度差——面部上半部分的线条张力很有看头。",
        "en": "Flat brow lines contrasting with upswept eye corners create a dynamic angular tension -- the upper face has real visual energy.",
    },
    {
        "conditions": {"face_shape": {"round"}, "jawline": {"wide_round"}},
        "zh-CN": "圆润的脸型配上柔和的下颌，整体线条没有任何锐角——这种'全圆'的面部特别减龄。",
        "en": "Rounded face with a soft jaw -- no sharp angles anywhere. This 'all-curves' face is naturally age-defying.",
    },
    {
        "conditions": {"nose": {"snub", "snub_wide"}, "eyes": {"round"}},
        "zh-CN": "小巧的鼻型配上圆圆的眼睛，面部中央有一种可爱的聚焦感——像是五官在'打招呼'。",
        "en": "A petite nose paired with round eyes creates an adorable focal point at the face center -- like your features are waving hello.",
    },
    {
        "conditions": {"forehead": {"low"}, "eyebrows": {"straight", "straight_long"}},
        "zh-CN": "低额配平直眉型，五官的距离更紧凑——信息密度高的面孔往往辨识度也高。",
        "en": "A low forehead with straight brows keeps features close together -- high information density often means high distinctiveness.",
    },
    {
        "conditions": {"mouth": {"wide"}, "eyes": {"phoenix", "narrow"}},
        "zh-CN": "阔口配上有锐度的眼型，面部的'表现力'很强——说话和大笑时尤其有魅力。",
        "en": "A wide mouth with sharp eyes -- your face has powerful 'expressiveness,' especially magnetic when talking or laughing.",
    },
    {
        "conditions": {"face_shape": {"pear"}, "forehead": {"low"}},
        "zh-CN": "下宽上窄的脸型比例让你的面部重心偏下——稳重踏实的观感，配合发型在头顶增加体量效果会更平衡。",
        "en": "A bottom-heavy face proportion with a low forehead -- reads as grounded and steady. Adding volume at the crown with hairstyling would enhance balance.",
    },
    {
        "conditions": {"eyes": {"almond"}, "eyebrows": {"soft_arch"}},
        "zh-CN": "杏仁眼配柔弓眉，眉眼之间的搭配教科书般协调——不张扬但很耐看，属于'细品型'的好看。",
        "en": "Almond eyes with soft-arch brows -- the brow-eye harmony is textbook perfect. Not flashy, but the kind of beauty that grows the more you look.",
    },
    {
        "conditions": {"nose": {"straight", "normal"}, "mouth": {"balanced"}},
        "zh-CN": "标准的鼻型配上匀称的唇型，面部中下部分比例很均衡——这种'不出错'的搭配其实非常稀缺。",
        "en": "A well-proportioned nose with balanced lips -- the mid-to-lower face ratio is very even. This 'nothing wrong' combination is actually quite rare.",
    },
]


def _match_cross_features(features: dict[str, Any], locale: str) -> list[str]:
    """Find matching cross-feature observations, return up to 2."""
    shapes = {
        k: features.get(k, {}).get("shape_id", "")
        for k in ["face_shape", "eyes", "nose", "mouth", "eyebrows", "forehead", "jawline"]
    }

    matched: list[str] = []
    for rule in _CROSS_FEATURE_RULES:
        conditions = rule["conditions"]
        if all(
            shapes.get(k, "") in (v if isinstance(v, set) else {v})
            for k, v in conditions.items()
        ):
            text = rule.get(locale, rule.get("zh-CN", ""))
            if text:
                matched.append(text)
    return matched[:2]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _get_template(
    feature_key: str, shape_id: str, locale: str,
    seed_keys: tuple[str, ...] = (),
) -> dict[str, str]:
    """Get label, desc, and beauty_tip for a given feature+shape.

    When desc/beauty_tip is a list, deterministically pick one variant
    using _pick() seeded by the full feature combination.
    """
    templates = _ALL_TEMPLATES.get(feature_key, {})
    shape = templates.get(shape_id, {})
    data = shape.get(locale, shape.get("zh-CN", {"label": shape_id, "desc": "", "beauty_tip": ""}))

    result: dict[str, str] = {"label": data["label"]}
    for field in ("desc", "beauty_tip"):
        val = data.get(field, "")
        if isinstance(val, list) and val:
            result[field] = _pick(val, feature_key, shape_id, *seed_keys)
        else:
            result[field] = val
    return result



def _feature_score(feature_key: str, features: dict[str, Any]) -> int:
    """Compute a score (0-100) for a single feature.

    Uses the classifier's absolute match quality (clarity) instead of
    proximity to a universal ideal. This avoids penalizing valid face
    types for not matching one arbitrary "ideal" shape.
    """
    if feature_key == "symmetry":
        sym = features.get("symmetry", {}).get("overall_score", 75)
        return max(0, min(100, int(sym)))

    feat = features.get(feature_key, {})
    clarity = feat.get("clarity", 0.5)
    return max(0, min(100, int(clarity * 100)))


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
    sym_score = raw.get("symmetry_score", 0)
    courts_balanced = features.get("three_courts", {}).get("balanced", False)
    five_eyes_ratio = raw.get("five_eyes_ratio", 5.0)

    checks = {
        # Single-feature tags
        "phoenix_eyes": shapes["eyes"] == "phoenix",
        "almond_eyes": shapes["eyes"] == "almond",
        "round_eyes": shapes["eyes"] == "round",
        "balanced_courts": courts_balanced,
        "high_symmetry": sym_score > 85,
        "straight_nose": shapes["nose"] in ("straight", "straight_long"),
        "prominent_nose": shapes["nose"] == "straight_long",
        "wide_forehead": shapes["forehead"] == "high",
        "upturned_mouth": shapes["mouth"] == "upturned",
        "cherry_mouth": shapes["mouth"] == "small",
        "oval_face": shapes["face_shape"] == "oval",
        "strong_jaw": shapes["jawline"] in ("square", "angular"),
        "expressive_brows": shapes["eyebrows"] in ("high_arch", "long_arch"),
        "distant_brows": shapes["eyebrows"] in ("straight_long", "long_arch"),
        "golden_ratio": abs(five_eyes_ratio - 5.0) < 0.3,
        "mountain_balance": mountains.get("balance", 0) > 0.7,
        "yintang_open": palaces.get("yintang", {}).get("ratio", 1.0) > 1.1,
        # Compound-trait tags
        "cool_beauty": (
            shapes["eyes"] == "phoenix"
            and shapes["face_shape"] in ("diamond", "square")
        ),
        "sweet_face": (
            shapes["eyes"] in ("round", "almond")
            and shapes["face_shape"] in ("round", "oval")
            and shapes["mouth"] in ("upturned", "balanced")
        ),
        "classic_beauty": (
            shapes["face_shape"] == "oval"
            and shapes["nose"] in ("straight", "normal")
            and sym_score > 80
        ),
        "angular_edge": (
            shapes["face_shape"] in ("square", "diamond")
            and shapes["jawline"] in ("square", "angular")
        ),
        "born_harmony": (
            courts_balanced
            and sym_score > 85
            and abs(five_eyes_ratio - 5.0) < 0.3
        ),
        "camera_ready": (
            sym_score > 82
            and courts_balanced
        ),
        "warm_aura": (
            shapes["eyes"] in ("round", "almond")
            and shapes["mouth"] in ("upturned", "balanced")
            and shapes["face_shape"] in ("round", "oval", "heart")
        ),
    }

    for tag_key, labels in _TAG_RULES:
        if checks.get(tag_key, False):
            tags.append(labels.get(locale, labels["zh-CN"]))

    return tags


_SUMMARY_TEMPLATES = {
    "zh-CN": [
        "你的{standout}是整张脸的视觉锚点，一眼就能抓住注意力。{court_obs}{second}也在默默加分，加上整体{vibe}的气质，{conclusion}",
        "整张脸的叙事节奏很好：{standout}做开篇，{second}做呼应，{court_obs}属于那种越看越有味道的长相。",
        "{standout}定义了你面部的个性基调，{second}从旁衬托得恰到好处。{court_obs}总体来说，这张脸给人的感觉就两个字：{vibe}。",
        "如果用一个词形容你的面部印象，那就是{vibe}。{standout}是最大的功臣，{court_obs}{conclusion}",
        "见过你的人可能最先记住的是{standout}——{second}也在不声不响地帮忙加深印象。{court_obs}{conclusion}",
    ],
    "en": [
        "Your {standout} anchors the whole face -- it's the first thing people lock onto. {court_obs}{second} quietly adds depth. Combined with the {vibe} vibe, {conclusion}",
        "The face tells a good story: {standout} opens, {second} echoes, {court_obs}The kind of face that grows on you the longer you look.",
        "{standout} sets the personality, {second} plays the perfect supporting role. {court_obs}In a word: {vibe}.",
        "If there's one word for the impression your face leaves, it's {vibe}. Credit goes to your {standout}. {court_obs}{conclusion}",
        "People who've met you probably remember your {standout} first -- {second} is quietly reinforcing that impression. {court_obs}{conclusion}",
    ],
}

_SUMMARY_CONCLUSIONS = {
    "zh-CN": {
        "high_sym": [
            "五官之间的配合很默契——属于让人忍不住多看两眼的类型。",
            "整体的和谐感让人舒服，这张脸经得起细看。",
            "五官各司其职又彼此成就，蛮难得的。",
        ],
        "mid_sym": [
            "不是标准意义上的'完美'，但比完美更有记忆点。",
            "有自己的性格，比'什么都刚好'的脸有趣多了。",
            "辨识度很高——走过就不容易忘。",
        ],
    },
    "en": {
        "high_sym": [
            "The features play off each other beautifully -- the kind of face people can't help looking at twice.",
            "Everything works in concert, and it rewards a closer look.",
            "Each feature does its job while lifting the others -- genuinely rare.",
        ],
        "mid_sym": [
            "Not textbook 'perfect,' but far more memorable than perfection.",
            "There's real personality here -- way more interesting than a face that's just 'correct.'",
            "High distinctiveness -- the kind of face that sticks with you.",
        ],
    },
}


def _build_summary(features: dict[str, Any], locale: str) -> str:
    """Build a 2-3 sentence summary with varied templates."""
    from app.processing.aesthetics_rules import _IMPRESSIONS

    face_id = features.get("face_shape", {}).get("shape_id", "oval")
    eye_id = features.get("eyes", {}).get("shape_id", "almond")
    sym_score = features.get("symmetry", {}).get("overall_score", 75)
    courts = features.get("three_courts", {})

    # Find top 2 features by score
    feature_keys = ["eyes", "nose", "mouth", "eyebrows"]
    scored = sorted(feature_keys, key=lambda k: _feature_score(k, features), reverse=True)
    standout_key = scored[0]
    second_key = scored[1]
    standout_id = features.get(standout_key, {}).get("shape_id", "")
    second_id = features.get(second_key, {}).get("shape_id", "")

    standout_tpl = _get_template(standout_key, standout_id, locale)
    second_tpl = _get_template(second_key, second_id, locale)

    # Get vibe from impressions table
    impressions = _IMPRESSIONS.get(locale, _IMPRESSIONS.get("zh-CN", {}))
    vibe = impressions.get((face_id, eye_id), "")
    if not vibe:
        _VIBE_FALLBACK = {
            "zh-CN": {"oval": "温婉", "round": "亲切", "square": "飒爽",
                      "heart": "灵动", "diamond": "个性", "long": "从容", "pear": "沉稳"},
            "en": {"oval": "graceful", "round": "warm", "square": "bold",
                   "heart": "spirited", "diamond": "distinctive", "long": "composed", "pear": "grounded"},
        }
        vibe = _VIBE_FALLBACK.get(locale, _VIBE_FALLBACK["zh-CN"]).get(face_id, "")

    if locale == "zh-CN":
        standout = standout_tpl["label"]
        second = second_tpl["label"]
        # Court observation: conversational, not data-reading
        if courts.get("balanced"):
            court_obs = _pick([
                "面部三庭分配很均匀，整体节奏感舒服。",
                "比例上属于很均衡的类型，没有明显的长短板。",
                "三庭比例几乎等分，看起来很舒展。",
            ], face_id, eye_id, "court")
        else:
            upper = courts.get("upper", 0.333)
            lower = courts.get("lower", 0.333)
            if upper > 0.37:
                court_obs = "上庭偏长让你多了一分知性感。"
            elif lower > 0.37:
                court_obs = "下庭稍长，给人一种沉稳从容的气场。"
            else:
                court_obs = "面部比例有自己的节奏，不走'标准'路线反而更有个性。"
    else:
        standout = standout_tpl["label"].lower()
        second = second_tpl["label"].lower()
        if courts.get("balanced"):
            court_obs = _pick([
                "The facial thirds are nicely balanced -- everything flows. ",
                "Proportionally, you're in a very even range with no obvious weak spots. ",
                "Three-court ratio is nearly equal -- it reads as open and relaxed. ",
            ], face_id, eye_id, "court")
        else:
            upper = courts.get("upper", 0.333)
            lower = courts.get("lower", 0.333)
            if upper > 0.37:
                court_obs = "A longer upper third adds an intellectual quality. "
            elif lower > 0.37:
                court_obs = "A slightly longer lower face gives you a calm, grounded presence. "
            else:
                court_obs = "Your proportions march to their own beat -- that's character, not imperfection. "

    # Pick conclusion based on symmetry
    sym_tier = "high_sym" if sym_score > 80 else "mid_sym"
    conclusions = _SUMMARY_CONCLUSIONS.get(locale, _SUMMARY_CONCLUSIONS["zh-CN"]).get(sym_tier, [""])
    conclusion = _pick(conclusions, face_id, eye_id, "conclusion")

    # Pick template
    templates = _SUMMARY_TEMPLATES.get(locale, _SUMMARY_TEMPLATES["zh-CN"])
    return _pick(templates, face_id, standout_key, "summary").format(
        court_obs=court_obs,
        standout=standout,
        second=second,
        vibe=vibe,
        conclusion=conclusion,
    )


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
# Symmetry descriptions (observational, not score-reading)
# ---------------------------------------------------------------------------

_SYM_DESCRIPTIONS = {
    "zh-CN": {
        "excellent": {
            "label": "高度对称",
            "desc": [
                "左右两侧几乎是镜像关系——五官的位置、大小都高度一致。这种天然均衡在镜头前尤其讨好，怎么拍都不容易翻车。",
                "你的面部左右匹配度非常高，眉眼鼻唇的对称感一目了然。这是一种'安静的优势'——不张扬，但让人看着就觉得舒服。",
                "面部的均衡感属于上乘水准——左右脸拼在一起几乎无缝衔接。这种对称度在人群中很少见，也意味着你对各种造型的容错率很高。",
            ],
            "tip": [
                "对称度已经是你的天然优势，妆容保持自然就好，不需要刻意修饰。",
                "这种均衡感不需要修容来'纠正'什么——把时间花在强调亮点特征上更值得。",
            ],
        },
        "good": {
            "label": "较对称",
            "desc": [
                "面部整体很协调，左右的差异肉眼几乎看不出来。这种均衡度意味着你的面部底子很好，不需要靠技巧来修饰平衡感。",
                "左右脸的匹配度不错——虽然不是完美镜像，但协调感很扎实。这个底子比多数人都要好。",
            ],
            "tip": [
                "均衡度已经很好了，日常妆容自然就行，不用刻意找对称感。",
                "保持现有的自然感就好——过度修容反而会破坏这种天然的协调。",
            ],
        },
        "moderate": {
            "label": "较对称",
            "desc": [
                "轻微的左右差异反而给你的面部增添了一点'活'的感觉——完美对称的脸有时候反而显得像CGI。这种微小的不对称恰好让你看起来更真实。",
                "左右脸各有各的小特色，整体看起来依然协调。有意思的是，研究表明人们觉得有微小不对称的脸往往更有吸引力——因为更'真实'。",
            ],
            "tip": [
                "可以通过眉形的细微调整来增强视觉均衡感——眉毛是最容易调控对称印象的五官。",
                "如果想要更平衡的视觉效果，侧分发型比中分更容易营造均衡感。",
            ],
        },
        "low": {
            "label": "略有不对称",
            "desc": [
                "左右脸有自己的性格——这不是缺点，很多被公认好看的脸其实都不完全对称。不对称给了你的面部一种独特的'非标准美'。",
                "面部的不对称感比较明显，但这也意味着你的脸更'有故事'。拍照时选好角度，用你更喜欢的那一侧面对镜头就好。",
            ],
            "tip": [
                "选择一侧作为你的'招牌角度'——大多数人都有更上镜的一面，用好它。",
                "眉形微调和修容是提升视觉均衡感最有效的手段。不过也别太执着于对称，个性比完美更有看头。",
            ],
        },
    },
    "en": {
        "excellent": {
            "label": "Highly Symmetric",
            "desc": [
                "Your left and right sides are near-mirror images -- features align in size and placement with striking consistency. This kind of natural balance is especially forgiving on camera.",
                "Facial symmetry is top-tier -- brows, eyes, nose, and lips line up with remarkable precision. It's a quiet advantage: not flashy, but it makes everything look 'right.'",
                "The left-right match is unusually close, almost seamless when compared side by side. This level of symmetry is rare and gives you a high tolerance for any styling choice.",
            ],
            "tip": [
                "Symmetry is already working in your favor -- keep makeup natural, no correction needed.",
                "No need to 'fix' balance with contouring. Spend that energy highlighting your standout features instead.",
            ],
        },
        "good": {
            "label": "Fairly Symmetric",
            "desc": [
                "Overall very coordinated -- left-right differences are barely noticeable to the naked eye. This level of balance means your facial foundation is solid without needing technique to compensate.",
                "Left and right match up well -- not a perfect mirror, but the harmony is real. Better than most.",
            ],
            "tip": [
                "Balance is already solid -- keep everyday makeup natural, no need to chase perfect symmetry.",
                "Maintain the natural feel -- heavy contouring would actually undermine this effortless harmony.",
            ],
        },
        "moderate": {
            "label": "Fairly Symmetric",
            "desc": [
                "A slight left-right difference actually adds a sense of 'life' -- perfectly symmetric faces can read as CGI. This hint of asymmetry makes you look more authentically human.",
                "Each side has its own subtle character while the overall look stays coherent. Research suggests faces with slight asymmetry are often perceived as more attractive -- because they feel more real.",
            ],
            "tip": [
                "Fine-tuning brow shape can boost the visual sense of balance -- eyebrows are the easiest feature to adjust for symmetry perception.",
                "A side part tends to create a more balanced impression than a center part, if you want to play up symmetry.",
            ],
        },
        "low": {
            "label": "Slightly Asymmetric",
            "desc": [
                "Left and right each have their own personality -- not a flaw, since many universally admired faces aren't perfectly symmetric. The asymmetry gives your face a distinctive 'non-standard beauty.'",
                "The asymmetry is noticeable, but it also means your face has more 'story.' When photographing, pick the side you like better and own it.",
            ],
            "tip": [
                "Find your signature angle -- everyone has a more photogenic side. Lean into it.",
                "Brow shaping and contouring are the most effective tools for visual balance. But don't obsess over symmetry -- personality beats perfection.",
            ],
        },
    },
}


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

    # Build seed from all shape IDs so variant selection is cross-feature aware
    seed_keys = tuple(
        features.get(k, {}).get("shape_id", "")
        for k in ["face_shape", "eyes", "nose", "mouth", "eyebrows", "forehead", "jawline"]
    )

    for key in feature_keys:
        feat = features.get(key, {})
        shape_id = feat.get("shape_id", "")
        if key == "symmetry":
            score = _feature_score(key, features)
            sym_val = feat.get("overall_score", 75)
            sym_descs = _SYM_DESCRIPTIONS.get(locale, _SYM_DESCRIPTIONS["zh-CN"])
            if sym_val > 85:
                tier = "excellent"
            elif sym_val > 80:
                tier = "good"
            elif sym_val > 70:
                tier = "moderate"
            else:
                tier = "low"
            tier_data = sym_descs[tier]
            label = tier_data["label"]
            desc = _pick(tier_data["desc"], *seed_keys, "sym")
            beauty_tip = _pick(tier_data["tip"], *seed_keys, "sym_tip")
            feat_dict[key] = {"label": label, "score": score, "description": desc, "beauty_tip": beauty_tip}
        else:
            tpl = _get_template(key, shape_id, locale, seed_keys=seed_keys)
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
