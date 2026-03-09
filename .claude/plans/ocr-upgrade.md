# OCR 功能升级计划

Status: draft | Updated: 2026-03-09

## 背景

当前 OCR 功能仅提供"图片转文字"，与微信、iOS 系统级 OCR 无差异化。
需要增加系统级 OCR 做不了的功能，才有独立存在的价值。

### 当前技术栈
- 引擎: RapidOCR (PP-OCRv4 ONNX) — det ~3MB + cls ~2MB + rec ~11MB
- 运行: CPU 推理，内存 ~100-200MB
- 架构: 前端 → 后端 `/api/image/ocr` → Cortex `/v1/ocr`

### 调研结论
- RapidAI 生态有现成的表格识别 (RapidTable)、公式识别 (RapidLaTeXOCR)、版面分析 (RapidLayout)，全部 ONNX + CPU + Apache 2.0
- PP-OCRv5 已发布，精度比 v4 提升 13%，RapidOCR 可直接替换 ONNX 模型
- 可搜索 PDF 不需要新模型，用 pymupdf 叠加透明文字层即可
- PDF 转 Word 不做 — 用户期望像素级还原，开源方案做不到，竞品太多

---

## Phase 2: 可搜索 PDF 生成

**目标**: 扫描件 PDF / 多张图片 → 可搜索可复制的 PDF

**原理**: 原始页面图片保持不变 + 叠加透明文字层（OCR box 坐标对齐）

### 2.1 Cortex 端 — 无改动
- 复用现有 `/v1/ocr` 端点，无需新模型

### 2.2 后端 — 新端点
- **新增端点**: `POST /api/image/ocr/searchable-pdf`
- **输入**: 一个 PDF 文件或多张图片
- **处理流程**:
  1. PDF → 逐页光栅化为图片（pymupdf）
  2. 每页调用 Cortex `/v1/ocr` 获取文字 + box 坐标
  3. 用 pymupdf 创建新 PDF：原图作为页面背景 + 透明文字层叠加
  4. 返回生成的可搜索 PDF 文件
- **依赖**: `pymupdf` (后端新增)
- **关键细节**:
  - 文字字号需匹配 box 高度，确保选中时对齐
  - 中文用 pymupdf 内置 CJK 字体
  - 透明文字: `opacity=0` 或 `render_mode=3` (invisible)

### 2.3 前端 — 新页面或 OcrPage 扩展
- **方案 A**: 在现有 OcrPage 中增加"生成可搜索 PDF"按钮（PDF 模式下显示）
- **方案 B**: 独立工具页
- **交互**:
  1. 用户上传扫描件 PDF 或多张图片
  2. 显示处理进度（逐页 OCR）
  3. 完成后提供下载按钮

### 2.4 涉及文件
- `backend/app/routers/image.py` — 新端点
- `backend/app/services/image_service.py` — 可搜索 PDF 生成逻辑
- `backend/pyproject.toml` — 添加 pymupdf 依赖
- `frontend/src/pages/ImageTools/OcrPage.tsx` — UI 扩展
- `frontend/src/services/imageApi.ts` — 新 API 调用

**工作量**: 后端 1-2 天，前端 1 天

---

## Phase 3: 表格识别 → Excel

**目标**: 图片中的表格 → 下载 .xlsx / .csv 文件

### 3.1 Cortex 端 — 新引擎 + 端点
- **新引擎**: `cortex/app/engines/rapidtable.py`
  - 基于 `rapid-table` (ONNX)，和 RapidOCR 同生态
  - 模型: ~10-30MB ONNX，CPU 推理
  - 输出: 表格结构 HTML
- **新端点**: `POST /v1/table-rec`
  - 输入: `image_b64`
  - 输出: `{ html: string, cells: [...], meta: {...} }`
- **依赖**: `rapid-table` 加入 cortex pyproject.toml optional deps

### 3.2 后端 — 新端点
- **新增端点**: `POST /api/image/ocr/table`
- **处理流程**:
  1. 调用 Cortex `/v1/table-rec` 获取表格结构 HTML
  2. 用 `openpyxl` 将 HTML 表格转为 .xlsx
  3. 返回文件下载
- **依赖**: `openpyxl` (后端新增)

### 3.3 前端 — 新工具页或 OcrPage 子模式
- 上传图片 → 预览表格识别结果 → 下载 Excel/CSV
- 可视化: 原图上叠加识别到的表格区域

### 3.4 涉及文件
- `cortex/app/engines/rapidtable.py` — 新引擎
- `cortex/app/router.py` — 新端点
- `cortex/pyproject.toml` — 新依赖
- `backend/app/routers/image.py` — 新端点
- `backend/app/services/image_service.py` — 表格处理逻辑
- `backend/pyproject.toml` — openpyxl 依赖
- 前端新页面或 OcrPage 扩展

**工作量**: 3-4 天

---

## Phase 4: 公式识别 → LaTeX

**目标**: 数学公式图片 → LaTeX 代码（可复制到论文/文档）

### 4.1 Cortex 端 — 新引擎 + 端点
- **新引擎**: `cortex/app/engines/rapidlatex.py`
  - 基于 `rapid-latex-ocr` (ONNX)
  - 模型: ~100MB ONNX，CPU 推理
  - 输出: LaTeX 字符串
- **新端点**: `POST /v1/latex-ocr`
  - 输入: `image_b64`
  - 输出: `{ latex: string, confidence: float, meta: {...} }`

### 4.2 后端 — 新端点
- `POST /api/image/ocr/latex`
- 直接透传 Cortex 结果

### 4.3 前端 — 新工具页
- 上传公式图片/截图 → 显示 LaTeX 代码 + 渲染预览 → 一键复制
- 可用 KaTeX 或 MathJax 做前端渲染预览

### 4.4 涉及文件
- `cortex/app/engines/rapidlatex.py` — 新引擎
- `cortex/app/router.py` — 新端点
- `cortex/pyproject.toml` — 新依赖
- `backend/app/routers/image.py` — 新端点
- 前端新页面

**工作量**: 2-3 天

---

## Phase 1: OCR 模型升级 (PP-OCRv5) ← 最优先

**目标**: 替换 PP-OCRv4 → PP-OCRv5，全面提升识别精度

### 为什么升级

PP-OCRv5 相比 v4 的精度提升（Server 模型）:

| 场景 | v4 | v5 | 提升 |
|------|-----|-----|------|
| 印刷中文 | 0.849 | 0.901 | +5.3pp |
| 印刷英文 | 0.668 | 0.868 | +20.0pp |
| 手写中文 | 0.363 | 0.581 | +21.8pp |
| 手写英文 | 0.266 | 0.581 | +31.5pp |
| 繁体中文 | 0.410 | 0.747 | +33.8pp |
| 旋转文本检测 | 0.366 | 0.800 | +43.4pp |
| 日文 | 0.462 | 0.737 | +27.5pp |

v5 新能力: 单模型统一简中/繁中/拼音/英/日，手写和旋转文本从不可用到可用。
CPU 上 server 模型反而比 v4 快 20%。0.07B 参数超越 GPT-4o、Gemini 2.5 Pro 的 OCR 分数。

### 模型体积变化

| 组件 | v4 | v5 server | v5 mobile |
|------|-----|-----------|-----------|
| det | 3MB | 88MB | 4.7MB |
| cls | 2MB | 6.5MB (PP-LCNet) | 0.96MB |
| rec | 11MB | 84.5MB | 16.5MB |
| 合计 | 16MB | **179MB** | 22MB |

选用 **server 模型** — 服务端 179MB 可接受，精度比 mobile 高 ~4pp。

### 升级方案 — 路径 A 已验证通过

换用 `rapidocr` v3.7.0 新统一包，替代旧 `rapidocr-onnxruntime`。

**验证结果 (2026-03-09):**
- `rapidocr` 3.7.0 在 Python 3.13 上安装和运行正常
- 与 `onnxruntime-gpu` 共存无冲突
- 模型首次运行时自动从 ModelScope 下载到包内 `models/` 目录
- v5 没有独立 cls 模型配置，cls 保持 v4 默认即可（`ch_ppocr_mobile_v2.0_cls_infer.onnx`）

**配置方式:**
```python
from rapidocr import RapidOCR
from rapidocr.utils.typings import OCRVersion, ModelType

engine = RapidOCR(params={
    'Det.ocr_version': OCRVersion('PP-OCRv5'),
    'Det.model_type': ModelType('server'),
    'Rec.ocr_version': OCRVersion('PP-OCRv5'),
    'Rec.model_type': ModelType('server'),
    # Cls 保持默认 v4 mobile (v5 无独立 cls 配置)
})
```

**API 变化 (旧 → 新):**
- 旧: `from rapidocr_onnxruntime import RapidOCR`
- 新: `from rapidocr import RapidOCR`
- 旧: `result, elapsed = engine(image)` → result 是 `list[tuple[box, text, score]]`
- 新: `result = engine(image)` → `RapidOCROutput` 对象，属性: `.boxes` (ndarray N×4×2), `.txts` (tuple), `.scores` (tuple)
- `__call__` 参数: `use_det`, `use_cls`, `use_rec`, `return_word_box`, `text_score`, `box_thresh`, `unclip_ratio`
- 旧 `det_only=True` → 新 `use_rec=False`

**实测对比 (英文合成图):**
- v4: "Hello World 2025" 拆成两行，"OCR" 误识为 "0CR"
- v5: "Hello World 2025" 正确识别为一行，"OCR" 正确

### 实施步骤

1. `cortex/pyproject.toml` — 替换 `rapidocr-onnxruntime` 为 `rapidocr>=3.7.0`，移除旧 override
2. `cortex/app/engines/rapidocr.py` — 适配新 API:
   - 导入改为 `from rapidocr import RapidOCR`
   - 构造器传 v5 server 配置
   - `run()` 方法适配 `RapidOCROutput` 返回值
   - `det_only` 参数映射为 `use_rec=False`
3. `cortex/scripts/download_models.py` — 移除旧 rapidocr 模型条目（新包自动管理模型）
4. `docs/references/rapidocr.md` — 更新技术文档

### 涉及文件
- `cortex/pyproject.toml` — 更换 OCR 依赖
- `cortex/app/engines/rapidocr.py` — 适配新 API
- `cortex/scripts/download_models.py` — 移除旧模型条目
- `docs/references/rapidocr.md` — 更新技术文档

**工作量**: 0.5 天

---

## 资源影响汇总

| 阶段 | 新增模型 | 新增内存 | 新增依赖 |
|------|---------|---------|---------|
| Phase 1 模型升级 | +163MB (16→179MB) | ~0 | rapidocr v3.x 或手动替换 |
| Phase 2 可搜索 PDF | 无 | ~0 | pymupdf (后端) |
| Phase 3 表格识别 | ~10-30MB | ~100MB | rapid-table (cortex), openpyxl (后端) |
| Phase 4 公式识别 | ~100MB | ~200MB | rapid-latex-ocr (cortex) |
| **合计** | **+~130MB** | **+~300MB** | 4 个库 |

---

## 实施顺序

```
Phase 1 (PP-OCRv5 升级)  ← 最优先，提升基础识别质量
Phase 2 (可搜索 PDF)     ← 零新模型、价值高
Phase 3 (表格 → Excel)   ← 差异化最强的功能
Phase 4 (公式 → LaTeX)   ← 锦上添花，按需决定
```

---

## 不实施项

| 功能 | 原因 |
|------|------|
| PDF 转 Word | 用户期望像素级还原，开源方案做不到，竞品太多 |
| 票据/发票提取 | 格式因国家和票据类型而异，投入产出比极差 |
| 手写体专用模型 | PP-OCRv5 已提升手写支持，差异化不够 |
| VLM-based OCR | 需要 GPU + 大模型 (1B+)，资源开销大 |
| Surya / Marker | GPL 许可 + 商业限制 |

---

## 产品定位调整

升级后 OCR 工具的定位从"图片转文字"变为**"文档智能处理"**:

- 文字识别（现有）— 基础能力
- 可搜索 PDF — 扫描件变可用文档
- 表格提取 — 图片表格变可编辑数据
- 公式识别 — 学术场景刚需

这些功能的共同特点: **输出格式的预期是确定的**，不存在"排版不对"的用户抱怨。
