# Toolii 前端升级方案（基于 frontend-design-spec v0.4）

更新时间：2026-02-27
适用范围：`frontend/` React + Tailwind + shadcn 前端
依据文档：`docs/frontend-design-spec.md`

## 1. 目标与约束

### 1.1 总体目标
- 将当前「功能可用型」前端升级为「规范一致型」前端：视觉、交互、动效、可访问性、i18n、性能均对齐规范。
- 建立可持续演进的设计系统，避免工具页继续分叉实现。
- 在不影响现有后端 API 的前提下，优先完成前端交互重构。

### 1.2 关键成功标准（Definition of Done）
- 规范章节 1~13 在前端均有可追踪实现项。
- 九个核心工具全部对齐其交互模式（A/B/C/D/E）与 run mode（auto/manual/none）。
- 首页导航改为 Home → Tool 两级路径，类别索引页降级为 SEO 辅助页。
- 工具页统一底部 Action Bar + Result Panel（none 模式工具除外）。
- Lighthouse（4G）达到：FCP < 1.5s，LCP < 2.5s，TBT < 200ms。
- 可访问性达到 WCAG AA 基线（焦点可见、语义完整、对比达标、状态可朗读）。

### 1.3 升级约束
- 当前业务逻辑与 API 契约尽量不改；以 UI/交互壳层改造优先。
- 允许短期保留 category index 路由用于 SEO，不再作为主流入口。
- Dark mode 先“可用”，精修放到 Phase 2（规范定义）。

## 2. 现状差距盘点（代码级）

| 模块 | 规范要求 | 当前实现 | 差距等级 |
|---|---|---|---|
| Design Tokens | 品牌色阶 + 分类 pastel + motion token + 字体体系 | `src/index.css` 仅 shadcn 基础 token，无品牌/分类 token、无字体加载 | P0 |
| 字体 | Source Sans 3 + Source Code Pro + CJK fallback | 未接入，CSP 目前 `font-src 'self'` | P0 |
| 首页 | Hero + 按分类直接展示所有工具（直达工具页） | `HomePage` 仅 4 类入口卡片，仍导向 index page | P0 |
| 导航深度 | Home → Tool 两级 | 路由含 image/text category index 主入口 | P1 |
| ToolPageShell | 分类渐变头、布局模式、回退到 Home | 已有壳组件，但无分类主题、默认 backTo 仍是分类页 | P1 |
| Action Bar / Result Panel | 统一底部固定动作区与结果抽屉 | 各工具各自按钮与结果卡，未统一 | P0 |
| Run Mode | auto/manual/none 三类状态机 | 大部分工具是手动按钮模式 | P0 |
| Drag & Drop | 工作区级 drop zone + 统一反馈 | `FileDropzone` 为局部卡片，反馈弱 | P1 |
| Image Compress | 实时 compare slider + 质量预估 | 当前仅普通 before/after 卡片 | P1 |
| Remove BG / Scan / Convert | auto 触发、批量进度、即时反馈 | 当前均为手动点击提交 | P0 |
| Mosaic | Canvas 直编（客户端）+ 工具栏 | 当前服务端处理 + 区域选择组件 | P0 |
| PDF Workspace | 统一工作区（已有）+ 规范化动作区 | 基本方向正确，但与全局 Action Bar 体系未统一 | P1 |
| ID Photo | 画布引导线 + 拖拽缩放 + 合规实时 | 现有流程强，但缺少规范中的画布引导交互核心 | P1 |
| Word Counter | 左编辑右统计实时联动 | 当前单列堆叠，信息密度不足 | P1 |
| 错误体系 | 规范化错误矩阵、就地可恢复 | 目前多为通用错误文案 | P1 |
| i18n 约束 | 文案长度、命名、禁止拼接 | 基本可用，缺少长度守卫与自动检查 | P2 |
| 性能预算 | 有目标且 CI 可验证 | 未建立性能门禁 | P1 |

## 3. 分阶段升级路线

## Phase 0：基线与防回归（2-3 天）
目标：先搭建“可安全重构”的工程护栏。

改造项：
- 梳理工具页统一状态模型：`empty/ready/processing/done/error`。
- 补 UI 快照基线（建议 Playwright）覆盖 Home、9 个工具页关键状态。
- 建立页面级验收清单模板（交互、a11y、性能、i18n）。
- 明确 API 兼容矩阵（哪些工具可前端预览、哪些必须后端结果）。

交付物：
- `docs/frontend-upgrade-checklist.md`
- `frontend/tests/e2e/*`（关键流程快照）

验收标准：
- 任一工具页核心流程改动后可自动回归。

## Phase 1：设计系统底座（4-5 天）
目标：一次性补齐 token、字体、动效、语义色，减少后续重复改造。

改造项：
- 在 `src/index.css` 扩展 token：
  - 灰阶、brand-50~900、accent-brand 语义别名。
  - 分类色 `--cat-image/pdf/text/idphoto*`。
  - motion duration/easing token。
  - semantic light variants（success/warning/info/destructive）。
- 接入字体栈：Source Sans 3 / Source Code Pro / CJK fallback。
- 统一基础控件 token 消费：`button/input/card/badge/tabs/select`。
- 调整 Logo 与链接/focus ring 的 brand accent 使用规则。

涉及文件：
- `frontend/src/index.css`
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/common/Logo.tsx`
- `frontend/index.html`（字体加载方式）

关键风险：
- CSP 当前限制外部字体；需二选一。
- 方案 A：更新 CSP 允许 `fonts.googleapis.com` + `fonts.gstatic.com`。
- 方案 B：自托管 woff2（推荐，稳定且可控）。

验收标准：
- 全站视觉统一切到新 token，无硬编码色值扩散。

## Phase 2：页面骨架与导航重构（3-4 天）
目标：完成规范 7.0 / 7.1 的信息架构与页面结构。

改造项：
- `HomePage` 改为 Hero + 分类分组 + 工具直达卡片。
- Header 保持极简；去掉 tool navigation（包括移动端侧栏中的工具分组入口）。
- RootLayout 支持“工具页无 Footer”模式（给底部 action bar 留位）。
- Tool 页 Back 链接统一回到 `/`（保留 index 页仅作 SEO 兜底）。
- Breadcrumb 统一为 Home > Tool。

涉及文件：
- `frontend/src/pages/Home/HomePage.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/MobileNav.tsx`
- `frontend/src/layouts/RootLayout.tsx`
- `frontend/src/routes/index.tsx`

验收标准：
- 从首页可一跳直达所有工具。
- 工具页不再依赖 category index 才能访问。

## Phase 3：交互基础设施（5-6 天）
目标：先做“公共能力”，再迁移单工具。

改造项：
- 新增统一工具状态机 Hook：`useToolRunState(mode: auto|manual|none)`。
- 新增统一组件：
  - `ToolActionBar`（fixed bottom）
  - `ToolResultPanel`（bottom sheet）
  - `ToolWorkspaceDropzone`（workspace 级 drop）
  - `ToolErrorBanner`（按错误矩阵语义展示）
- FileDropzone 升级为拖拽阶段反馈（enter/over/leave/drop + invalid）。
- 统一 UploadProgress / ProcessingStatus 到 Action Bar 语义。
- 加入 `aria-live` 处理 processing/done/error 状态变化。

涉及文件：
- `frontend/src/components/tools/*`（新增与重构）
- `frontend/src/components/upload/FileDropzone.tsx`
- `frontend/src/hooks/useFileUpload.ts`

验收标准：
- auto/manual/none 三类工具只配置模式即可复用同一底层流程。

## Phase 4：工具页分批迁移（两轮）

### 4A：高收益工具（7-9 天）
目标：优先改造访问量高且规范差距大的工具。

范围与改造重点：
- Compress（Pattern B manual）
  - 引入 compare slider。
  - 质量滑杆实时 client preview + 体积估算。
  - 最终提交再走后端。
- Remove BG（Pattern B variant auto）
  - 上传即处理，移除主提交按钮。
  - 增加透明棋盘背景与背景切换。
- Scan Enhance（Pattern B auto）
  - 上传即增强默认模式。
  - 预设切换触发后台刷新。
- HEIC/Format Convert（Pattern D auto + batch）
  - 批量上传即处理。
  - 文件卡状态流 + 总进度 + ZIP 下载。

涉及文件：
- `frontend/src/pages/ImageTools/CompressPage.tsx`
- `frontend/src/pages/ImageTools/RemoveBgPage.tsx`
- `frontend/src/pages/ImageTools/ScanEnhancePage.tsx`
- `frontend/src/pages/ImageTools/HeicToJpgPage.tsx`
- `frontend/src/pages/ImageTools/ConvertForm.tsx`
- `frontend/src/pages/ImageTools/FormatConvertPage.tsx`

验收标准：
- 工具行为与规范 run mode 100% 一致。

### 4B：复杂工具（8-10 天）
目标：完成规范中“形态差异最大”的三个工具。

范围与改造重点：
- Mosaic（Pattern A none）
  - 从服务端处理迁移到纯前端 Canvas 流程（画刷/矩形/橡皮/undo/redo）。
  - 移除 Action Bar，改悬浮工具栏与内置下载。
- PDF Tools（Pattern C manual）
  - 保留现有统一工作区优势。
  - 对齐全局 Action Bar + Result Panel 风格与状态文案。
  - 强化缩略图删除/旋转动画、插入指示器等微交互。
- ID Photo（Pattern A manual）
  - 引入规范中的合规导引框与拖拽/缩放定位画布。
  - 现有积分与导出链路保留，挂接到新的 workspace 交互层。
- Word Counter（Pattern E none）
  - 改为左编辑右统计面板布局。
  - 数值更新加计数动效。

涉及文件：
- `frontend/src/pages/ImageTools/MosaicPage.tsx`
- `frontend/src/components/tools/RegionSelector.tsx`（可能替换）
- `frontend/src/pages/PdfTools/PdfToolsPage.tsx`
- `frontend/src/components/pdf/*`
- `frontend/src/pages/IdPhoto/IdPhotoPage.tsx`
- `frontend/src/components/idPhoto/*`
- `frontend/src/pages/TextTools/WordCounterPage.tsx`
- `frontend/src/components/textTools/*`

验收标准：
- 4 个复杂工具均达到规范定义的核心交互，不再是“通用表单壳”。

## Phase 5：质量收口（4-5 天）
目标：补齐规范 8/9/10/11，形成长期门禁。

改造项：
- 可访问性专项：
  - icon-only `aria-label` 全量补齐。
  - 键盘可达与 focus ring 覆盖。
  - `prefers-reduced-motion` 降级逻辑校验。
- 错误矩阵落地：
  - 文件过大/格式不支持/上传失败/超时/批量部分失败/鉴权等统一映射。
- i18n 质量门禁：
  - 文案长度 lint（按钮、卡片标题、状态文案）。
  - 禁止字符串拼接规则。
- 性能门禁：
  - Lighthouse CI + bundle size 预算。
  - 首屏关键路由采样与告警。

建议新增：
- `frontend/scripts/check-i18n-length.mjs`
- `frontend/scripts/check-bundle-budget.mjs`
- CI 配置（GitHub Actions 或现有流水线）

验收标准：
- 每次 PR 自动输出 a11y/perf/i18n 报告。

## Phase 6：Dark Mode 精修（Phase 2，3-4 天）
目标：完成规范 open item #1。

改造项：
- 分类 pastel 深色语义映射。
- ToolPageShell 渐变暗色版本。
- 确保文本与交互对比度达标。

验收标准：
- 深色模式不只“可用”，而是视觉一致且可读。

## 4. 里程碑排期（建议）

按 2 周 / Sprint 估算：
- Sprint 1：Phase 0 + Phase 1 + Phase 2
- Sprint 2：Phase 3 + Phase 4A
- Sprint 3：Phase 4B
- Sprint 4：Phase 5 + Phase 6

总周期：约 6-8 周（1 名前端主力 + 1 名辅助；若多人并行可压缩到 4-6 周）。

## 5. 优先级队列（Backlog）

P0（必须先做）：
- Token/字体/CSP 方案
- 首页信息架构改造
- Action Bar + Result Panel 基础设施
- auto/manual/none 状态机
- RemoveBG/Scan/Convert 自动化流程
- Mosaic 客户端化

P1（强烈建议）：
- PDF 与 ID Photo 交互精修
- 错误矩阵与状态语义统一
- 性能预算与 Lighthouse 门禁

P2（收尾优化）：
- 深色模式精修
- 空状态插画资产
- 移动端高级手势细节

## 6. 风险与应对

- 风险：Mosaic 客户端化后设备性能波动。
- 应对：Canvas 分辨率降级策略 + 预览分辨率与导出分辨率分离。

- 风险：ID Photo 新交互影响现有积分付费链路。
- 应对：先引入可视化定位层，不改导出 API 契约；A/B 灰度。

- 风险：字体引入与 CSP 冲突。
- 应对：优先自托管字体，避免在线字体依赖。

- 风险：批量转换并发过高导致后端压力上升。
- 应对：前端并发队列限制（例如 2~3 并发）+ 重试与退避。

## 7. 验收清单（每个工具页）

- 交互模式是否符合 Pattern A/B/C/D/E。
- run mode 是否符合 auto/manual/none。
- 拖拽反馈是否覆盖 enter/leave/drop/invalid。
- 处理状态是否可见且可朗读（aria-live）。
- 错误是否就地展示且可恢复。
- 移动端单手可达（底部 action 区触控友好）。
- Lighthouse 与 Web Vitals 是否达标。

## 8. 建议先行实施顺序（最小风险路径）

1. 先做 Phase 1（token）+ Phase 3（交互底座），只改公共层。
2. 再迁移 4A（Compress/RemoveBG/Scan/Convert），快速验证新架构。
3. 最后处理 4B（Mosaic/PDF/IDPhoto/WordCounter），避免一次性大爆炸改动。
4. 全部完成后做 Phase 5/6 收口，确保长期可维护。

