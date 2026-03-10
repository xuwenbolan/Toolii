## Claude Code Usage Rules

**Language and Style:**
- Communicate with user in Chinese by default
- Code comments must be in English
- Do not use emoji characters in code

**Git Commits:**
- Do not add auto-generated signatures like "Generated with Claude Code"
- Do not include Co-Authored-By lines

**Project Stack:**
- Python 3.13 + uv for package management
- Frontend uses pnpm for package management
- All development and testing runs locally (not in Docker)

**Development Philosophy:**
- Currently in development phase — all discovered issues must be traced to root cause
- Fix problems at the root cause, not with workarounds
- No over-engineering or premature optimization
- No backward compatibility with old code/features, no legacy data migration, no patches
- Keep code concise — fix historical issues directly instead of adding patch code on top

**Docker Restrictions:**
- **DO NOT** execute docker build/restart/modify commands - prompt the user to run these manually
- **CAN** execute: `docker logs`, `docker compose logs`, `docker ps`, `docker inspect`
- **DO NOT** debug or run programs inside Docker containers - always use local environment for development and testing
- Docker is for production deployment only

**Frontend Rules:**
- All frontend code MUST follow `docs/spec/frontend-design.md` — read it before making UI changes
- Use shadcn/ui (new-york) components only — do not introduce other component libraries
- Use `variant`/`size` props, not ad-hoc className overrides on shadcn primitives
- Extend by wrapping — do not modify `ui/` source files
- Use lucide-react icons only — no other icon libraries
- All colors via CSS variables (oklch) — never hard-code color values in components
- All user-facing text via i18next — no hard-coded strings
- i18n: no string concatenation — use full sentence keys with interpolation
- i18n: key pattern `{feature}.{component}.{element}`, fallback chain zh-CN → en
- Follow the interaction pattern assigned to each tool (Section 3)

**Documentation:**
- Specs live in `docs/spec/` — each file has `Status: draft|final|outdated | Updated: YYYY-MM-DD` after the title
- Reference data lives in `docs/references/`
- Plans live in `.claude/plans/`, move to `.claude/plans/archive/` when completed
- `docs/spec/README.md` is the index — keep it in sync when adding/removing spec files
- See `docs/CONTRIBUTING.md` for full documentation management rules
