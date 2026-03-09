# Cortex Dashboard Enhancement

Status: draft | Updated: 2026-03-09

Cortex 系统状态页 (AdminSystemPage) 的可视化增强与管理功能扩展。

Design constraints: follows [frontend-design.md](frontend-design.md) — monochrome foundation, semantic colors only (`--success`/`--warning`/`--destructive`/`--info`), shadcn/ui (new-york) components, lucide-react icons, oklch color tokens.

## Current State

现有页面 (`frontend/src/pages/Admin/AdminSystemPage.tsx`) 包含：

- 连接状态指示 + 运行时间
- 4 张概览卡片（GPU 信息、VRAM 用量、模型预算、推理队列）
- SVG 手绘 VRAM 时间线图表（area fill + 悬浮交互）
- 模型注册表（DataTable，含单模型/全量健康检查）
- 推理统计表（按端点显示延迟和错误数）
- 模型事件日志（加载/驱逐/OOM，可折叠）
- 共享显存警告
- 全局操作：Unload All、Refresh

数据源：30s 轮询 `fetchCortexStatus()` + 按需加载 Timeline

Cortex 端现状：
- 所有 engine 的所有 variant 在启动时全量注册到 ModelManager
- 无 per-model enable/disable 机制
- LRU eviction 有 `required` 优先保护，但无法阻止非 required 模型被请求
- 全局配置：`idle_evict_minutes`、`max_concurrent`、`vram_budget_mb`，无 per-model 覆盖

## Enhancement Areas

### 1. GPU Overview Cards Upgrade

**目标**：将纯数字展示升级为直观的可视化组件。

#### 1a. GPU Vitals Ring Gauges

将 GPU 利用率、显存利用率、温度三个指标改为环形仪表盘，现有 4 张卡片合并为 3 张。

```
┌─ GPU ─────────────────────────────┐
│  ┌──┐   ┌──┐   ┌──┐              │
│  │45│%  │34│%  │62│°C             │
│  └──┘   └──┘   └──┘              │
│  GPU    Mem    Temp    180W       │
│  RTX 4070 Ti · Driver 550 · CUDA 12.4  │
└───────────────────────────────────┘
```

实现要点：
- 纯 SVG 环形进度条 `<circle>` with `stroke-dashoffset`，三个并排
- 环形颜色使用 semantic tokens（不使用自定义色值）：
  - Normal: `--foreground` at 70% opacity (monochrome)
  - Warning: `--warning` (>70% utilization, >65°C)
  - Critical: `--destructive` (>90% utilization, >80°C)
- 功耗显示为 `text-muted-foreground` 文本
- 使用 shadcn `Card` / `CardContent`

#### 1b. VRAM Stacked Bar

将 VRAM 卡片的单色进度条改为分段条，合并原 "Model Budget" 卡片：

```
┌─ VRAM ────────────────────────────┐
│  8.2 GB / 12 GB                   │
│  ████████░░░░░░░░░░░░░░░░  34%    │
│  ■ Models 2.5G  ■ Other 5.7G     │
│  Budget: 2.5 / 9.2 GB (27%)      │
└───────────────────────────────────┘
```

- 分段色值遵循 monochrome 原则：
  - Models: `--foreground` (实心黑/白)
  - Other (CUDA context): `--muted-foreground` at 50%
  - Free: `--muted` (空白区)
- Budget 信息作为 `text-xs text-muted-foreground` 副行
- 图例用 inline `<span>` with small filled square，不用额外图标

#### 1c. Queue Live Indicator

```
┌─ Queue ───────────────────────────┐
│  0 / 2 active    timeout: 30s     │
│  ○ ○                              │
│  idle                             │
└───────────────────────────────────┘
```

- 圆点数 = `max_concurrent`，用 SVG `<circle>`
- 状态映射：
  - idle (0 active): `--muted-foreground` 空心圆 + "idle" text
  - processing (1+ active): `--foreground` 实心圆 + subtle CSS pulse animation
  - saturated (all full): `--destructive` 实心圆 + "saturated" badge
- Pulse animation respects `prefers-reduced-motion`

### 2. VRAM Timeline Enhancement

#### 2a. Multi-Layer Chart

在现有 VRAM 曲线基础上叠加 System RAM 曲线：

- VRAM: `--foreground` 实线 + 10% opacity area fill（保持 monochrome）
- RAM: `--muted-foreground` 虚线 `stroke-dasharray="4 3"`，无 fill
- 两条线共享 X 轴（时间），各自独立 Y 轴（VRAM 左侧，RAM 右侧）
- 图例在图表右上角：`— VRAM  --- RAM`

注意：当前 `--chart-palette-*` tokens 用于图表线条，保持使用。

#### 2b. Event Annotation Lines

将事件标记从圆点升级为垂直标注线：

```
         load:birefnet    evict:nafnet
              │                │
  ────────────┼────────────────┼──────── VRAM line
              │                │
```

- `loaded`: `--success` 竖线
- `evicted_*`: `--warning` 竖线
- `oom_retry`: `--destructive` 竖线
- 悬浮时显示事件详情（复用现有 tooltip 机制）
- 线宽 1px，`stroke-opacity: 0.6`

#### 2c. Time Range Selector

在 CardHeader 区域增加按钮组（shadcn `Button` variant="outline" size="sm"）：

- **5m** (default, last=300) | **15m** (last=900) | **1h** (last=3600)
- Active 按钮使用 variant="default"，其余 variant="outline"
- 切换时 `queryClient.invalidateQueries` 重新 fetch

#### 2d. Always-On Timeline

- 移除 `timelineExpanded` state 和展开/折叠按钮
- Timeline 在 Cortex online 时始终渲染
- `useQuery` 的 `enabled` 条件从 `online && timelineExpanded` 改为 `online`

### 3. Model Management

#### 3a. Single Model Unload

当前只有 "Unload All"，增加对单个模型的卸载能力。

**Cortex 端** — `model_manager.py` 已有 `unload(model_name)` 方法，只需暴露 endpoint：

```
POST /admin/unload/{model_name}
Response: {"status": "ok", "model": "birefnet-general", "vram_freed_mb": 800}
Error:    {"error": {"code": "MODEL_NOT_LOADED", "message": "..."}}
```

**Backend proxy**:
```python
# backend/app/routers/admin/system.py
@router.post("/cortex/models/{model_name}/unload")

# backend/app/services/cortex_client.py
async def unload_model(model_name: str) -> dict[str, Any]
```

**Frontend**:
```typescript
// adminApi.ts
export async function unloadCortexModel(modelName: string)
```

**UI**：模型表格 actions 列，已加载模型增加 "Unload" 按钮（`Button` variant="outline" size="sm"），点击后弹出 `AlertDialog` 确认 → 执行 → 刷新。

#### 3b. Model Enable/Disable

运行时控制单个模型是否可被推理请求使用。禁用的模型不会被加载，已加载的会被卸载。

**Cortex 端改动**：

1. `ModelInfo` 新增 `enabled: bool = True` 字段

2. `OnnxModelManager` 改动：
   - `enable(model_name)` / `disable(model_name)` 方法
   - `disable()` 内部调用 `unload()` 释放已加载的 session
   - `get_session()` 检查 `enabled`，disabled 时 raise `ModelDisabledError`
   - 状态持久化到 `{model_dir}/model_state.json`（重启后恢复）

3. 新增 endpoints：
   ```
   POST /admin/models/{model_name}/enable
   Response: {"status": "ok", "model": "birefnet-portrait", "enabled": true}

   POST /admin/models/{model_name}/disable
   Response: {"status": "ok", "model": "birefnet-portrait", "enabled": false, "vram_freed_mb": 800}
   ```

4. `/models` 响应中每个 model item 新增 `enabled` 字段

5. 新增错误码：
   ```
   MODEL_DISABLED  400  "Model 'xxx' is disabled by admin"
   ```

**Backend proxy**:
```python
# backend/app/routers/admin/system.py
@router.post("/cortex/models/{model_name}/enable")
@router.post("/cortex/models/{model_name}/disable")

# backend/app/services/cortex_client.py
async def enable_model(model_name: str) -> dict[str, Any]
async def disable_model(model_name: str) -> dict[str, Any]
```

**Frontend types**:
```typescript
// CortexModelItem 新增
enabled: boolean

// adminApi.ts 新增
export async function enableCortexModel(modelName: string)
export async function disableCortexModel(modelName: string)
```

**UI** — 模型表格新增 enabled 列：
- shadcn `Switch` 组件，inline toggle
- 切换时弹 `AlertDialog` 确认（禁用操作会卸载模型并拒绝后续请求）
- disabled 模型行使用 `opacity-50` 视觉降级
- Status 列：disabled 状态新增 `StatusBadge`（`--muted-foreground` 灰色底）

**约束**：
- `required: true` 的模型不可禁用（Switch disabled + tooltip "Required model cannot be disabled"）
- 状态持久化：Cortex 重启后从 `model_state.json` 恢复 enabled/disabled 状态

#### 3c. Model Detail Panel

点击模型名称展开行内详情（shadcn `Collapsible` 或自定义 `<tr>` expand）：

```
┌─ birefnet-general ──────────────────────────────────┐
│ Status: loaded   Required: yes   Enabled: yes       │
│ VRAM: 800 MB     Delta: 780 MB   Workspace: 800 MB  │
│ File: 650.2 MB   Load time: 1500ms                  │
│ Loaded: 2h ago   Idle: 5m   Inferences: 42          │
│                                                      │
│ ONNX Info:                                           │
│   Inputs:  input [1, 3, 1024, 1024] float            │
│   Outputs: output [1, 1, 1024, 1024] float           │
│   Providers: CUDAExecutionProvider, CPUExecutionProvider │
│                                                      │
│ [ Check ]  [ Unload ]                                │
└──────────────────────────────────────────────────────┘
```

- ONNX Info 按需加载（点击 "Check" 或展开时调用 `/models/{name}/check`）
- 使用 `text-sm` 和 `font-mono` for technical values
- Expand/collapse 使用 `ChevronDown` / `ChevronUp` icon (lucide)

### 4. Cortex Runtime Configuration

从前端调整 Cortex 全局运行参数，无需重启服务。

**Cortex 端改动**：

新增 endpoint：
```
GET /admin/config
Response: {
  "vram_budget_mb": 9216,
  "idle_evict_minutes": 30,
  "max_concurrent": 2,
  "inference_timeout": 120.0,
  "warmup": false
}

PATCH /admin/config
Request:  {"idle_evict_minutes": 60}
Response: {"status": "ok", "config": {...updated...}}
```

可调参数（runtime safe）：

| Parameter | Type | Description | Constraint |
|-----------|------|-------------|------------|
| `idle_evict_minutes` | int | Idle model eviction threshold | >= 5 |
| `max_concurrent` | int | GPU concurrency slots | 1~8 |
| `inference_timeout` | float | Per-inference timeout (seconds) | 10~600 |

**不可运行时调整**（需要重启）：
- `vram_budget_mb` — 涉及 eviction 策略全局重算
- `warmup` — 启动时行为

**Frontend UI** — 在页面顶部 header 区域增加 "Settings" 按钮，打开 `Sheet` (shadcn) 侧边栏：

```
┌─ Cortex Settings ────────────────┐
│                                   │
│  Idle Eviction                    │
│  ┌──────────────────────────┐    │
│  │ 30 minutes               │    │
│  └──────────────────────────┘    │
│  Models idle beyond this are      │
│  automatically unloaded.          │
│                                   │
│  Max Concurrent Inferences        │
│  ┌──────────────────────────┐    │
│  │ 2                        │    │
│  └──────────────────────────┘    │
│  GPU inference slots. Higher =    │
│  more throughput, more VRAM.      │
│                                   │
│  Inference Timeout                │
│  ┌──────────────────────────┐    │
│  │ 120 seconds              │    │
│  └──────────────────────────┘    │
│                                   │
│           [ Save ]                │
└───────────────────────────────────┘
```

- 使用 shadcn `Input` (type="number") + label + description text
- Save 调用 `PATCH /admin/config`，成功后 toast
- Read-only 展示 `vram_budget_mb`（标注 "requires restart"）

### 5. Inference Statistics Enhancement

#### 5a. Error Rate Highlight

- errors > 0 时显示错误率百分比：`errors / calls * 100`
- 错误率 > 5%: `text-warning`
- 错误率 > 20%: `text-destructive`
- 在 Errors 列显示 `{count} ({rate}%)`

#### 5b. Latency Range

- Avg Latency 列改为 `{avg}ms ({min}~{max})`
- 使用 `text-muted-foreground` for min~max range

### 6. Monitoring & Alerts

#### 6a. Alert Bar

在连接状态下方显示异常告警条。

告警规则（纯前端计算）：

| Condition | Level | Icon (lucide) |
|-----------|-------|---------------|
| `temperature_c >= 80` | warning | `Thermometer` |
| `temperature_c >= 90` | critical | `Thermometer` |
| `vram_utilization >= 0.90` | warning | `HardDrive` |
| Model status `missing` + `required` | critical | `AlertTriangle` |
| `oom_retry` in recent events | warning | `AlertTriangle` |
| Queue `active == max_concurrent` | info | `Clock` |
| Disabled models count > 0 | info | `CircleSlash` |

视觉设计（遵循 frontend-design.md 8.2 Error Visual Design）：
- info: `--info-light` bg, `--info` border at 20%, `--info` icon
- warning: `--warning-light` bg, `--warning` border at 20%, `--warning` icon
- critical: `--destructive-light` bg, `--destructive` border at 20%, `--destructive` icon
- 每条告警一行，可用 `X` icon 关闭（session 内 dismiss）
- 无告警时不渲染（不留空占位）

### 7. Polling & UX

#### 7a. Adaptive Polling

- 默认 30s（保持不变）
- Header 区域增加 "Live" toggle（shadcn `Button` variant="outline" size="sm"）
- Live on: 5s 轮询 + 按钮旁显示 pulsing dot (`--success` 绿色小圆点)
- 1 分钟无交互自动回退 30s（`document` `mousemove`/`keydown` 监听）
- Live 模式下 Timeline 也同步 5s 刷新

#### 7b. Operation Confirmations

所有 destructive 操作使用 shadcn `AlertDialog`：

- Unload All: "This will unload all models. Subsequent inference requests will need to reload them."
- Unload Single: "This will unload {model}. It will be reloaded on next request."
- Disable Model: "This will disable {model} and unload it. Inference requests for this model will be rejected until re-enabled."

Button styling: Cancel = variant="outline", Confirm = variant="destructive"

#### 7c. Event Log Filters

- 按事件类型筛选：shadcn `Select` with options: All / loaded / evicted / oom_retry
- 按模型名称搜索：shadcn `Input` with `Search` icon (lucide)
- 事件日志默认展开（移除 `eventsExpanded` 初始值 `false`）

### 8. Layout Restructure

重新组织页面，合并 4 张卡片为 3 张，按运维优先级排列：

```
1. Header (title + Live toggle + Settings + Unload All + Refresh)
2. Connection Status + Alert Bar
3. GPU Overview: 3 cards (GPU Vitals | VRAM Stacked | Queue)
4. VRAM Timeline (always visible, with time range selector)
5. Inference Statistics (with error rate)
6. Model Registry (with enable/disable, detail panel, unload)
7. Model Events (filterable, default expanded)
```

Grid: `grid-cols-1 md:grid-cols-3` (从 4 列改为 3 列)

## Implementation Priority

| Priority | Item | Scope | New API |
|----------|------|-------|---------|
| P0 | 3b. Model enable/disable | Full stack | Yes |
| P0 | 3a. Single model unload | Full stack | Yes |
| P0 | 6a. Alert bar | Frontend only | No |
| P0 | 7b. Operation confirmations | Frontend only | No |
| P1 | 1a. Ring gauges | Frontend only | No |
| P1 | 1b. VRAM stacked bar | Frontend only | No |
| P1 | 2d. Always-on timeline | Frontend only | No |
| P1 | 2c. Time range selector | Frontend only | No |
| P1 | 8. Layout restructure | Frontend only | No |
| P1 | 5a/5b. Error rate + latency range | Frontend only | No |
| P2 | 4. Runtime configuration | Full stack | Yes |
| P2 | 1c. Queue live indicator | Frontend only | No |
| P2 | 2a. Multi-layer chart (RAM) | Frontend only | No |
| P2 | 2b. Event annotation lines | Frontend only | No |
| P2 | 3c. Model detail panel | Frontend only | No |
| P2 | 7c. Event log filters | Frontend only | No |
| P3 | 7a. Adaptive polling | Frontend only | No |

## Files to Modify

**Cortex** (3a, 3b, 4):
- `cortex/app/model_manager.py` — Add `enabled` field, `enable()`/`disable()`, state persistence
- `cortex/app/main.py` — Add unload/enable/disable/config endpoints
- `cortex/app/config.py` — Mark runtime-mutable fields

**Backend** (3a, 3b, 4):
- `backend/app/services/cortex_client.py` — Add `unload_model()`, `enable_model()`, `disable_model()`, `get_config()`, `update_config()`
- `backend/app/routers/admin/system.py` — Add proxy endpoints

**Frontend**:
- `frontend/src/pages/Admin/AdminSystemPage.tsx` — Main page refactor
- `frontend/src/services/adminApi.ts` — New API functions + types
- `frontend/public/locales/en/console.json` — New i18n keys
- `frontend/public/locales/zh-CN/console.json` — New i18n keys

## Non-Goals

- **不做** per-model idle eviction timeout override（全局配置够用，per-model 增加理解成本）
- **不做** 模型预加载/warmup 前端控制（启动时行为，不需要运行时调整）
- **不做** 后端独立告警服务（前端从轮询数据计算足够）
- **不做** 推理延迟历史趋势图 / sparkline（需要 Cortex 持久化统计，架构改动大）
- **不做** per-model VRAM budget limit（全局 budget + LRU 已足够）
