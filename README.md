# Toolii（在线工具平台）

聚焦证件照、图片处理、PDF 处理的在线工具平台（支持移动端与桌面端）。

## 前端（pnpm）

```bash
cd frontend
pnpm install
pnpm dev
```

其他常用命令：

```bash
pnpm build
pnpm preview
pnpm lint
```

如果安装时提示 `Ignored build scripts: esbuild`，运行 `pnpm approve-builds` 并勾选 `esbuild`。

## 后端（uv + Python 3.13）

```bash
cd backend
uv sync --extra dev --extra processing
uv run uvicorn app.main:app --reload --port 8000
```

首次启动前建议复制环境变量：

```bash
cp .env.example .env
```

如果需要 Google 登录：
- 后端：在根目录 `.env` 填 `GOOGLE_OAUTH_CLIENT_ID`
- 前端：在 `frontend/.env` 填 `VITE_GOOGLE_CLIENT_ID`（可从 `frontend/.env.example` 复制）

如果需要启用统计与规范化 SEO 链接：
- 前端：在 `frontend/.env` 填 `VITE_GA_MEASUREMENT_ID`（仅在用户同意 Cookie 后加载）
- 前端：可选填 `VITE_SITE_URL`（用于 canonical/OG URL）
