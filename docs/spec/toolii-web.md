# toolii-web Module Spec

Status: draft | Updated: 2026-03-03

## Role

Static SPA serving + reverse proxy. No business logic.

## Tech Stack

| Item | Value |
|------|-------|
| Framework | React 18 + TypeScript + Vite |
| UI | TailwindCSS + shadcn/ui |
| Serving | nginx:1.27-alpine |
| Port | 8001 (external) |

## Ownership

### Web OWNS

- Serve frontend static assets (JS/CSS/images)
- Reverse proxy `/api/*` requests to backend (port 8000)
- Client-side routing (SPA fallback to index.html)
- CSP headers and static security headers

### Web does NOT own

- Any business logic or data processing
- Direct communication with Cortex
- User auth verification (delegates to backend API)
- File storage or database access

## Nginx Proxy Rules

```
/api/*     -> http://backend:8000
/*         -> static files (SPA fallback)
```

## Design Specs

See [frontend-design.md](frontend-design.md) for visual identity and interaction patterns.
See [frontend-upgrade.md](frontend-upgrade.md) for upgrade roadmap.
