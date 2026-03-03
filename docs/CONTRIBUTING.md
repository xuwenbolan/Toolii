# Documentation Management

Rules for maintaining project documentation.

## Document Types

| Type | Directory | Purpose | Lifecycle |
|------|-----------|---------|-----------|
| Spec | `docs/spec/` | Define what to build and how | Long-term, evolves with product |
| Reference | `docs/references/` | External knowledge, research data | Long-term, update when source changes |
| Plan | `.claude/plans/` | One-time implementation strategy | Short-term, archive on completion |

## Spec Files

### Metadata Header

Every spec file must have a status line immediately after the title:

```markdown
# Module Name

Status: draft | Updated: 2026-03-03
```

Three status values:
- **draft** — Under discussion, content may change significantly
- **final** — Approved for implementation, changes require deliberation
- **outdated** — Implementation has diverged, spec needs update

### Rules

- Update the date whenever content changes
- Spec describes the **target state**, not history
- Do not accumulate "done" markers or changelogs in spec files — use git history
- When implementation diverges from spec, mark status as `outdated` first, then decide whether to update spec or fix code
- New/deleted spec files must be reflected in `docs/spec/README.md` index

### Naming

- Lowercase, hyphen-separated: `credits-system.md`, `cortex-api.md`
- Name by module or concern, not by number (avoids reordering pain)

## Reference Files

### Required Content

- Source URL (GitHub repo, paper, official docs)
- Key data (model size, accuracy, license)
- Date of research

### Not Allowed

- Implementation decisions (those belong in spec)
- Subjective recommendations (unless clearly labeled)

References are raw materials. Specs are blueprints.

### Naming

Same convention as spec. For model references, use the model name: `birefnet.md`, `gfpgan.md`.

## Plan Files

### Purpose

Plans describe how to get from A to B — migration strategies, refactoring steps, implementation sequences. They are consumed once, then archived.

### Naming

`{topic}-{action}.md` — e.g., `cortex-onnx-migration.md`, `frontend-phase1-upgrade.md`

### Lifecycle

1. Create in `.claude/plans/`
2. Execute the plan
3. Extract any lasting decisions into the relevant spec file
4. Move completed plan to `.claude/plans/archive/`

### Archive

Completed plans live in `.claude/plans/archive/`. They are kept for historical reference but are not actively maintained.

## Index

`docs/spec/README.md` is the single entry point for all documentation:
- Lists all spec files grouped by category
- Links to reference files at the bottom
- Must stay in sync with actual files

## Cross-References

- Spec-to-spec: use relative links `[architecture](architecture.md)`
- Spec-to-reference: use `[birefnet](../references/birefnet.md)`
- Avoid circular dependencies — if two specs reference each other, one should be the "owner"
