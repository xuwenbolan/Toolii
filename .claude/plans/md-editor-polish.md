# Markdown Editor Polish Plan

Status: active | Created: 2026-03-09

Addresses all issues identified in the editor evaluation: rendering consistency, UI/UX gaps, missing spec components, and Typora-style refinements.

---

## Decision Summary

| Question | Decision |
|----------|----------|
| Preview renderer | Milkdown readonly mode (replace react-markdown) |
| Toolbar | Skip fixed toolbar, use Crepe built-in slash menu + floating toolbar |
| Outline sidebar | Include in this round |
| Header layout | Keep single-line header, move status to bottom status bar |

---

## Phase 1: Bottom Status Bar + Header Cleanup

**Goal:** Move status/metadata out of header into a persistent bottom bar. Header becomes navigation-only.

### 1.1 Create `EditorStatusBar` component

Location: `frontend/src/components/editor/EditorStatusBar.tsx`

Bottom-fixed bar (h-8, ~32px), shows:
- **Left:** save status indicator (dot + text: Saved / Unsaved / Saving... / Save failed)
- **Center:** word count + character count (live-computed from content)
- **Right:** content size (e.g., "12.3 KB / 1 MB"), oversize/approaching-limit warning

Design:
- `border-t border-border/40 bg-background/80 backdrop-blur-sm`
- Text: `text-xs text-muted-foreground`
- Status dot: green (saved), amber (unsaved/saving), red (error)
- Hidden in print (`print:hidden`)

### 1.2 Refactor `DocEditorPage` header

Remove from header:
- Save status chip (`saveStatusLabel` / `saveStatusColor`)
- Size warning (`sizeWarning`)

Keep in header:
- Back button
- File name (click to rename)
- Save button (keep, but move to right)
- Export .md button (icon-only, visible on desktop)
- Print/PDF button (icon-only, visible on desktop)
- More menu (only Reload left inside)

Header stays `h-11` single line. Buttons use icon-only style on mobile, icon+label on desktop.

### 1.3 Word count utility

Add `countWords(text: string): { words: number; chars: number; charsNoSpace: number }` to a shared util.
- Words: split by whitespace, CJK chars each count as 1 word
- Chars: string length
- CharsNoSpace: exclude whitespace

### Files changed:
- NEW `frontend/src/components/editor/EditorStatusBar.tsx`
- NEW `frontend/src/lib/wordCount.ts`
- EDIT `frontend/src/pages/Docs/DocEditorPage.tsx`
- EDIT `frontend/public/locales/en/docs.json` (add word/char count keys)
- EDIT `frontend/public/locales/zh-CN/docs.json`

---

## Phase 2: Milkdown Readonly Preview (Replace react-markdown)

**Goal:** Unify rendering — both editor and preview use Milkdown, ensuring identical output.

### 2.1 Create `MilkdownPreview` component

Location: `frontend/src/components/editor/MilkdownPreview.tsx`

Props:
- `content: string` — Markdown text
- `className?: string`

Implementation:
- Reuse Milkdown Crepe with same config as `TyporaEditor`
- Call `crepe.setReadonly(true)` after creation
- Disable `Placeholder`, `BlockEdit`, `Cursor` features (not needed for preview)
- Keep `CodeMirror`, `LinkTooltip`, `Table`, `ListItem` enabled
- Apply same `typora-editor.css` styles via `typora-root` class
- Add `select-text` so users can copy from preview
- Security: Crepe uses ProseMirror which doesn't render raw HTML — inherently safe

### 2.2 Replace `MarkdownPreview` usage

- `TransferReceivePage.tsx`: replace `<MarkdownPreview>` with `<MilkdownPreview>`
- Share preview dialog: same replacement
- Lazy-load `MilkdownPreview` (it brings in the full Milkdown bundle)

### 2.3 Remove `MarkdownPreview` and `react-markdown`

- Delete `frontend/src/components/editor/MarkdownPreview.tsx`
- `pnpm remove react-markdown remark-gfm` (if no other usage)

### 2.4 DocPrintPreview

For print/PDF export in `DocEditorPage`:
- Before `window.print()`, render a `MilkdownPreview` (readonly) with current content in a hidden div
- `@media print`: show only the print preview div, hide the live editor
- This avoids printing `contenteditable` DOM artifacts (selection highlights, cursor, etc.)

Implementation: add a `printRef` div that renders `MilkdownPreview` off-screen, becomes visible only in `@media print`.

### Files changed:
- NEW `frontend/src/components/editor/MilkdownPreview.tsx`
- EDIT `frontend/src/pages/Transfer/TransferReceivePage.tsx`
- EDIT `frontend/src/pages/Docs/DocEditorPage.tsx` (print preview)
- EDIT `frontend/src/components/editor/typora-editor.css` (print rules for preview div)
- DELETE `frontend/src/components/editor/MarkdownPreview.tsx`
- EDIT `frontend/package.json` (remove react-markdown, remark-gfm)

---

## Phase 3: Outline Sidebar (TOC)

**Goal:** Collapsible TOC panel for long document navigation, Typora-style.

### 3.1 Create `EditorOutline` component

Location: `frontend/src/components/editor/EditorOutline.tsx`

Features:
- Extract headings (h1-h6) from editor content on every change (debounced 500ms)
- Parse heading text + level from the markdown string (regex: `/^(#{1,6})\s+(.+)$/gm`)
- Render as indented list with clickable items
- Click scrolls the editor to that heading's DOM node
- Highlight currently visible heading (intersection observer on heading elements)
- Collapse/expand with a toggle button

Layout:
- Desktop (lg+): fixed left sidebar, 220px wide, collapsible
- Mobile/tablet: hidden by default, accessible via a toggle button in header
- Sidebar state persisted in localStorage (`doc-outline-open`)

Design:
- `border-r border-border/40 bg-background`
- Heading items: `text-sm`, indented by level (pl per level)
- Active heading: `font-medium text-foreground` vs `text-muted-foreground`
- Smooth scroll with `scrollIntoView({ behavior: 'smooth', block: 'center' })`

### 3.2 Integrate into DocEditorPage layout

Current layout: `header` → `editor (full width)`

New layout:
```
header (full width)
├── outline sidebar (left, collapsible, lg+ only by default)
└── editor area (flex-1)
status bar (full width, fixed bottom)
```

- Use a flex row container below header
- Sidebar toggle button added to header (List icon)
- On mobile: sidebar overlays as a sheet/drawer

### 3.3 Heading scroll-to

Need to query Milkdown's ProseMirror DOM for heading elements. Strategy:
- After editor mounts, query `.ProseMirror h1, .ProseMirror h2, ...` etc.
- Map heading index to DOM element
- On outline click, call `element.scrollIntoView()`

### Files changed:
- NEW `frontend/src/components/editor/EditorOutline.tsx`
- EDIT `frontend/src/pages/Docs/DocEditorPage.tsx` (layout restructure)
- EDIT `frontend/src/components/editor/typora-editor.css` (adjust editor width when sidebar open)
- EDIT `frontend/public/locales/en/docs.json`
- EDIT `frontend/public/locales/zh-CN/docs.json`

---

## Phase 4: Export & Header UX Improvements

**Goal:** Better discoverability for export actions, cleaner header.

### 4.1 Flatten export buttons

Replace the 3-dot `DropdownMenu` with direct icon buttons in header:

Desktop header layout (left to right):
```
[←] [filename ✏] ---- [Outline toggle] [Export .md ↓] [Print 🖨] [Save]
```

Mobile header layout:
```
[←] [filename ✏] ---- [⋮ menu (Outline, Export, Print, Reload)] [Save]
```

- Desktop (sm+): show Outline toggle, Export .md, Print as individual icon buttons
- Mobile (<sm): collapse into dropdown menu
- Save button stays always visible as the primary action
- Reload moves into the dropdown (rarely used)

### 4.2 Save button emphasis

- Change save button: `variant="default"` (primary), slightly larger icon
- When dirty: add a subtle pulse/glow on the save button to draw attention
- When saved: button becomes `variant="ghost"` or disabled, reduces visual noise

### Files changed:
- EDIT `frontend/src/pages/Docs/DocEditorPage.tsx`
- EDIT `frontend/src/components/editor/typora-editor.css` (pulse animation for dirty state)

---

## Phase 5: Empty Document & Loading Polish

### 5.1 Better empty document template

Current: `# Untitled\n\n`

Change to: empty string `""` — let the Crepe placeholder handle guidance.
Update placeholder text to be more inviting: "Start writing, or type / for commands..."

### 5.2 Loading skeleton

Replace the Loader2 spinner with a content-area skeleton that mimics the editor layout:
- Gray bar for title line (w-1/3, h-8)
- Two gray bars for body lines (w-full, h-4)
- Three more shorter bars
- Fade in transition

Use shadcn `Skeleton` component.

### 5.3 Error state improvements

- Error card: add a document icon, make the message more friendly
- Network error during save: show a small inline banner below header instead of just status text

### Files changed:
- EDIT `frontend/src/pages/Docs/DocEditorPage.tsx`
- EDIT `frontend/src/pages/Dashboard/HubFilesPage.tsx` (empty string for new doc)
- EDIT `frontend/public/locales/en/docs.json`
- EDIT `frontend/public/locales/zh-CN/docs.json`

---

## Phase 6: Spec & i18n Update

### 6.1 Update `docs/spec/md-editor.md`

Changes to reflect decisions:
- Remove `EditorToolbar` component section — replaced by Crepe built-in toolbar/slash menu
- Remove `MilkdownEditor` component — renamed to `TyporaEditor` (already done in code)
- Add `MilkdownPreview` component section (readonly Milkdown Crepe)
- Add `EditorStatusBar` component section
- Add `EditorOutline` component section
- Update `DocEditorPage` section: new layout with sidebar + status bar
- Update `DocPrintPreview` → now uses `MilkdownPreview` in a hidden print div
- Remove `react-markdown` from dependencies, note Crepe-only rendering
- Update Implementation Order table

### 6.2 Update i18n files

New keys needed:
```
docs.wordCount        "{{count}} words"           / "{{count}} 字"
docs.charCount        "{{count}} characters"       / "{{count}} 字符"
docs.contentSize      "{{size}}"                   / "{{size}}"
docs.outline          "Outline"                    / "大纲"
docs.noHeadings       "No headings"                / "无标题"
docs.startWriting     "Start writing, or type / for commands..." / "开始写作，输入 / 可使用快捷命令..."
docs.exportActions    "Export"                     / "导出"
docs.print            "Print"                      / "打印"
```

### Files changed:
- EDIT `docs/spec/md-editor.md`
- EDIT `frontend/public/locales/en/docs.json`
- EDIT `frontend/public/locales/zh-CN/docs.json`

---

## Implementation Order

| Phase | Task | Depends On | Effort |
|-------|------|------------|--------|
| 1 | Bottom status bar + header cleanup | — | Medium |
| 2 | Milkdown readonly preview + print preview | — | Medium |
| 3 | Outline sidebar | Phase 1 (layout) | Medium |
| 4 | Export & header UX | Phase 1 (header refactor) | Small |
| 5 | Empty doc & loading polish | — | Small |
| 6 | Spec & i18n update | All above | Small |

Phase 1 and 2 can run in parallel. Phase 3 and 4 depend on Phase 1's layout changes. Phase 5 is independent. Phase 6 is final documentation sync.

---

## Files Summary

### New files
- `frontend/src/components/editor/EditorStatusBar.tsx`
- `frontend/src/components/editor/MilkdownPreview.tsx`
- `frontend/src/components/editor/EditorOutline.tsx`
- `frontend/src/lib/wordCount.ts`

### Major edits
- `frontend/src/pages/Docs/DocEditorPage.tsx` (layout restructure, header, status bar, print)
- `frontend/src/pages/Transfer/TransferReceivePage.tsx` (swap preview component)
- `frontend/src/components/editor/typora-editor.css` (sidebar, print, animations)
- `docs/spec/md-editor.md` (spec update)

### Deleted files
- `frontend/src/components/editor/MarkdownPreview.tsx`

### Dependencies
- Remove: `react-markdown`, `remark-gfm`
- No new dependencies (Milkdown Crepe already installed)
