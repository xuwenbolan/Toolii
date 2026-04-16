# Thesis Format Standard (Chinese Undergraduate)

Source: `data/test/毕业论文模板.docx` (广东金融学院本科毕业论文模板)
Extracted: 2026-03-19

This document defines the formatting standard for Chinese undergraduate thesis documents.
Word Tools uses these values as the reference baseline for health checking and auto-repair.

The template contains 55 embedded WPS text boxes (not standard Word comments) with
formatting instructions. These are stored in `<wps:txbx>` elements inside `word/document.xml`.
Below is the authoritative standard compiled from those annotations + XML analysis.

---

## 1. Page Layout

> TextBox #3: 全文所有页边距：上下：2.54厘米 左右：3.18厘米 包括封面、摘要、目录、正文

All sections (cover, abstract, TOC, body) use identical margins.

| Property | Value | Notes |
|----------|-------|-------|
| Paper size | A4 (210 x 297 mm) | w=11906 h=16838 twips |
| Orientation | Portrait | |
| Left margin | 3.18 cm | 1803 twips |
| Right margin | 3.18 cm | 1803 twips |
| Top margin | 2.54 cm | 1440 twips |
| Bottom margin | 2.54 cm | 1440 twips |
| Gutter | 0 | |
| Header distance | 1.50 cm | 851 twips |
| Footer distance | 1.75 cm | 992 twips |
| Document grid | lines, linePitch=312 | |

### Section Structure & Page Numbers

> TextBox #8: 本页没有页码
> TextBox #18: 中文摘要和英文摘要：注意页码的格式，用罗马数字，不要用阿拉伯数字。
> TextBox #26: 目录不加页码
> TextBox #32: 正文页码从本页开始，标到致谢结束，如有附录则到附录结束。注意正文的页码用阿拉伯数字，与摘要的页码格式不一样。
> TextBox #55: 1.页码从正文第一页开始排序，一直排到致谢页。2.最后打印的纸质版论文是从正文第一页到致谢页双面打印。

| Section | Content | Page Number | Notes |
|---------|---------|-------------|-------|
| 1 | Cover + blank page | None | No page number |
| 2 | Declaration + blank page | None | No page number |
| 3 | Abstract (zh + en) | Roman numerals (I, II, III...) | |
| 4 | Table of contents | None | No page number |
| 5 | Body + references + appendix + acknowledgment | Arabic (1, 2, 3...) start=1 | Through to acknowledgment |

---

## 2. Default Fonts

| Scope | Font |
|-------|------|
| East Asian (CJK) | SimSun (宋体) |
| ASCII / Latin | Times New Roman |
| hAnsi | Times New Roman |
| Complex Script | Times New Roman |

---

## 3. Style Definitions

### 3.1 Cover Page (封面)

> TextBox #4: 封面题目：黑体一号加粗，居中，单倍行距。
> TextBox #5: 1.如果字数较多一行排不下要排两行时，应注意排版美观，尽量将两行的字数调整至接近，同时一个词组应放在同一行。2.每个指导老师名下同一个选题的套用不要超过两次，由每个指导老师在组内来把握和控制。3.如有副标题，副标题放在正标题下一行，前面加破折号，副标题字体使用黑体二号加粗，居中。4.全文1万字以上。
> TextBox #7: 学生信息都要居中，下划线长短保持一致
> TextBox #2: 注：教师姓名后留有一个空格，后面填写教师职称。下面加下划线。阅后删除此文本框。
> TextBox #6: 提交日期：一辩的学生填写：2024年04月12日，二辩的学生填写：2024年04月24日。

| Element | Font | Size | Alignment | Weight | Line Spacing |
|---------|------|------|-----------|--------|-------------|
| Main title (论文题目) | SimHei (黑体) | 26pt (一号) | Center | Bold | Single (1.0x) |
| Subtitle (副标题) | SimHei (黑体) | 22pt (二号) | Center | Bold | Single (1.0x) |
| Student info fields | — | — | Center | — | — |

**Rules:**
1. Title too long for one line: split into two lines with roughly equal character counts; keep word groups on the same line.
2. Subtitle: next line after main title, prefixed with em-dash (——), SimHei 二号 bold centered.
3. Student info: all centered, underlines must be consistent length.
4. Teacher field: name + space + title, underlined.
5. Minimum thesis length: 10,000 words.

### 3.2 Printing & Blank Pages

> TextBox #9: 本页空一页 因为打印时，封面要求单面打印，这里空一页，打印时点击双面打印即可，打印效果就是单面。
> TextBox #13: 此页空一页 因为打印时，诚信声明要求单面打印，这里空一页，打印时点击双面打印即可，打印效果就是单面。
> TextBox #10: 纸质版"学生签名和时间"必须手签；此处的时间要与封面的时间一致。电子版插入透明手签图片和填写日期。图片不能有底色阴影。
> TextBox #25: 如果目录只有一页内容，这里空一页，直接打印时，目录页的效果就是单面，后面的正文内容刚好新起一页。如果目录有两页内容，刚好占据这个空白页，直接双面打印。

- Cover page: insert blank page after (single-side printing).
- Declaration page: insert blank page after (single-side printing).
- TOC: if one page, insert blank page; if two pages, no blank needed.
- All blank pages: no page number, no header/footer.
- Signatures: physical copies must be hand-signed; digital copies use transparent signature images (no background shadow), date must match cover.

### 3.3 Declaration (诚信声明)

| Element | Font | Size | Alignment | Weight | Line Spacing |
|---------|------|------|-----------|--------|-------------|
| Title | SimSun | 18pt | Center | Bold | — |
| Body | SimSun + Times New Roman | 14pt (四号) | Justify | Normal | 23pt exact |
| Body indent | — | — | — | — | firstLine ~2 chars |

### 3.4 Abstract - Chinese (摘要)

> TextBox #14: 黑体，四号，加粗，居中。上下不空行。段前段后0.5行，1.5倍行距。"摘"和"要"之间空2个汉字的距离。
> TextBox #17: 摘要内容写成一段，字数300-500字。仿宋，小四，1.5倍行距。首行缩进两字符。
> TextBox #15: 关键词不超过5个。用分号隔开。仿宋，小四。关键词与摘要内容之间不要空行。关键词不能用"发展趋势"、"对策"、"建议"等一般性的词汇。
> TextBox #16: 关键词和冒号：仿宋小四加粗。注意：前面缩进2字符。

| Element | Font | Size | Alignment | Weight | Line Spacing | Indent |
|---------|------|------|-----------|--------|-------------|--------|
| Title "摘    要" | SimHei (黑体) | 14pt (四号) | Center | Bold | 1.5x | space-before/after: 0.5 line |
| Body text | FangSong (仿宋) | 12pt (小四) | Justify | Normal | 1.5x | firstLine: 2 chars |
| "关键词" label + colon | FangSong (仿宋) | 12pt (小四) | — | Bold | — | firstLine: 2 chars |
| Keywords content | FangSong (仿宋) | 12pt (小四) | — | Normal | — | — |

**Rules:**
- "摘" and "要" separated by 2 Chinese character widths.
- No blank lines above or below the title.
- Abstract body: single paragraph, 300-500 words.
- Keywords: max 5, separated by semicolons, no generic terms ("对策", "建议", etc.).
- No blank line between abstract body and keywords.

### 3.5 Abstract - English (Abstract)

> TextBox #20: 字体Times New Roman，小三加粗，居中。上下不空行。首字母A大写。段前段后0.5行。1.5倍行距。
> TextBox #21: 摘要内容：字体Times New Roman,小四，1.5倍行距。英文摘要须与中文摘要一一对应。
> TextBox #22: Keywords和冒号: 字体Times New Roman小四加粗。注意：Key words前缩进2个字符
> TextBox #23: 各关键词首字母大写，介词除外。各关键词之间用分号隔开。若关键词有两行，直接落在第二行，不用空格。

| Element | Font | Size | Alignment | Weight | Line Spacing | Indent |
|---------|------|------|-----------|--------|-------------|--------|
| Title "Abstract" | Times New Roman | 15pt (小三) | Center | Bold | 1.5x | space-before/after: 0.5 line |
| Body text | Times New Roman | 12pt (小四) | Justify | Normal | 1.5x | firstLine: 2 chars |
| "Keywords" label + colon | Times New Roman | 12pt (小四) | — | Bold | — | firstLine: 2 chars |
| Keywords content | Times New Roman | 12pt (小四) | — | Normal | — | — |

**Rules:**
- No blank lines above or below the title. Capital "A" in "Abstract".
- English abstract must correspond one-to-one with Chinese abstract.
- Each keyword: capitalize first letter (except prepositions), separated by semicolons.
- If keywords wrap to second line, continue directly (no extra indent/space).

### 3.6 Table of Contents (目录)

> TextBox #24: "目"和"录"之间空两个汉字的距离。黑体小三加粗，居中。段前段后0.5行。1.5倍行距。必须写文献综述，作为单独一章 必须写结论 致谢在附录之后 建议大家学习如何设置段落的大纲级别，自动生成目录，以及如何使用导航窗格。

| Element | Font | Size | Alignment | Weight | Line Spacing |
|---------|------|------|-----------|--------|-------------|
| Title "目    录" | SimHei (黑体) | 15pt (小三) | Center | Bold | 1.5x, space-before/after: 0.5 line |
| TOC Level 1 | SimSun + Times New Roman | 14pt (四号) | Left | Normal | — |
| TOC Level 2 | SimSun + Times New Roman | 14pt (四号) | Left | Normal | leftChars: 200 (2 chars) |

**Rules:**
- "目" and "录" separated by 2 Chinese character widths.
- Must include: 文献综述 (as standalone chapter), 结论, 致谢 (after appendix).
- Recommend using outline levels + auto-generated TOC.

### 3.7 Body - Main Title (正文总标题)

> TextBox #27: 正文标题：黑体小二加粗，居中。上面空一行，下面不空行。段前段后 1行，单倍行距 若有副标题，字体与主标题一样。

| Element | Font | Size | Alignment | Weight | Line Spacing | Spacing |
|---------|------|------|-----------|--------|-------------|---------|
| Main title | SimHei (黑体) | 18pt (小二) | Center | Bold | Single (1.0x) | before: 1 line, after: 1 line |
| Subtitle | SimHei (黑体) | 18pt (小二) | Center | Bold | Single (1.0x) | — |

**Rules:**
- One blank line above the main title, no blank line below.
- Subtitle uses same font/size as main title.

### 3.8 Body - Headings (正文标题)

> TextBox #30: 正文一级标题：宋体小三加粗，居中。上下不空行。段前段后0.5行，1.5倍行距
> TextBox #36: 正文二级标题：宋体四号加粗。左对齐。缩进2字符。上下不空行。段前段后0.5行，1.5倍行距。
> TextBox #37: 正文一级标题：宋体小三加粗，居中。上下不空行。段前段后0.5行，1.5倍行距。建议一、二级标题之间有过渡段落。
> TextBox #38: 大标题、小标题都不能写在一页的最后一行

| Level | Font | Size | Alignment | Weight | Line Spacing | Spacing | Indent | Numbering |
|-------|------|------|-----------|--------|-------------|---------|--------|-----------|
| Heading 1 | SimSun (宋体) | 15pt (小三) | Center | Bold | 1.5x | before/after: 0.5 line | none | 一、二、三、... |
| Heading 2 | SimSun (宋体) | 14pt (四号) | Left | Bold | 1.5x | before/after: 0.5 line | 2 chars | （一）（二）... |
| Heading 3 | SimSun (宋体) | 12pt (小四) | Left | Bold | 1.5x | — | 2 chars | 1. 2. 3. ... |

**Rules:**
- No blank lines above or below any heading.
- Headings must NOT appear on the last line of a page (keep with next).
- Recommend transition paragraphs between H1 and H2.

### 3.9 Body Text (正文内容)

> TextBox #34: 正文内容：宋体小四。两端对齐：包括摘要、目录、正文、三级标题、致谢。（一二级标题除外）。左对齐：参考文献。每段首行：缩进两字符。行间距1.5倍，页边距上下各2.54cm,左右各3.18cm。正文内有公式，字体为默认，大小与正文相同。
> TextBox #19: 段落首行缩进2字符，1.5倍行距
> TextBox #35: 引言说明：引言需要提出问题...建议同时包括两种引题方式。提出问题之后，需要对文章的主要内容进行简练的介绍，建议也对本文的创新点进行说明。

| Property | Value |
|----------|-------|
| CJK font | SimSun (宋体) |
| Latin font | Times New Roman |
| Font size | 12pt (小四) |
| Alignment | Justify (两端对齐) |
| Line spacing | 1.5x |
| First line indent | 2 chars |
| Formulas | Default font, same size as body text |

**Alignment rules:**
- Justify (两端对齐): abstract, TOC, body text, H3, acknowledgment.
- Center: H1, H2 titles.
- Left: references.

### 3.10 Figures and Tables (图表)

> TextBox #31: 表上图下：表的名字，要写在表的上方；图的名字，要写在图的下方。图题：是指图的题目。要写在图的下方；黑体五号，居中，单倍行距。不能截图，可以彩色。若为彩色，则需要彩打。
> TextBox #33: 资料来源、数据来源：使用数据的图表需要数据来源，自己做的类似于流程图或其他图不需要数据来源。写在图题下方，居中对齐。宋体小五，单倍行距。（横纵坐标相同）
> TextBox #39: 任何图、图片和表格不可以分开在两页，可以整体放在一页的最下面或者下一页的最上面。若上一页空白太多，可将表后的正文内容提到上一页中。只有当一张表格一页都无法显示完整，才允许跨页，并在第二页注明（续表）
> TextBox #40: 表题：是指表的题目。要写在表的上方；黑体五号，居中，单倍行距 表格内容：中文：宋体小五 英文/数字：Times New Roman 行距都是：单倍行距。表格右上角若有单位，单位格式和表格内容格式一样。若是流程图，流程图的字体也是宋体小五。
> TextBox #41: 论文所有表格须采用三线表格式（即第一行有上下边框，最后一行有下边框，列均没有边框）自动调整-根据窗口调整表格
> TextBox #42: 表上图下：表的名字，要写在表的上方；图的名字，要写在图的下方。
> TextBox #43: 不可以使用软件截图的实证结果，而是要整理为文中的形式。
> TextBox #44: 续表的格式可以参考这里
> TextBox #45: 对经常出现的问题的总结...（标题排版、表和图、图表不能截图等综合说明）

| Element | Font | Size | Alignment | Line Spacing |
|---------|------|------|-----------|-------------|
| Table caption (表题) | SimHei (黑体) | 10.5pt (五号) | Center | Single (1.0x) |
| Figure caption (图题) | SimHei (黑体) | 10.5pt (五号) | Center | Single (1.0x) |
| Data source note | SimSun (宋体) | 9pt (小五) | Center | Single (1.0x) |
| Table content (CJK) | SimSun (宋体) | 9pt (小五) | — | Single (1.0x) |
| Table content (Latin/numbers) | Times New Roman | 9pt (小五) | — | Single (1.0x) |
| Flowchart text | SimSun (宋体) | 9pt (小五) | — | — |

**Rules:**
- Table caption above the table; figure caption below the figure ("表上图下").
- Tables: must use three-line table format (top border, header bottom border, bottom border only; no column borders). Auto-fit to window width.
- Figures/tables must not split across pages. Place as a whole at bottom of current page or top of next page. If previous page has too much whitespace, pull body text up.
- Only when a table cannot fit on one page: allow cross-page, mark second part as "（续表）".
- Data source: required for data-driven figures/tables; not needed for self-created flowcharts. Placed below figure caption, centered.
- Table unit label (if any): top-right corner, same format as table content.
- No screenshots of software output; must create proper tables/figures.
- No heading of any level may directly precede a figure/table; text must come between heading and figure/table.
- Figures may be in color (requires color printing).

### 3.11 References (参考文献)

> TextBox #46: 参考文献视作一级标题：宋体小三加粗，居中，不缩进 上下不空行，1.5行距 段前段后0.5行。
> TextBox #47: 参考文献的内容：宋体五号，左对齐 不用首行缩进2字符 单倍行距，方括号标点符号，用英文标点格式。
> TextBox #48: 1.参考文献的条目至少为15条以上。2.应体现时效性，原则上以近5年的为宜...近5年的文献应该在整个文献中占2/3或以上。3.必须采用实引，不可虚引...4.举例说明...
> TextBox #49: 注意：1.参考文献中列出的条目，必须与正文的引用一一对应...（详细引用格式说明）

| Element | Font | Size | Alignment | Weight | Line Spacing | Indent |
|---------|------|------|-----------|--------|-------------|--------|
| Title "参考文献" | SimSun (宋体) | 15pt (小三) | Center | Bold | 1.5x, before/after: 0.5 line | none |
| Reference entries | SimSun (宋体) | 10.5pt (五号) | Left | Normal | Single (1.0x) | none (no firstLine indent) |

**Numbering:** `[N]` format, English punctuation in brackets.

**Rules:**
1. Minimum 15 references.
2. Recency: 2/3 or more from the past 5 years (classic references exempt).
3. Must use real citations (实引): every in-text citation must appear in reference list and vice versa.
4. In-text citation format:
   - 2 authors: use "和" connector, e.g., "曹瓅和罗剑朝（2019）"
   - 3+ authors: first author + "等", e.g., "甘晓丽等（2019）"
   - English: use family name only, e.g., "Chatterjee和Rose（2012）", or "Zhang等（2022）"
5. Repeated citation of same reference: use the original number, e.g., `[2]` again; do not duplicate in reference list.
6. Multiple citations in one sentence: use range, e.g., `[1-5]` instead of `[1][2][3][4][5]`.
7. English references in list: Family name + given name initial(s), separated by comma then space, last author ends with period. E.g., "Heck J L, Cooley P L, Hubbard C M."
8. Recommend exporting GB/T 7714 citation format from reference managers, then adjust to match template requirements.

### 3.12 Appendix (附录)

> TextBox #51: 附录不是必须的，需要时才写。"附录"二字视作一级标题。宋体小三加粗，左对齐，不缩进。上下不空行。1.5倍行距。段前段后各0.5行。
> TextBox #50: 附录中的内容：首行：缩进两字符。行间距1.5倍。段落文本格式与论文的其余部分一致，页边距也一致。宋体小四，两端对齐。如有多个附录，则须有编号。

| Element | Font | Size | Alignment | Weight | Line Spacing | Indent |
|---------|------|------|-----------|--------|-------------|--------|
| Title "附录" / "附    录" | SimSun (宋体) | 15pt (小三) | Left | Bold | 1.5x, before/after: 0.5 line | none |
| Body text | SimSun (宋体) | 12pt (小四) | Justify | Normal | 1.5x | firstLine: 2 chars |

**Rules:**
- Appendix is optional; include only when needed.
- Multiple appendices must be numbered.

### 3.13 Acknowledgment (致谢)

> TextBox #52: 致谢视作一级标题：宋体小三加粗，居中，不缩进。上下不空行。1.5行距 段前段后0.5行 致和谢两字中间空两个汉字的距离。
> TextBox #53: 宋体小四，两端对齐。首行缩进2字符 1.5倍行距
> TextBox #54: 致谢主要是要向论文写作过程中直接帮助过自己的指导老师、任课老师、答疑老师及其他人员表达自己的谢意，这不仅是一种礼貌，也是对他人劳动的尊重，是治学者应有的思想作风。这是一个重要的工作伦理，应该是真诚的、发自内心的感谢，不要照抄照搬。

| Element | Font | Size | Alignment | Weight | Line Spacing | Indent |
|---------|------|------|-----------|--------|-------------|--------|
| Title "致    谢" | SimSun (宋体) | 15pt (小三) | Center | Bold | 1.5x, before/after: 0.5 line | none |
| Body text | SimSun (宋体) | 12pt (小四) | Justify | Normal | 1.5x | firstLine: 2 chars |

**Rules:**
- "致" and "谢" separated by 2 Chinese character widths.
- Content must be sincere and original (no copying).

### 3.14 Header and Footer (页眉页脚)

> TextBox #28: 页眉从本页开始，标到致谢结束。黑体小五，右对齐
> TextBox #29: 页眉从本页开始，标到致谢结束。黑体小五，左对齐

| Element | Font | Size | Alignment | Border | Content | Range |
|---------|------|------|-----------|--------|---------|-------|
| Header (left) | SimHei (黑体) | 9pt (小五) | Left | bottom single 0.75pt | Institution name | Body to acknowledgment |
| Header (right) | SimHei (黑体) | 9pt (小五) | Right | bottom single 0.75pt | "本科毕业论文" | Body to acknowledgment |
| Footer | — | — | Center | none | Arabic page number | Body to acknowledgment |

---

## 4. Numbering Definitions

| numId | Format | Pattern | Usage |
|-------|--------|---------|-------|
| 2 (abstract 0) | chineseCounting | 一、二、三、... | Heading 1 |
| 3 (abstract 3) | japaneseCounting | （一）（二）... | Heading 2 |
| 1 (abstract 2) | decimal | 1. 2. 3. ... | Heading 3 |
| 7 (abstract 1) | decimal `[%1]` | [1] [2] [3] ... | References |

---

## 5. Chinese Font Size Reference Table

| Chinese Name | Point Size | Half-points (sz) | Usage in Template |
|-------------|-----------|-------------------|-------------------|
| 一号 | 26pt | 52 | Cover main title |
| 二号 | 22pt | 44 | Cover subtitle |
| 小二 | 18pt | 36 | Body main title |
| 三号 | 16pt | 32 | — |
| 小三 | 15pt | 30 | H1, TOC title, abstract title (en), section titles |
| 四号 | 14pt | 28 | H2, abstract title (zh), TOC entries |
| 小四 | 12pt | 24 | Body text, H3, keywords, appendix/acknowledgment body |
| 五号 | 10.5pt | 21 | Table/figure captions, reference entries |
| 小五 | 9pt | 18 | Header, footer, data source notes, table content |

---

## 6. Unit Conversion Reference

| Unit | Conversion |
|------|-----------|
| 1 twip | 1/20 pt = 1/1440 inch |
| 1 cm | 567 twips |
| 1 inch | 1440 twips |
| 1 half-point (sz) | 0.5pt |
| 1 EMU | 1/914400 inch = 1/360000 cm |
| Line spacing auto 240 | 1.0x single spacing |
| Line spacing auto 360 | 1.5x spacing |
| Line spacing auto 480 | 2.0x double spacing |
| firstLineChars 200 | 2 character indent |
| beforeLines 50 | 0.5 line spacing before |

---

## 7. Comprehensive Layout Rules Summary

> TextBox #45 (consolidated formatting FAQ from template):

### 7.1 Heading Layout Rules
- No heading of any level may appear on the last line of a page; move to next page with its following paragraph.
- If unavoidable, adjust by adding/removing body text nearby.
- No heading may directly precede a figure/table without intervening text.

### 7.2 Figure & Table Rules
1. Data-driven content requires figures/tables with supporting text analysis ("图1显示...", "表1显示..."). Figures/tables cannot be decorative only.
2. Table caption above table; figure caption below figure.
3. Figures/tables must not split across pages; keep with caption and data source as one unit.
4. No screenshots; create proper formatted tables/figures.
5. Single data series: no legend needed. Two or more: legend required with clear differentiation.
6. Text must appear between any heading and a figure/table.

### 7.3 Citation Rules (Summary)
- Real citations only (实引): in-text and reference list must be 1:1 matching.
- 2 Chinese authors: "A和B（2019）"; 3+: "A等（2019）"
- English: family name only; 3+: "Zhang等（2022）"
- Same reference cited again: reuse original `[N]` number.
- Multiple citations in one sentence: `[1-5]` range format.

---

## 8. Health Check Rules (for Word Tools)

### 8.1 Page Layout Checks

| Rule ID | Check | Expected | Severity |
|---------|-------|----------|----------|
| PL-001 | Paper size | A4 (11906 x 16838 twips) | warning |
| PL-002 | Left/right margins | 1803 twips (3.18cm) | warning |
| PL-003 | Top/bottom margins | 1440 twips (2.54cm) | warning |
| PL-004 | Header distance | 851 twips (1.5cm) | info |
| PL-005 | Footer distance | 992 twips (1.75cm) | info |

### 8.2 Font Checks

| Rule ID | Check | Expected | Severity |
|---------|-------|----------|----------|
| FT-001 | Body CJK font | SimSun (宋体) | critical |
| FT-002 | Body Latin font | Times New Roman | critical |
| FT-003 | Abstract body CJK font | FangSong (仿宋) | critical |
| FT-004 | H1 font | SimSun (宋体) | warning |
| FT-005 | Cover title font | SimHei (黑体) | warning |
| FT-006 | Caption font | SimHei (黑体) | warning |
| FT-007 | Header font | SimHei (黑体) | info |

### 8.3 Font Size Checks

| Rule ID | Check | Expected | Severity |
|---------|-------|----------|----------|
| FS-001 | Body text size | 24 half-pt (12pt / 小四) | critical |
| FS-002 | Heading 1 size | 30 half-pt (15pt / 小三) | critical |
| FS-003 | Heading 2 size | 28 half-pt (14pt / 四号) | warning |
| FS-004 | Heading 3 size | 24 half-pt (12pt / 小四) | warning |
| FS-005 | Table/figure caption size | 21 half-pt (10.5pt / 五号) | warning |
| FS-006 | Reference entry size | 21 half-pt (10.5pt / 五号) | warning |
| FS-007 | Table content size | 18 half-pt (9pt / 小五) | info |

### 8.4 Spacing Checks

| Rule ID | Check | Expected | Severity |
|---------|-------|----------|----------|
| SP-001 | Body line spacing | 1.5x | critical |
| SP-002 | Body first-line indent | 2 chars | critical |
| SP-003 | H1 alignment | Center | warning |
| SP-004 | H1 space before/after | 0.5 line | warning |
| SP-005 | H2 alignment | Left, indent 2 chars | warning |
| SP-006 | H2 space before/after | 0.5 line | warning |
| SP-007 | Body alignment | Justify (both) | warning |
| SP-008 | Reference alignment | Left (no indent) | info |
| SP-009 | Table format | Three-line table | info |

### 8.5 Structure Checks

| Rule ID | Check | Expected | Severity |
|---------|-------|----------|----------|
| ST-001 | Has cover page | Cover section present | warning |
| ST-002 | Has abstract (zh) | "摘要" heading present | warning |
| ST-003 | Has abstract (en) | "Abstract" heading present | warning |
| ST-004 | Has TOC | Table of contents present | warning |
| ST-005 | Has references | "参考文献" section, >= 15 entries | warning |
| ST-006 | Has acknowledgment | "致谢" section present | warning |
| ST-007 | Page number format | Cover: none, Abstract: roman, TOC: none, Body: arabic | info |
| ST-008 | Heading numbering | H1: 一二三, H2:（一）（二）, H3: 1. 2. 3. | warning |
| ST-009 | Heading not on last line | keepWithNext for all headings | warning |
| ST-010 | Figures/tables not split | No cross-page split | info |
| ST-011 | Citation matching | In-text citations match reference list 1:1 | warning |
| ST-012 | Reference recency | >= 2/3 from past 5 years | info |
| ST-013 | Minimum word count | >= 10,000 words | info |

---

## 9. Auto-Repair Actions

| Rule | Repair Action | Risk |
|------|--------------|------|
| FT-001/002 | Normalize body runs to SimSun (CJK) + Times New Roman (Latin) | Low |
| FT-003 | Normalize abstract body to FangSong | Low |
| FS-001 | Set body paragraph run sz=24 | Low |
| FS-002 | Set heading 1 run sz=30 | Low |
| SP-001 | Set body paragraph spacing line=360 lineRule=auto | Low |
| SP-002 | Set body paragraph ind firstLineChars=200 | Low |
| SP-003 | Set heading 1 jc=center | Low |
| SP-007 | Set body paragraph jc=both | Low |
| SP-008 | Set reference paragraphs jc=left, remove firstLine indent | Low |
| PL-002/003 | Adjust section margins to standard values | Medium |
| ST-008 | Apply numbering definitions matching standard patterns | High |
| ST-009 | Set keepWithNext on all heading paragraphs | Low |

Risk levels:
- **Low**: safe to auto-apply, affects only the targeted property
- **Medium**: changes page layout, may shift content across pages
- **High**: structural change, may affect numbering references
