# Cortex 能力暴露实施计划

Status: final | Updated: 2026-03-05 | Phase 1+2+3 all done

## 背景

Cortex 9 个引擎 / 20 个 ONNX 模型有大量能力未暴露给用户。
详细分析见 `docs/references/cortex-capability-audit.md`。

**当前架构优势**：后端 `cortex_client.call()` 使用 `**params` 透传，
`image_service._gpu_process()` 也直接转发 kwargs。大部分改动只需：
1. 后端 router 加 Form 参数（已有的直接用）
2. 前端页面加 UI 控件 + 传参

---

## Phase 1: 零成本 — 前端暴露已透传参数

后端已接受并透传，只需前端改动。

### 1.1 降噪页面加「去模糊」模式切换
- **文件**: `frontend/src/pages/ImageTools/DenoisePage.tsx`
- **改动**: 加 ToggleGroup 切换 `task: "denoise" | "deblur"`，传给 API
- **UI**: 两个模式按钮（降噪 / 去模糊），切换时更新描述文案
- **翻译**: `tools.json` 加 deblur 相关文案
- **工作量**: 小

### 1.2 背景去除加模型选择
- **文件**: `frontend/src/pages/ImageTools/RemoveBgPage.tsx`
- **改动**: 加下拉选择 `model: "general" | "portrait" | "matting"`
  - general: 通用（默认）
  - portrait: 人像优化（头发丝更细腻）
  - matting: 精细抠图（半透明边缘）
  - lite 不暴露（内部性能优化）
- **后端**: router 已有 `model` 参数，无需改动
- **工作量**: 小

### 1.3 放大页面加模型选择
- **文件**: `frontend/src/pages/ImageTools/UpscalePage.tsx`
- **改动**: 加下拉选择 `model: "x4plus" | "anime"`
  - x4plus: 照片（默认）
  - anime: 动漫/插画
- **后端**: router 已有 `model` 参数，无需改动
- **工作量**: 小

### 1.4 上色页面加风格选择
- **文件**: `frontend/src/pages/ImageTools/ColorizePage.tsx`
- **改动**: 加 ToggleGroup 选择 `model: "artistic" | "modelscope"`
  - artistic: 艺术风格（偏鲜艳，默认）
  - modelscope: 写实风格（偏自然）
- **后端**: router 已有 `model` 参数，无需改动
- **工作量**: 小

---

## Phase 2: 小改动 — 后端加参数 + 前端暴露

后端需要加 Form 参数，但 cortex_client 自动透传，改动很小。

### 2.1 人脸修复加放大倍数选择
- **后端**: `routers/image.py` restore-face 端点加 `upscale: int = Form(2)` 参数
- **前端**: `RestoreFacePage.tsx` 加 ToggleGroup `upscale: 1 | 2`
  - 1x: 只修复不放大
  - 2x: 修复并放大（默认）
- **工作量**: 小

### 2.2 放大页面加降噪强度（x4v3 模型专属）
- **后端**: `routers/image.py` upscale 端点加 `denoise_strength: float = Form(None)` 参数
- **前端**: 当用户选择 x4v3 模型时，显示降噪强度滑块 (0-1)
  - 需要先在 Phase 1.3 加模型选择，再在此基础上加条件 UI
- **工作量**: 小

### 2.3 放大页面加人脸增强开关
- **后端**: `routers/image.py` upscale 端点加 `face_enhance: bool = Form(False)` 参数
- **前端**: `UpscalePage.tsx` 加 Switch 开关「自动修复人脸」
- **工作量**: 小

---

## Phase 3: 产品级功能 — 需要设计和测试

### 3.1 去模糊独立工具页（可选）
- 如果 Phase 1.1 的模式切换效果好，可以考虑将去模糊拆为独立工具页
- 需要：新路由、新页面、工具列表注册、翻译
- **决策点**: 看 Phase 1.1 上线后用户反馈

### 3.2 证件照流程集成 portrait 模型
- `photo_service.py` 中背景去除调用改为自动使用 `model="portrait"`
- 提升证件照边缘质量（头发丝），无需用户选择
- **工作量**: 极小（一行代码），但需要视觉质量验证

### 3.3 降噪页面加模型宽度选择（高级选项）
- 暴露 `model_width: 32 | 64`，32 更快但质量略低
- 作为「高级选项」折叠面板，不影响默认体验
- **优先级低**: 大部分用户不需要

---

## 不实施项

| 能力 | 原因 |
|------|------|
| tile_size | 内部性能参数，用户无法理解 |
| SAM mask_input_b64 | 需要复杂迭代 UI，投入产出比低 |
| BiRefNet threshold | 对大部分用户无意义 |
| OCR det_only / box_thresh | 面向开发者，与产品定位不符 |
| birefnet-lite | 性能优化变体，不影响用户体验 |
| GFPGAN aligned / only_center_face | 边缘场景，复杂度高 |

---

## 实施顺序建议

```
Phase 1 (纯前端，可并行):
  1.1 去模糊模式  ──┐
  1.2 背景去除模型 ──┼── 可同时开发
  1.3 放大模型选择 ──┤
  1.4 上色风格选择 ──┘

Phase 2 (前后端联动):
  2.1 人脸修复放大  ──┐
  2.2 放大降噪强度  ──┼── 依赖 Phase 1.3
  2.3 放大人脸增强  ──┘

Phase 3 (产品决策):
  3.1 去模糊独立页  ── 依赖 Phase 1.1 反馈
  3.2 证件照 portrait ── 独立
  3.3 降噪模型宽度  ── 独立，低优先级
```

## 涉及文件清单

### 后端
- `backend/app/routers/image.py` — Phase 2 加参数
- `backend/app/services/photo_service.py` — Phase 3.2

### 前端
- `frontend/src/pages/ImageTools/DenoisePage.tsx` — Phase 1.1
- `frontend/src/pages/ImageTools/RemoveBgPage.tsx` — Phase 1.2
- `frontend/src/pages/ImageTools/UpscalePage.tsx` — Phase 1.3, 2.2, 2.3
- `frontend/src/pages/ImageTools/ColorizePage.tsx` — Phase 1.4
- `frontend/src/pages/ImageTools/RestoreFacePage.tsx` — Phase 2.1
- `frontend/src/services/imageApi.ts` — 各 API 调用加参数
- `frontend/public/locales/en/tools.json` — 翻译
- `frontend/public/locales/zh-CN/tools.json` — 翻译
