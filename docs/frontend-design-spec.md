# Toolii Frontend Design Specification

> This document defines the visual identity, interaction patterns, motion system, and per-tool design for the Toolii frontend.

---

## 1. Brand Identity

### 1.1 Brand Personality

**Keywords:** Efficient, Trustworthy, Approachable, Modern

Toolii is an online tool collection. The brand personality should communicate:
- **Competence** — tools that work, no fluff
- **Clarity** — zero learning curve, the interface explains itself
- **Warmth** — not cold or corporate, but not childish either

The name "Toolii" itself has a playful quality (double "i"), which allows for a slightly more approachable tone than typical enterprise tools.

**Tone spectrum:**

```
Cold/Corporate ──────────────●──── Playful/Casual
                        Toolii sits here
                   "Friendly professional"
```

**Design philosophy:** Content-first neutrality. The user's images, PDFs, and text are the visual center — the UI chrome stays out of the way. Think Notion-level restraint with subtle, intentional personality touches.

### 1.2 Color Strategy

**Decision: Neutral foundation with restrained brand accent**

The UI stays predominantly neutral (black/white/gray). The Logo's Indigo (`#4F46E5`) serves as a **sparse accent** — appearing only at key interactive moments, never as a dominant surface color.

**Where brand accent appears (sparingly):**
- Logo itself
- Focus rings on interactive elements
- Inline links (text links, not buttons)
- Active/selected state indicators (tabs, nav items)
- Progress indicators and completion states

**Where brand accent does NOT appear:**
- Primary action buttons (these stay black/dark in light mode, white in dark mode)
- Large surface areas (backgrounds, cards, headers)
- Borders, dividers, or structural elements

**Brand accent tokens (semantic aliases for the brand scale in Section 2.1):**
```
--accent-brand:       var(--brand-600)   primary accent (Logo color, links, focus rings)
--accent-brand-light: var(--brand-100)   hover/focus background tint
--accent-brand-dark:  var(--brand-400)   dark mode foreground accent
```

Use `--accent-brand*` in component code for semantic clarity. The `--brand-*` scale in 2.1 is the source of truth for the raw values.

This approach keeps the overall feel clean and content-first, while the indigo touches provide just enough brand identity to make Toolii recognizable.

### 1.3 Visual Tone

**Decided: Minimal-neutral with editorial precision**

- Light mode as default and primary design target
- Dark mode: **basic support** via existing CSS variables (functional, not polished). Full dark mode refinement is Phase 2
- Neutral gray foundation — the UI is almost monochrome
- Content-first — the user's files and images are the visual center, not the UI chrome
- Progressive disclosure — show controls as needed, not all at once
- Personality comes from **typography, spacing, and motion** — not from color
- The only non-gray colors in the UI are: brand accent (indigo, sparse), semantic colors (red/green/amber for status), and the user's own content

### 1.4 UI Foundation — shadcn/ui (new-york)

**All UI components MUST use [shadcn/ui](https://ui.shadcn.com/) with the `new-york` style variant.**

This is the single source of truth for component patterns in the project. Do not introduce alternative component libraries (Ant Design, MUI, Chakra, Headless UI, etc.) or hand-roll equivalents of components that shadcn/ui already provides.

**Configuration (see `components.json`):**
```
style:      new-york
baseColor:  neutral
icons:      lucide-react
css:        Tailwind CSS v4 + CSS variables (oklch)
```

**What "new-york" means for our design:**
- Buttons use a flat, high-contrast fill with no rounded-full pills — aligns with our "minimal-neutral" tone
- Cards, dialogs, and popovers use subtle borders over heavy shadows — consistent with our Level 1 elevation approach
- Form controls (Input, Select, Checkbox, etc.) are compact and precise — matches "editorial precision"
- The variant has tighter padding and sharper visual rhythm than the default shadcn style, fitting our content-first philosophy

**Component usage rules:**
1. **Use shadcn/ui primitives first** — Button, Card, Dialog, Sheet, Select, Input, Tabs, Badge, Skeleton, etc. Customize via Tailwind classes and CSS variable overrides, not by forking the component source
2. **Follow the variant API** — use `variant` and `size` props (e.g., `<Button variant="outline" size="sm">`) rather than ad-hoc className overrides for standard states
3. **Extend, don't replace** — if a shadcn component needs project-specific behavior, wrap it in a thin project component (e.g., `ToolActionButton` wrapping `Button`) rather than modifying the `ui/` source directly
4. **Theme via CSS variables** — all customization of colors, radii, and spacing flows through the CSS variable system defined in `index.css`. Never hard-code color values in component code
5. **Icon consistency** — use `lucide-react` exclusively. Do not mix in icons from other libraries (heroicons, phosphor, etc.)

**Adding new shadcn components:**
```bash
pnpm dlx shadcn@latest add <component-name>
```
Always use the CLI to add components — this ensures the `new-york` style and project aliases are applied correctly. Do not copy-paste component source from the shadcn website.

---

## 2. Design Tokens

### 2.1 Color System (oklch)

Using oklch color space for perceptually uniform colors.

```
Base Neutral Scale (current, keep):
  --gray-50:   oklch(0.985 0 0)
  --gray-100:  oklch(0.97 0 0)
  --gray-200:  oklch(0.922 0 0)
  --gray-500:  oklch(0.556 0 0)
  --gray-600:  oklch(0.446 0 0)
  --gray-800:  oklch(0.269 0 0)
  --gray-900:  oklch(0.205 0 0)
  --gray-950:  oklch(0.145 0 0)

Brand Indigo Scale (derived from Logo #4F46E5, hue 264):
  --brand-50:   oklch(0.97 0.01 264)     very subtle bg tint
  --brand-100:  oklch(0.92 0.04 264)     hover/focus background
  --brand-200:  oklch(0.84 0.08 264)     light accent border
  --brand-400:  oklch(0.65 0.20 264)     dark-mode foreground accent
  --brand-500:  oklch(0.53 0.24 264)     primary accent (links, focus rings)
  --brand-600:  oklch(0.45 0.24 264)     primary accent strong (= Logo color)
  --brand-700:  oklch(0.38 0.22 264)     pressed/active state
  --brand-900:  oklch(0.25 0.14 264)     dark-mode bg tint

Semantic Colors:
  --destructive:       oklch(0.577 0.245 27.325)   red, errors/danger
  --destructive-light: oklch(0.94 0.03 27)         red tinted background
  --success:           oklch(0.60 0.17 145)        green, completions
  --success-light:     oklch(0.94 0.03 145)        green tinted background
  --warning:           oklch(0.75 0.15 85)         amber, caution
  --warning-light:     oklch(0.95 0.03 85)         amber tinted background
  --info:              oklch(0.55 0.18 250)        blue, information
  --info-light:        oklch(0.94 0.03 250)        blue tinted background
```

### 2.2 Typography

**Decision: Source Sans 3 (Humanist Sans) + System CJK**

```
Latin/Display:  Source Sans 3 (Adobe, SIL Open Font License)
                Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
                Load via Google Fonts: "Source+Sans+3:wght@400;500;600;700"

Monospace:      Source Code Pro (matching family)
                Weights: 400, 500
                For: file sizes, statistics, token counts, technical values

CJK:            System default
                macOS: PingFang SC / Hiragino Sans GB
                Windows: Microsoft YaHei
                Linux: Noto Sans CJK SC

Font stack:
  --font-sans:  "Source Sans 3", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif
  --font-mono:  "Source Code Pro", ui-monospace, "SF Mono", monospace
```

**Type scale:**
```
text-xs:    0.75rem / 1rem      (hints, labels, metadata)
text-sm:    0.875rem / 1.25rem  (body secondary, descriptions)
text-base:  1rem / 1.5rem       (body primary)
text-lg:    1.125rem / 1.75rem  (section titles)
text-xl:    1.25rem / 1.75rem   (page titles on tools)
text-2xl:   1.5rem / 2rem       (home page h1)
text-3xl:   1.875rem / 2.25rem  (hero, if ever needed)
```

**Typography personality traits:**
- Slightly wider letter-spacing on headings (tracking-tight is fine)
- Source Sans 3 has humanist proportions — letterforms have subtle stroke variation, which adds warmth without being decorative
- Pairs naturally with the neutral color scheme: the font IS the personality

### 2.3 Spacing & Layout

```
Base unit:       4px
Spacing scale:   4, 8, 12, 16, 20, 24, 32, 40, 48, 64
Border radius:   base = 10px (0.625rem), scales from sm to 4xl
Max widths:      content = 56rem, wide = 72rem, full = 88rem
```

### 2.4 Elevation & Depth

```
Level 0: Flat (background)
Level 1: Subtle border + shadow-sm (cards, panels)
Level 2: shadow-md (floating panels, dropdowns)
Level 3: shadow-lg + backdrop-blur (modals, overlays)
```

---

## 3. Interaction Design Patterns

### 3.1 Pattern Taxonomy

Every tool maps to one of five interaction patterns based on its nature:

| Pattern | Name | Core Principle | Visual Center |
|---------|------|---------------|---------------|
| **A** | Canvas | Direct manipulation on content | The image/document IS the workspace |
| **B** | Live Compare | Real-time parameter ↔ preview feedback | Before/after split view |
| **C** | Thumbnail Grid | Select, sort, and operate on content units | Page/file thumbnail array |
| **D** | Instant Convert | Drop and done, zero-config | Progress and status feedback |
| **E** | Live Editor | Type and see results update in real-time | Text area + live stats panel |

### 3.2 Tool → Pattern Mapping

| Tool | Pattern | Run Mode | Key Interaction |
|------|---------|----------|----------------|
| Image Compress | **B** Live Compare | manual | Comparison slider + quality slider with live preview |
| Mosaic | **A** Canvas | none | Paint/draw mosaic regions directly on image (client-only) |
| Remove Background | **B** variant | auto | Auto-process on upload, checkerboard transparency, bg swap |
| Scan Enhance | **B** Live Compare | auto | Upload → auto-enhance with default mode, side-by-side |
| HEIC → JPG | **D** Instant | auto | Drop files → auto convert → batch progress |
| Format Convert | **D** Instant | auto | Select target format → drop → auto convert |
| PDF Tools | **C** Thumbnail Grid | manual | Unified workspace: add PDFs/images, thumbnail grid for reorder/rotate/delete/select, export with optional merge/extract/compress |
| ID Photo | **A** Canvas | manual | Compliance guide overlay, drag-to-position, live checks |
| Word Counter | **E** Live Editor | none | Text area left, real-time stats right (client-only) |

### 3.3 Run Mode Definitions

Each tool has a **run mode** that determines how the Action Bar behaves:

| Run Mode | Action Bar Behavior | Tools |
|----------|-------------------|-------|
| **auto** | No "Process" button. Processing starts automatically on file upload. Action bar shows progress → result panel slides up when done. | Remove BG, Scan Enhance, HEIC→JPG, Format Convert |
| **manual** | "Process" button visible in action bar. User configures parameters in workspace, then clicks to submit. | Image Compress, PDF Tools, ID Photo |
| **none** | No action bar at all. Tool is entirely client-side with no backend processing step. Download button is part of the workspace itself. | Mosaic, Word Counter |

**Auto-run action bar states:**
```
[Empty]      → "Drop a file to start"
[Processing] → Progress bar + file info (no submit button)
[Done]       → Result panel slides up
[Error]      → Error message + "Try again" (re-upload)
```

**Manual-run action bar states:**
```
[Empty]      → "Upload a file to start" (disabled button)
[Has file]   → File info + enabled [Process] button
[Processing] → Progress bar + cancel option
[Done]       → Result panel slides up
[Error]      → Error message + [Retry] button
```

**No-bar tools:**
- Mosaic: download button is in the floating toolbar
- Word Counter: no file output, stats are the output

### 3.4 Drag-and-Drop File Interaction

All file-accepting tools share a consistent drag-and-drop behavior:

**Drop zone scope:**
- Each tool page has a **workspace-level drop zone** — the entire workspace area accepts drops, not just a small target
- The empty state IS the drop zone (full-area, with "drop here" messaging)
- After files are loaded, the workspace still accepts additional drops (for tools that support multi-file)

**Visual feedback by drag phase:**

| Phase | Visual Change | Duration |
|-------|--------------|----------|
| `dragenter` | Drop zone border changes to dashed category accent color; background tints to `--cat-*-surface`; empty state illustration scales to 1.02 | instant |
| `dragover` | Sustained highlight state (same as dragenter); cursor shows copy indicator | — |
| `dragleave` | Revert to default state | fast (100ms fade) |
| `drop` | Brief flash/pulse of category accent; file processing begins | normal (200ms) |

**Behavioral rules:**
- **Single-file tools** (Compress, Remove BG, Scan Enhance): dropping a new file replaces the current one
- **Multi-file tools** (PDF Tools, HEIC→JPG, Format Convert): dropping adds to the existing file list
- **Invalid file type**: drop zone border flashes `--destructive` briefly, inline error message appears
- **Click fallback**: all drop zones also function as click-to-browse triggers via hidden `<input type="file">`
- **Nested drop prevention**: `e.stopPropagation()` on workspace drop zones to prevent browser default file open behavior

**Mobile adaptation:**
- Drop zones show a prominent "Browse files" button (drag-and-drop is not the primary mobile interaction)
- Touch-and-hold on existing items triggers selection mode, not drag

---

## 4. Per-Tool Interaction Design

### 4.1 Image Compress (Pattern B — Live Compare)

**Layout:** Full-width workspace, image as visual center

```
+---------------------------------------------------+
|  +---------------------+------------------------+  |
|  |                     |                        |  |
|  |     Original        |<-- drag divider -->  Compressed  |
|  |                     |                        |  |
|  |   1.2 MB            |                 340 KB |  |
|  +---------------------+------------------------+  |
|                                                     |
|  -- Quality --------*------------ 80%               |
|                                                     |
|  Target size [_____] KB (optional)    [Compress]    |
+---------------------------------------------------+
```

**Interactions:**
- Upload → image fills workspace immediately, becomes visual center
- **Image Comparison Slider** — vertical divider dragged left/right to compare original vs compressed
- Quality slider → right side preview + estimated file size update **in real-time** (client-side Canvas compression for preview, no backend call)
- File sizes shown as floating labels on bottom-left (original) and bottom-right (compressed)
- Final submit calls backend for accurate result
- Result replaces the preview; slider now compares original vs final output

**Why this pattern:** Compression is a quality-vs-size tradeoff. Users MUST see the difference to make a decision. Numbers alone are meaningless.

### 4.2 Mosaic (Pattern A — Canvas)

**Layout:** Image as canvas, minimal floating toolbar

```
+---------------------------------------------------+
|  Toolbar: [Rect] [Brush] [Eraser] | Size --*-- | Strength --*-- |
|  -------------------------------------------------|
|  +-----------------------------------------------+|
|  |                                               ||
|  |         +--------+                            ||
|  |         |########|  <-- user-drawn mosaic     ||
|  |         +--------+                            ||
|  |                                               ||
|  |              Image Canvas                     ||
|  +-----------------------------------------------+|
|                                                     |
|  [Undo] [Redo] [Reset]                   [Download] |
+---------------------------------------------------+
```

**Interactions:**
- Image IS the canvas, occupies main workspace area
- Compact toolbar above canvas: **Rectangle select** (draw rect → fill mosaic), **Brush** (freehand paint mosaic), **Eraser** (remove mosaic from area)
- Cursor changes to crosshair/brush when over canvas
- Drag to draw → mosaic rendered **in real-time** on HTML Canvas, zero latency
- Parameters (block size, blur strength) on toolbar via small inline sliders; adjusting updates existing mosaic regions live
- Full undo/redo stack (operation-level, not pixel-level)
- **Entirely client-side** — no backend needed

**Why this pattern:** Mosaic requires precise spatial targeting. Only direct canvas manipulation allows users to specify exactly where to apply the effect.

### 4.3 Remove Background (Pattern B variant — Instant Result)

**Layout:** Single result view with background options

```
+---------------------------------------------------+
|  +-----------------------------------------------+|
|  | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ||
|  | ░░░░░░░░░░░+------------+░░░░░░░░░░░░░░░░░░░░ ||
|  | ░░░░░░░░░░░|   Subject  |░░░░░░░░░░░░░░░░░░░░ ||
|  | ░░░░░░░░░░░|            |░░░░░░░░░░░░░░░░░░░░ ||
|  | ░░░░░░░░░░░+------------+░░░░░░░░░░░░░░░░░░░░ ||
|  | ░░░░░░░░ (checkerboard = transparent) ░░░░░░░ ||
|  +-----------------------------------------------+|
|                                                     |
|  Background: [Transparent] [White] [Custom]  [Download PNG] |
+---------------------------------------------------+
```

**Interactions:**
- Upload → **auto-process immediately**, no "start" button
- Loading state: skeleton pulse over the image area
- Result appears with **checkerboard pattern** for transparent areas
- Bottom bar: switch background — transparent (checkerboard), white, solid color picker
- Compare with original: hold/click toggle to flash original image
- Future enhancement: brush tool for manual edge refinement

**Why auto-process:** Background removal needs zero parameters. Any extra step is friction. The user expectation is "upload and it's done."

### 4.4 Scan Enhance (Pattern B — Before/After)

**Layout:** Side-by-side comparison

```
+---------------------------------------------------+
|  +------------------+  +------------------------+  |
|  |                  |  |                        |  |
|  |  Original scan   |  |  Enhanced preview      |  |
|  |  (dark, skewed)  |  |  (high contrast, fix)  |  |
|  |                  |  |                        |  |
|  +------------------+  +------------------------+  |
|                                                     |
|  Mode: [Auto] [B&W Document] [Color Document]      |
|                                                  [Download] |
+---------------------------------------------------+
```

**Interactions:**
- Upload → auto-enhance with default mode, show side-by-side
- Three preset modes (no complex parameters): Auto, B&W Document, Color Document
- Switching preset → right side updates (backend call per mode change, with loading state)
- Can also use comparison slider instead of side-by-side

### 4.5 HEIC → JPG / Format Convert (Pattern D — Instant)

**Layout:** Drop zone → batch progress grid

```
+---------------------------------------------------+
|                                                     |
|       Drop files here, or click to select           |
|       Batch conversion supported                    |
|                                                     |
|  +------+ +------+ +------+ +------+               |
|  | img  | | img  | | img  | | img  |               |
|  |photo1| |photo2| |photo3| |photo4|               |
|  | .heic| | .heic| | .heic| | .heic|               |
|  |  OK  | |  OK  | | ...  | | wait |               |
|  +------+ +------+ +------+ +------+               |
|                                                     |
|  ================*========= 3/4 done                |
|                                                     |
|                              [Download All as ZIP]  |
+---------------------------------------------------+
```

**Interactions:**
- **Drop → immediately start converting**, zero extra steps
- Batch support: multiple files shown as thumbnail grid
- Each file card shows status: waiting → spinning → checkmark
- Overall progress bar at bottom
- Individual download per file, or batch ZIP download when all complete
- For generic format convert: format selector shown before/after drop

**Why this pattern:** Format conversion has nothing to "see." Users want speed. Make the conversion process itself the visual experience (watching files complete one by one).

### 4.6 PDF Tools (Pattern C — Unified Workspace)

**Concept:** All PDF operations (merge, reorder, rotate, delete, extract, compress) happen in a single visual workspace. Users add files, manipulate pages via thumbnail grid, and export with the desired operations applied.

**Layout:** Page thumbnail grid as primary workspace

```
+---------------------------------------------------+
|  PDF Tools                [Compress & Export] [Export]|
|  ------------------------------------------------- |
|  +-----+ +-----+ +-----+ +-----+ +-----+ [+ Add] |
|  |  1  | || 2 || |  3  | || 4 || |  5  |          |
|  | f1p1| |sel'd| | f1p3| |sel'd| | f2p1|          |
|  +-----+ +-----+ +-----+ +-----+ +-----+          |
|  +-----+ +-----+ +-----+                           |
|  |  6  | |  7  | |  8  |                           |
|  | f2p2| | f2p3| | f3p1|                           |
|  +-----+ +-----+ +-----+                           |
|                                                     |
|  8 pages · 3 files · 4.2 MB          [Clear all]   |
+---------------------------------------------------+
|  Floating selection bar (when pages selected):      |
|  2 selected | [Rotate] [Delete] [Extract] | [All] X|
+---------------------------------------------------+
```

**Workspace interactions:**
- **Add files:** Drop or browse to add PDF files and images (images auto-convert to PDF via backend)
- **Multi-source merge:** Adding multiple files automatically interleaves all pages into one flat grid
- **Thumbnail grid:** Each page rendered as a thumbnail with page number and source file indicator
- Click to select/deselect pages (highlighted border on selected)
- Drag-and-drop reorder with **drag ghost animation** and insertion line indicator
- **Per-page quick actions:** Hover reveals rotate button on thumbnail corner; right-click/long-press for context menu (rotate 90/180/270, delete)
- Rotate action → thumbnail **visually rotates in-place** with CSS transform
- Delete action → thumbnail **fades out and collapses** (not instant disappear)

**Selection actions (floating bottom bar):**
- Appears when one or more pages are selected
- **Rotate selected** — rotate all selected pages 90° clockwise
- **Delete selected** — remove selected pages from workspace
- **Extract selected** — export only the selected pages as a new PDF
- **Select All / Deselect All** toggle
- Dismiss (X) to clear selection

**Export flow (multi-step pipeline):**
1. Merge: if multiple source files, merge into one PDF
2. Reorder: apply the page order as arranged in the grid
3. Rotate: apply any per-page rotation
4. Compress (optional): if user clicks "Compress & Export"
5. Download the final result

Each step shows progress in the processing indicator bar. The pipeline is transparent to the user — they just click Export and wait.

**Status bar:**
- Page count, file count, total size
- "Clear all" to reset workspace

**Why unified workspace:** PDF operations are inherently combinatorial — users frequently need to merge + reorder + delete + rotate in one session. Splitting into separate tools forces re-uploading and re-processing. The unified workspace lets users do everything in one flow.

### 4.11 ID Photo (Pattern A — Canvas with Guide Overlay)

**Layout:** Photo canvas with compliance overlay

```
+---------------------------------------------------+
|  Spec: [1-inch] [2-inch] [Passport] [Custom]       |
|  ------------------------------------------------- |
|  +-----------------------------------------------+ |
|  |         +- - - - - - - -+                     | |
|  |         :   head line    :                     | |
|  |         :  +----------+  :                     | |
|  |         :  |   Face   |  :  <-- guide overlay  | |
|  |         :  |   area   |  :                     | |
|  |         :  +----------+  :                     | |
|  |         :   chin line    :                     | |
|  |         +- - - - - - - -+                     | |
|  +-----------------------------------------------+ |
|                                                     |
|  Checks:  [x] Face detected  [x] Size OK  [ ] Background |
|                                                     |
|  Background: [White] [Blue] [Red]      [Generate]   |
+---------------------------------------------------+
```

**Interactions:**
- Select photo spec → workspace shows **dashed compliance guide frame** (head top line, chin line, shoulder markers)
- Upload/capture photo → photo appears inside guide frame
- User can **drag and pinch/scroll to reposition and scale** the photo within the frame
- Compliance checklist updates **in real-time**: face detected, size OK, background color
- Background color: one-click swap, preview updates instantly
- Final "Generate" calls backend for precise processing

### 4.12 Word Counter / Text Tools (Pattern E — Live Editor)

**Layout:** Text area + live stats panel

```
+---------------------------------------------------+
|  +-----------------------------+ +--------------+  |
|  |                             | | Chars  1,247 |  |
|  |  Type or paste text here... | | Words    186 |  |
|  |                             | | Sentences 12 |  |
|  |  User is typing and every   | | Paragraphs 3 |  |
|  |  keystroke updates the      | | Lines      8 |  |
|  |  stats panel in real-time   | | ------------ |  |
|  |                             | | GPT-4   312 |  |
|  |                             | | Claude  298 |  |
|  |                             | | Llama   305 |  |
|  +-----------------------------+ +--------------+  |
+---------------------------------------------------+
```

**Interactions:**
- Left: large text area (monospace or body font, user choice)
- Right: stats panel, every metric updates **on every keystroke** (debounced for token counts)
- Number changes animate with **counting transition** (number rolls up/down)
- No submit button — everything is live

---

## 5. Motion & Micro-interactions

**Decision: Refined micro-interactions (Stripe / Framer level)**

Beyond functional state transitions, Toolii uses carefully designed micro-interactions that add polish and delight without being distracting.

### 5.1 Motion Principles

1. **Purposeful** — every animation communicates state change or spatial relationship
2. **Fast** — most transitions 150-250ms; never block the user
3. **Respectful** — honor `prefers-reduced-motion`; all animations degrade to instant state change
4. **Consistent** — same type of action → same type of motion across all tools
5. **Delightful** — key moments (completion, file drop, first result) get extra polish

### 5.2 Timing & Easing

```
Duration scale:
  --duration-fast:    100ms   (hover states, color changes)
  --duration-normal:  200ms   (panel transitions, element enter/exit)
  --duration-slow:    350ms   (page transitions, complex animations)
  --duration-slower:  500ms   (orchestrated sequences, staggered reveals)

Easing:
  --ease-out:         cubic-bezier(0.16, 1, 0.3, 1)     (elements entering)
  --ease-in:          cubic-bezier(0.7, 0, 0.84, 0)     (elements exiting)
  --ease-in-out:      cubic-bezier(0.87, 0, 0.13, 1)    (elements moving)
  --ease-spring:      cubic-bezier(0.34, 1.56, 0.64, 1) (playful bounce, sparingly)
```

### 5.3 Interaction-Specific Motions

| Trigger | Motion | Duration | Easing |
|---------|--------|----------|--------|
| Button hover | Background color shift | fast | ease-out |
| Button press | Scale down to 0.97 | fast | ease-out |
| Card hover | Subtle lift (translateY -2px) + shadow increase | fast | ease-out |
| File drop zone drag-enter | Border color pulse + scale 1.02 | normal | ease-spring |
| File upload complete | Checkmark draw-on animation | normal | ease-out |
| Processing spinner | Continuous rotate, 800ms per revolution | — | linear |
| Progress bar | Width transition | normal | ease-in-out |
| Number counter update | Number roll/count animation | slow | ease-out |
| Page thumbnail select | Border color + subtle scale 1.03 | fast | ease-out |
| Page thumbnail delete | Fade out + collapse width | normal | ease-in |
| Drag-and-drop item | Lift (shadow + scale 1.05), insertion line at target | — | ease-spring |
| Comparison slider drag | No transition (immediate, follows cursor) | 0ms | — |
| Toast notification enter | Slide in from bottom-right + fade | normal | ease-out |
| Toast notification exit | Fade out + slide down | fast | ease-in |
| Page/route transition | Fade in + subtle translateY (8px → 0) | normal | ease-out |

### 5.4 Staggered Reveals

For grid layouts (tool cards on home page, page thumbnails):
- Each item enters with a stagger delay of 30-50ms
- Animation: fade in + translateY (12px → 0)
- Maximum stagger cap: 300ms (after ~8 items, remaining appear together)

### 5.5 Loading & Processing States

```
Skeleton:        Pulse animation (opacity 0.4 → 1), 1.5s cycle
Image processing: Overlay with frosted glass (backdrop-blur) + centered spinner
Batch progress:  Per-item status icon transition (wait → spin → checkmark)
Upload progress: Smooth width transition on progress bar, percentage counter
```

---

## 6. Visual Differentiation

### 6.1 Tool Category Visual Identity

**Decision: Soft pastel accents — light, harmonious, never aggressive**

Each tool category has a distinct **muted pastel accent** used for:
- Category icon background (light tint)
- Tool page header gradient tint (very subtle)
- Active/selected state highlights within that tool
- Home page card hover/accent

The palette is intentionally low-chroma and high-lightness. Colors are noticeable but never loud.

```
Image Tools (Warm Peach):
  --cat-image:          oklch(0.78 0.10 55)    icon/badge accent
  --cat-image-light:    oklch(0.95 0.025 55)   tinted background
  --cat-image-surface:  oklch(0.98 0.012 55)   very subtle card tint

PDF Tools (Soft Rose):
  --cat-pdf:            oklch(0.75 0.09 15)    icon/badge accent
  --cat-pdf-light:      oklch(0.95 0.022 15)   tinted background
  --cat-pdf-surface:    oklch(0.98 0.010 15)   very subtle card tint

Text Tools (Cool Lavender):
  --cat-text:           oklch(0.72 0.08 280)   icon/badge accent
  --cat-text-light:     oklch(0.95 0.020 280)  tinted background
  --cat-text-surface:   oklch(0.98 0.010 280)  very subtle card tint

ID Photo (Sage Green):
  --cat-idphoto:          oklch(0.75 0.08 160)   icon/badge accent
  --cat-idphoto-light:    oklch(0.95 0.020 160)  tinted background
  --cat-idphoto-surface:  oklch(0.98 0.010 160)  very subtle card tint
```

**Dark mode adaptation (Phase 2):**

Dark mode category colors are deferred. In Phase 1, the existing shadcn dark mode variables provide functional dark mode. Phase 2 will add category-aware dark mode with:
```
Dark mode -light variants:  oklch(0.25 0.025 HUE)
Dark mode -surface variants: oklch(0.20 0.012 HUE)
```

**Usage rules:**
- The `*-surface` variant is the most common — used for large areas (headers, card backgrounds)
- The `*-light` variant is for interactive states (hover, selected)
- The base `*` variant is only for small elements (icons, badges, tags)
- Never use the base color as a text color or button background

### 6.2 Tool Page Header Differentiation

Each tool page header uses the ToolPageShell gradient, tinted with the category accent color:

```css
/* Image Tools (Warm Peach, hue 55): */
background: radial-gradient(circle at top right, oklch(0.78 0.10 55 / 0.12), transparent 55%);

/* PDF Tools (Soft Rose, hue 15): */
background: radial-gradient(circle at top right, oklch(0.75 0.09 15 / 0.12), transparent 55%);

/* Text Tools (Cool Lavender, hue 280): */
background: radial-gradient(circle at top right, oklch(0.72 0.08 280 / 0.12), transparent 55%);

/* ID Photo (Sage Green, hue 160): */
background: radial-gradient(circle at top right, oklch(0.75 0.08 160 / 0.12), transparent 55%);
```

The tint should be barely noticeable — just enough to give each category a distinct feel without competing with the user's content.

### 6.3 Tool Icons

Each tool has a unique icon from the Lucide icon set, displayed:
- On the home page tool cards
- In the tool page header
- In breadcrumb/navigation contexts

| Tool | Icon | Rationale |
|------|------|-----------|
| Image Compress | `Minimize2` | Visually represents shrinking/compression |
| Mosaic | `Grid3x3` | Represents the pixelated grid effect |
| Remove BG | `Eraser` | Represents removing/erasing the background |
| Scan Enhance | `ScanLine` | Directly maps to the "scan" concept |
| HEIC → JPG | `FileImage` | Represents image file output |
| Format Convert | `ArrowRightLeft` | Clearly represents conversion between formats |
| PDF Tools | `Layers` | Represents working with document pages/layers |
| ID Photo | `Camera` | Represents photo capture |
| Word Counter | `Type` | Represents text/typing input |

### 6.4 Empty States

**Decision: Illustration + description type**

Each tool's empty state features a lightweight illustration that visually describes what the tool does, making the page feel alive even before user interaction.

**Structure:**
```
+-------------------------------------------+
|                                           |
|         [ Lightweight illustration ]      |
|         (SVG, tool-specific, pastel)      |
|                                           |
|    Drag image here or click to upload     |
|    Supports JPG, PNG, WebP up to 20MB     |
|                                           |
|         [ Browse files ]                  |
+-------------------------------------------+
```

**Illustration style:**
- Line art or flat illustration in the tool's category pastel color
- Simple, abstract, not photorealistic — think geometric shapes suggesting the action
- Examples:
  - Image Compress: two overlapping rectangles, one smaller with a down arrow
  - Mosaic: grid of squares with some pixelated
  - Remove BG: silhouette separating from a background layer
  - PDF Merge: document pages sliding together
  - ID Photo: face outline within a frame guide
  - Word Counter: text lines with a counting indicator
- SVG format, inline in React components (not external image files)
- Animated subtly: gentle float, soft pulse, or draw-on effect on page load

**Interaction on drag-hover:**
- Illustration scales up slightly (1.02) and the drop zone border pulses with category accent color
- Background tints to the category's `-surface` color

**Implementation note:** Illustrations can be built incrementally — start with icon + description, replace with proper SVG illustrations over time.

---

## 7. Page Design

### 7.0 Home Page

**Decision: Hero + all tools by category (flat 2-level navigation)**

The home page directly shows ALL tools grouped by category, eliminating the intermediate category index pages. Users click a tool and go directly to its workspace.

**Layout:**
```
+---------------------------------------------------+
| Header                                              |
+---------------------------------------------------+
|                                                     |
|  +-----------------------------------------------+ |
|  |  Hero Section (compact, not oversized)         | |
|  |                                                | |
|  |  Free online tools for images, PDFs, and more  | |
|  |  Fast, private, no sign-up required.           | |
|  +-----------------------------------------------+ |
|                                                     |
|  IMAGE TOOLS                                        |
|  +--------+ +--------+ +--------+ +--------+ ...   |
|  |[icon]  | |[icon]  | |[icon]  | |[icon]  |       |
|  |Compress| |RemoveBG| |Mosaic  | |Convert |       |
|  |desc... | |desc... | |desc... | |desc... |       |
|  +--------+ +--------+ +--------+ +--------+       |
|                                                     |
|  PDF TOOLS                                          |
|  +--------+ +--------+ +--------+ +--------+ ...   |
|  |[icon]  | |[icon]  | |[icon]  | |[icon]  |       |
|  |Merge   | |Split   | |Pages   | |Compress|       |
|  +--------+ +--------+ +--------+ +--------+       |
|                                                     |
|  ID PHOTO                                           |
|  +--------+                                         |
|  |[icon]  |                                         |
|  |ID Photo|                                         |
|  +--------+                                         |
|                                                     |
|  TEXT TOOLS                                         |
|  +--------+                                         |
|  |[icon]  |                                         |
|  |Word Cnt|                                         |
|  +--------+                                         |
|                                                     |
| Footer                                              |
+---------------------------------------------------+
```

**Hero section:**
- Compact (not full-viewport), roughly 120-160px tall
- Brand name + one-line value proposition
- Optional: trust indicators ("Files processed locally", "No sign-up needed")
- Subtle category-pastel gradient background or soft pattern

**Tool cards:**
- Icon (from Lucide, in category accent color)
- Tool name (semibold)
- One-line description (muted)
- Hover: card lifts slightly, category accent tint on background
- Staggered fade-in on page load

**Category sections:**
- Section header with category name + subtle left border in category color
- Tool cards in a responsive grid (2 cols on mobile, 3-4 on desktop)

**Navigation change:**
- The intermediate category index pages (ImageToolsIndexPage, TextToolsIndexPage, etc.) become optional — they can still exist for SEO but are no longer the primary navigation path
- "Back" button on tool pages links back to home `/` instead of category index
- Breadcrumb: Home > Tool Name (no category level)

### 7.1 Page Structure

```
+---------------------------------------------------+
| Header (sticky, 56px, backdrop-blur)               |
| Logo + user actions only. NO tool navigation.      |
+---------------------------------------------------+
| Main Content Area (flex-grow)                       |
|   max-width varies by context:                     |
|   - Home page:   6xl (72rem)                       |
|   - Tool pages:  per ToolPageShell width prop      |
|   - Auth pages:  sm (24rem)                        |
|   - Dashboard:   6xl (72rem)                       |
+---------------------------------------------------+
| Fixed Action Bar (tool pages only)                  |
+---------------------------------------------------+
| Footer (not on tool pages — action bar takes over)  |
+---------------------------------------------------+
```

**Header decision: Keep minimal**
- Logo (links to home) + language switcher + user actions (login/register or dashboard/logout)
- No tool navigation in header — tool discovery happens on the home page
- Header serves as a subtle anchor point, not a navigation hub
- This keeps vertical space maximized for the workspace

### 7.2 ToolPageShell Layout Modes

```
compact:    Single column, max-w-4xl
            For simple tools (format convert, text tools)

split:      Two equal columns on lg+
            For tools with input controls + preview sidebar
            (image compress, scan enhance)

workspace:  60/40 split on xl+
            For complex tools with large visual workspace
            (PDF page editor, mosaic, ID photo)
```

### 7.3 Action Bar & Result Panel

**Decision: Fixed bottom action bar + bottom popup result panel**

All tool pages share a consistent bottom-anchored interaction zone.

**Fixed Action Bar:**
```
+---------------------------------------------------+
|                                                     |
|  [ Workspace / Canvas / Preview ]                   |
|  (scrollable content area)                          |
|                                                     |
+===================================================+
|  Status: Ready | 1.2 MB selected       [ Process ] |  <- fixed bottom
+===================================================+
```

- Always visible at the bottom of the viewport
- Contains: status info (left), primary action button (right)
- During processing: progress bar replaces/overlays the action bar
- Translucent background with backdrop-blur (matches header style)
- On mobile: full width, comfortable touch target height (48-56px)
- On desktop: same fixed position, max-width matches workspace

**Result Panel (slides up from bottom):**
```
+---------------------------------------------------+
|                                                     |
|  [ Workspace remains visible above ]                |
|                                                     |
+===================================================+
|  +-----------------------------------------------+ |
|  |  Result                                  [ X ] | |
|  |                                                | |
|  |  output.jpg · 340 KB (72% smaller)             | |
|  |  [Preview thumbnail]                           | |
|  |                                                | |
|  |  [ Download ]  [ Process another ]             | |
|  +-----------------------------------------------+ |
+===================================================+
```

- Slides up with spring easing when processing completes
- Overlays the action bar (replaces it temporarily)
- Shows: result preview, file info, compression ratio / comparison stats, download button
- "Process another" or "Back to workspace" to dismiss and return
- Can be swiped down to dismiss (mobile)
- Workspace remains partially visible above the panel (user can still see the context)
- Panel height adapts to content, max ~40vh

**State transitions (see Section 3.3 for auto vs manual differences):**

Manual-run tools:
```
[Empty]     → Action bar: "Upload a file to start" (disabled button)
[Has file]  → Action bar: file info + enabled [Process] button
[Processing]→ Action bar: progress bar + cancel option
[Done]      → Result panel slides up over the action bar
[Dismiss]   → Result panel slides down, action bar reappears
```

Auto-run tools:
```
[Empty]     → Action bar: "Drop a file to start"
[Processing]→ Action bar: progress bar (auto-triggered by upload)
[Done]      → Result panel slides up
[Dismiss]   → Action bar reappears with drop zone re-enabled
```

No-bar tools (Mosaic, Word Counter):
```
No action bar. Tool controls are integrated into the workspace.
```

### 7.4 Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| < 640px (mobile) | Single column, full-width workspace, bottom-fixed action bar |
| 640-1024px (tablet) | Single column or compact split, sidebar below main |
| 1024px+ (desktop) | Full split/workspace layout as designed |

**Mobile-specific adaptations:**
- Fixed bottom action bar (always, see 7.3)
- Toolbar in Canvas tools (mosaic) becomes bottom sheet or compact floating bar
- Comparison slider works with touch drag
- Thumbnail grid reduces to 2-3 columns
- Result panel slides up from bottom (sheet-like behavior)
- Tool parameters accessible via expandable section above the action bar

---

## 8. Accessibility

- All interactive elements have visible focus states (ring)
- Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text/UI)
- All animations respect `prefers-reduced-motion`; reduced-motion users get instant state changes
- Canvas tools provide keyboard alternatives (arrow keys for position, shortcuts for tool switching)
- File drop zones also have click-to-browse fallback
- Screen reader announcements for processing status changes (via `aria-live` regions)

**Icon accessibility rules:**
- **Decorative icons** (next to text labels): `aria-hidden="true"`, the adjacent text provides meaning
- **Icon-only buttons** (no visible label): MUST have `aria-label` describing the action
- **Status icons** (checkmarks, spinners, error icons): `role="img"` + `aria-label` describing the status
- All icon buttons must be keyboard-reachable (focusable) and have visible focus ring

---

## 9. Error & Exception States

### 9.1 Error State Matrix

| Trigger | Visual Treatment | Message Pattern | CTA | Recoverable? |
|---------|-----------------|----------------|-----|-------------|
| **File too large** | Inline warning below drop zone | "File exceeds {max}MB limit" | "Choose a smaller file" | Yes — re-upload |
| **Unsupported format** | Inline warning below drop zone | "Format not supported. Use {formats}" | "Choose another file" | Yes — re-upload |
| **Upload failed (network)** | Action bar turns error state (red tint) | "Upload failed. Check your connection." | [Retry] | Yes — retry same file |
| **Processing failed (server)** | Action bar turns error state | "Processing failed. Please try again." | [Retry] | Yes — retry |
| **Processing timeout** | Action bar turns error state | "Processing timed out. File may be too complex." | [Retry] [Try smaller file] | Maybe |
| **Batch partial failure** | Per-item error badge on failed items | "3 of 5 files failed" | [Retry failed] [Download successful] | Yes — retry failed subset |
| **Auth required** | Modal dialog over workspace | "Sign in to use this tool" | [Sign in] [Register] | Yes — after auth |
| **Insufficient credits** | Modal dialog (InsufficientCreditsDialog) | "Not enough credits for this operation" | [Buy credits] [Dismiss] | Yes — after purchase |
| **Rate limited** | Toast notification | "Too many requests. Wait a moment." | Auto-dismiss after cooldown | Yes — auto-recovers |
| **File corrupt/unreadable** | Inline error replacing preview | "File could not be read" | [Upload a different file] | Yes — re-upload |

### 9.2 Error Visual Design

```
Error states use semantic --destructive color:
  - Background:  --destructive-light (subtle red tint)
  - Border:      --destructive at 20% opacity
  - Icon:        XCircle or AlertTriangle in --destructive
  - Text:        --destructive (error message), --foreground (description)
```

**Principles:**
- Errors appear **in context** (near the action that caused them), not as distant toasts
- Error messages are **specific and actionable** — tell the user what went wrong AND what to do
- Auto-dismissing errors (rate limit) use toast; persistent errors (file format) use inline display
- Error state never destroys user work (uploaded files, entered parameters persist)

---

## 10. Internationalization (i18n)

### 10.1 Translation Key Conventions

```
Namespace structure:
  common.json    — shared UI (nav, actions, preview labels)
  tools.json     — image tools + PDF tools
  textTools.json — text tool specific
  idPhoto.json   — ID photo specific

Key naming pattern:
  {feature}.{component}.{element}
  Examples:
    compress.title
    compress.description
    compress.qualityLabel
    pdf.workspace.export
    common:actions.back
    common:preview.input
```

### 10.2 Text Length Constraints

| Element | Max chars (EN) | Max chars (ZH) | Overflow strategy |
|---------|---------------|----------------|-------------------|
| Button label | 20 | 8 | Never truncate; redesign if too long |
| Tool card title | 25 | 10 | Single line, ellipsis as last resort |
| Tool card description | 80 | 40 | Max 2 lines, then truncate |
| Action bar status | 50 | 25 | Ellipsis with title tooltip |
| Toast message | 100 | 50 | Multi-line allowed, max 3 lines |
| Page title (h1) | 40 | 16 | Single line |
| Hero subtitle | 80 | 40 | Max 2 lines |

### 10.3 Localization Rules

- **Numbers:** Use `Intl.NumberFormat` for locale-aware formatting (thousands separator, decimal)
- **File sizes:** Always formatted with `formatBytes()` utility — shows KB/MB, not localized units
- **Dates:** Use `Intl.DateTimeFormat` with locale from i18n
- **Pluralization:** Use i18next `count` interpolation (`{{count}} file` / `{{count}} files`)
- **No concatenation:** Never build sentences by concatenating translated fragments. Use full sentence keys with interpolation placeholders
- **Fallback chain:** zh-CN → en (English is the fallback for missing Chinese translations)

---

## 11. Performance Budget

### 11.1 Loading Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse on 4G throttle |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse on 4G throttle |
| Total blocking time (TBT) | < 200ms | Lighthouse |
| Initial JS bundle (gzipped) | < 200KB | Vite build output |
| Font loading | < 300ms additional | Google Fonts with `display=swap` |

### 11.2 Runtime Performance

| Interaction | Target | Notes |
|-------------|--------|-------|
| Canvas preview update (mosaic, compress slider) | < 16ms (60fps) | Client-side Canvas operations |
| Text stats update on keystroke | < 50ms | Debounce token counts to 300ms |
| PDF thumbnail render per page | < 200ms | pdfjs worker thread |
| Comparison slider drag | 0ms perceived lag | CSS transforms only, no repaints |
| Action bar state transition | < 200ms | CSS transition |
| Result panel slide-up | < 350ms | Spring animation |
| File drop zone response | < 100ms | Immediate visual feedback on dragenter |

### 11.3 Asset Budgets

| Asset type | Per-item budget | Total budget |
|-----------|----------------|-------------|
| Tool illustration SVG | < 5KB each | < 65KB total (13 tools) |
| Lucide icons (tree-shaken) | ~200B each | Negligible |
| Source Sans 3 font | ~60KB (4 weights, woff2) | Via Google Fonts CDN |
| Source Code Pro font | ~30KB (2 weights, woff2) | Via Google Fonts CDN |

### 11.4 Minimum Device Target

- **Mobile:** 2019+ mid-range Android (4GB RAM, Snapdragon 665 class)
- **Desktop:** Any modern browser (Chrome/Firefox/Safari/Edge, last 2 major versions)
- **Network:** Functional on 3G; optimized for 4G+

---

## 12. Tool Naming & Routing Map

Canonical names for consistency across code, UI, URLs, and translations:

| Product Name (EN) | Product Name (ZH) | Route | Component | i18n Key Prefix |
|-------------------|--------------------|-------|-----------|-----------------|
| Image Compress | 图片压缩 | `/image-tools/compress` | `CompressPage` | `compress` |
| Remove Background | 去除背景 | `/image-tools/remove-bg` | `RemoveBgPage` | `removeBg` |
| Mosaic | 马赛克 | `/image-tools/mosaic` | `MosaicPage` | `mosaic` |
| Scan Enhance | 扫描增强 | `/image-tools/scan-enhance` | `ScanEnhancePage` | `scanEnhance` |
| HEIC to JPG | HEIC 转 JPG | `/image-tools/heic-to-jpg` | `HeicToJpgPage` | `heicToJpg` |
| Format Convert | 格式转换 | `/image-tools/convert` | `FormatConvertPage` | `convert` |
| PDF Tools | PDF 工具 | `/pdf-tools` | `PdfToolsPage` | `pdf` |
| ID Photo | 证件照 | `/id-photo` | `IdPhotoPage` | `idPhoto` |
| Word Counter | 字数统计 | `/text-tools/word-counter` | `WordCounterPage` | `wordCounter` |

**Naming rules:**
- Product names are user-facing, used in UI and translations
- Route paths use kebab-case
- Component names use PascalCase
- i18n key prefixes use camelCase
- When referring to a tool in documentation or code comments, use the **Product Name (EN)**

---

## 13. Design Decisions Log

| Decision | Choice | Section |
|----------|--------|---------|
| Brand personality | Friendly professional, content-first neutrality | 1.1 |
| Color strategy | Neutral foundation + sparse indigo accent (from Logo) | 1.2 |
| Visual tone | Minimal-neutral with editorial precision | 1.3 |
| Typography | Source Sans 3 (Latin) + System CJK fonts | 2.2 |
| Tool category colors | Soft pastel accents (peach, rose, lavender, sage) | 6.1 |
| Motion level | Refined micro-interactions (Stripe/Framer level) | 5 |
| Empty states | Illustration + description type | 6.4 |
| Home page | Hero section + all tools by category (flat layout) | 7.0 |
| Navigation depth | 2 levels: Home → Tool (eliminate category index pages) | 7.0 |
| Header | Keep minimal — Logo + user actions only, no tool nav | 7.1 |
| PDF Tools | Unified workspace (one page, all operations) | 3.2, 4.6 |
| Action bar | Fixed at bottom, auto/manual/none modes per tool | 7.3, 3.3 |
| Drag-and-drop | Workspace-level drop zones with unified visual feedback | 3.4 |
| Result display | Bottom popup panel (slides up over action bar) | 7.3 |
| Dark mode | Basic support via existing vars; polish deferred to Phase 2 | 1.3 |
| Semantic colors | Defined: destructive/success/warning/info with light variants | 2.1 |
| Brand color scale | Full indigo scale from 50-900 | 2.1 |
| Error handling | In-context errors, specific & actionable messages | 9 |
| i18n | Key conventions, text length constraints, no concatenation | 10 |
| Performance | FCP < 1.5s, LCP < 2.5s, canvas ops < 16ms | 11 |
| UI component library | shadcn/ui (new-york style), Tailwind CSS v4, OKLCH color space | 1.4 |
| Animation system | tw-animate-css (pure CSS import), replaces tailwindcss-animate plugin | 1.4 |
| Color token enforcement | All semantic colors via CSS variables, no hardcoded Tailwind color names | 2.1 |

## 14. Open Items

Items still needing resolution:

1. **Dark mode polish (Phase 2)** — Category-aware dark mode pastels, dark mode-specific gradients
2. **Tool illustration assets** — SVG illustrations for each tool's empty state (build incrementally)
3. **Mobile gesture details** — Swipe-to-dismiss, bottom sheet specifics for canvas tools on mobile
4. **"Files processed locally" claim** — Determine which tools are fully client-side vs server-processed, and communicate accurately in UI. Current truth: Mosaic and Word Counter are client-only; all others involve server processing

---

*Document version: 0.5 (shadcn/ui alignment, animation system migration, color token enforcement)*
*Last updated: 2026-02-28*
