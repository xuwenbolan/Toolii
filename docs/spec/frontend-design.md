# Toolii Frontend Design Specification

Status: final | Updated: 2026-03-03

> Visual identity, interaction patterns, and per-tool design for the Toolii frontend.

---

## 1. Brand Identity

### 1.1 Brand Personality

**Keywords:** Efficient, Trustworthy, Approachable, Modern

- **Competence** -- tools that work, no fluff
- **Clarity** -- zero learning curve, the interface explains itself
- **Warmth** -- not cold or corporate, but not childish either

```
Cold/Corporate ──────────────●──── Playful/Casual
                        Toolii sits here
                   "Friendly professional"
```

**Design philosophy:** Content-first neutrality. The user's images, PDFs, and text are the visual center -- the UI chrome stays out of the way.

### 1.2 Color Strategy

**Decision: Monochrome foundation, color only for meaning**

The UI is black/white/gray. Color appears only in two cases:
1. **Logo** -- brand indigo `#4F46E5` (hardcoded in SVG, not a design token)
2. **Semantic status** -- red/green/amber/blue for errors, success, warnings, info

Color does NOT appear for:
- Buttons (primary buttons are black/dark in light mode, white in dark mode)
- Links (foreground color + underline)
- Focus rings (neutral gray `--ring`)
- Tool categories (no category accent colors)
- Page backgrounds, cards, headers, borders

### 1.3 Visual Tone

- Light mode as default and primary design target
- Dark mode: basic support via CSS variables
- Neutral gray foundation -- the UI is monochrome
- Content-first -- the user's files and images are the visual center
- Progressive disclosure -- show controls as needed, not all at once
- Personality comes from **typography, spacing, and layout** -- not from color

### 1.4 UI Foundation -- shadcn/ui (new-york)

**All UI components MUST use [shadcn/ui](https://ui.shadcn.com/) with the `new-york` style variant.**

Do not introduce alternative component libraries (Ant Design, MUI, Chakra, Headless UI, etc.) or hand-roll equivalents of components that shadcn/ui already provides.

**Configuration (see `components.json`):**
```
style:      new-york
baseColor:  neutral
icons:      lucide-react
css:        Tailwind CSS v4 + CSS variables (oklch)
```

**Component usage rules:**
1. **Use shadcn/ui primitives first** -- Button, Card, Dialog, Sheet, Select, Input, Tabs, Badge, Skeleton, etc.
2. **Follow the variant API** -- use `variant` and `size` props rather than ad-hoc className overrides
3. **Extend, don't replace** -- wrap in thin project components (e.g., `ToolActionButton` wrapping `Button`) rather than modifying `ui/` source
4. **Theme via CSS variables** -- all color customization flows through `index.css`. Never hard-code color values in component code
5. **Icon consistency** -- use `lucide-react` exclusively

**Adding new shadcn components:**
```bash
pnpm dlx shadcn@latest add <component-name>
```

---

## 2. Design Tokens

### 2.1 Color System (oklch)

All colors use the oklch color space for perceptual uniformity.

```
Base Neutral (shadcn core):
  --background / --foreground       page background and text
  --card / --card-foreground        card surfaces
  --muted / --muted-foreground      subdued backgrounds and text
  --primary / --primary-foreground  primary actions (black/white)
  --secondary / --secondary-foreground
  --accent / --accent-foreground
  --border / --input / --ring       borders, inputs, focus rings
  --destructive / --destructive-foreground

Semantic Status Colors:
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

**Font stack:**
```
--font-sans:  "Source Sans 3", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif
--font-mono:  "Source Code Pro", ui-monospace, "SF Mono", monospace
```

**Font loading:** Via `@fontsource` local packages (no external CDN dependency).

```
Source Sans 3:    400 (regular), 500 (medium), 600 (semibold), 700 (bold)
Source Code Pro:  400, 500
CJK:             System default (PingFang SC / Microsoft YaHei / Noto Sans CJK SC)
```

**Type scale (Tailwind defaults):**
```
text-xs:    0.75rem / 1rem      hints, labels, metadata
text-sm:    0.875rem / 1.25rem  body secondary, descriptions
text-base:  1rem / 1.5rem       body primary
text-lg:    1.125rem / 1.75rem  section titles
text-xl:    1.25rem / 1.75rem   page titles on tools
text-2xl:   1.5rem / 2rem       home page h1
text-3xl:   1.875rem / 2.25rem  hero, if ever needed
```

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

### 2.5 Timing & Easing

```
--duration-fast:    150ms    hover states, color changes
--duration-normal:  250ms    panel transitions, element enter/exit
--ease-out:         cubic-bezier(0.22, 1, 0.36, 1)
```

Only one animation keyframe is defined globally: `fade-in` (opacity + translateY). All other transitions use Tailwind's built-in `transition-*` utilities.

Respect `prefers-reduced-motion`: all animations degrade to instant state change.

---

## 3. Interaction Design Patterns

### 3.1 Pattern Taxonomy

Every tool maps to one of five interaction patterns:

| Pattern | Name | Core Principle | Visual Center |
|---------|------|---------------|---------------|
| **A** | Canvas | Direct manipulation on content | The image/document IS the workspace |
| **B** | Live Compare | Real-time parameter / preview feedback | Before/after split view |
| **C** | Thumbnail Grid | Select, sort, and operate on content units | Page/file thumbnail array |
| **D** | Instant Convert | Drop and done, zero-config | Progress and status feedback |
| **E** | Live Editor | Type and see results update in real-time | Text area + live stats panel |

### 3.2 Tool -> Pattern Mapping

| Tool | Pattern | Run Mode | Key Interaction |
|------|---------|----------|----------------|
| Image Compress | **B** Live Compare | manual | Comparison slider + quality slider |
| Mosaic | **A** Canvas | none | Paint/draw mosaic regions (client-only) |
| Remove Background | **B** variant | auto | Auto-process, checkerboard transparency |
| Scan Enhance | **B** Live Compare | auto | Auto-enhance, side-by-side |
| HEIC -> JPG | **D** Instant | auto | Drop -> auto convert -> batch progress |
| Format Convert | **D** Instant | auto | Select format -> drop -> auto convert |
| PDF Tools | **C** Thumbnail Grid | manual | Unified workspace, reorder/rotate/delete |
| ID Photo | **A** Canvas | manual | Compliance guide overlay, drag-to-position |
| Word Counter | **E** Live Editor | none | Text area left, live stats right |

### 3.3 Run Mode Definitions

| Run Mode | Action Bar Behavior | Tools |
|----------|-------------------|-------|
| **auto** | No "Process" button. Processing starts on upload. | Remove BG, Scan Enhance, HEIC->JPG, Format Convert |
| **manual** | "Process" button visible. User configures then submits. | Image Compress, PDF Tools, ID Photo |
| **none** | No action bar. Tool is entirely client-side. | Mosaic, Word Counter |

### 3.4 Drag-and-Drop File Interaction

All file-accepting tools share a consistent drag-and-drop behavior:

**Drop zone scope:**
- Workspace-level drop zone -- the entire workspace area accepts drops
- Empty state IS the drop zone
- After files loaded, workspace still accepts drops (for multi-file tools)

**Visual feedback by drag phase:**

| Phase | Visual Change |
|-------|--------------|
| `dragenter` | Drop zone border changes to dashed; background tints to muted |
| `dragover` | Sustained highlight state; cursor shows copy indicator |
| `dragleave` | Revert to default state |
| `drop` | Brief flash; file processing begins |

**Behavioral rules:**
- **Single-file tools** (Compress, Remove BG, Scan Enhance): dropping replaces current
- **Multi-file tools** (PDF Tools, HEIC->JPG, Format Convert): dropping adds to list
- **Invalid file type**: border flashes `--destructive` briefly, inline error appears
- **Click fallback**: all drop zones also function as click-to-browse via hidden `<input type="file">`

**Mobile adaptation:**
- Drop zones show a prominent "Browse files" button
- Touch-and-hold on existing items triggers selection mode

---

## 4. Per-Tool Interaction Design

Individual tool designs are maintained in separate files:

| Tool | File |
|------|------|
| Image Compress | [docs/spec/tools/compress.md](tools/compress.md) |
| Mosaic | [docs/spec/tools/mosaic.md](tools/mosaic.md) |
| Remove Background | [docs/spec/tools/remove-bg.md](tools/remove-bg.md) |
| Scan Enhance | [docs/spec/tools/scan-enhance.md](tools/scan-enhance.md) |
| HEIC->JPG / Format Convert | [docs/spec/tools/format-convert.md](tools/format-convert.md) |
| PDF Tools | [docs/spec/tools/pdf-tools.md](tools/pdf-tools.md) |
| ID Photo | [docs/spec/tools/id-photo.md](tools/id-photo.md) |
| Word Counter | [docs/spec/tools/word-counter.md](tools/word-counter.md) |

---

## 5. Visual Differentiation

### 5.1 Tool Icons

Each tool has a unique icon from the Lucide icon set:

| Tool | Icon | Rationale |
|------|------|-----------|
| Image Compress | `Minimize2` | Visually represents shrinking |
| Mosaic | `Grid3x3` | Pixelated grid effect |
| Remove BG | `Eraser` | Removing/erasing background |
| Scan Enhance | `ScanLine` | "Scan" concept |
| HEIC -> JPG | `FileImage` | Image file output |
| Format Convert | `ArrowRightLeft` | Conversion between formats |
| PDF Tools | `Layers` | Working with pages/layers |
| ID Photo | `Camera` | Photo capture |
| Word Counter | `Type` | Text/typing input |

### 5.2 Empty States

Each tool's empty state:
```
+-------------------------------------------+
|                                           |
|    Drag image here or click to upload     |
|    Supports JPG, PNG, WebP up to 20MB     |
|                                           |
|         [ Browse files ]                  |
+-------------------------------------------+
```

- Simple icon + description text, no complex illustrations
- Mobile: prominent "Browse files" button

---

## 6. Page Design

### 6.0 Home Page

**Decision: Hero + all tools by category (flat 2-level navigation)**

Home page directly shows ALL tools grouped by category. Users click a tool and go directly to its workspace.

**Hero section:**
- Compact (120-160px tall)
- Brand name + one-line value proposition
- Optional trust indicators ("Files processed locally", "No sign-up needed")

**Tool cards:**
- Tool name (semibold) + one-line description (muted)
- Hover: subtle background color change (`hover:bg-muted/50`)

**Navigation:**
- "Back" button on tool pages links back to home `/`
- Breadcrumb: Home > Tool Name (no category level)

### 6.1 Page Structure

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
| Footer (not on tool pages -- action bar takes over) |
+---------------------------------------------------+
```

### 6.2 ToolPageShell Layout Modes

```
compact:    Single column, max-w-4xl
            For simple tools (format convert, text tools)

split:      Two equal columns on lg+
            For tools with input controls + preview sidebar

workspace:  60/40 split on xl+
            For complex tools (PDF, mosaic, ID photo)
```

### 6.3 Action Bar & Result Panel

**Fixed bottom action bar + bottom popup result panel**

- Always visible at the bottom of the viewport
- Contains: status info (left), primary action button (right)
- During processing: progress bar
- Translucent background with backdrop-blur
- On mobile: full width, comfortable touch target height (48-56px)

**Result Panel (slides up from bottom):**
- Overlays the action bar when processing completes
- Shows: result preview, file info, download button
- "Process another" to dismiss and return
- Panel height adapts to content, max ~40vh

### 6.4 Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| < 640px (mobile) | Single column, full-width workspace, bottom-fixed action bar |
| 640-1024px (tablet) | Single column or compact split |
| 1024px+ (desktop) | Full split/workspace layout |

---

## 7. Accessibility

- All interactive elements have visible focus states (ring)
- Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text/UI)
- All animations respect `prefers-reduced-motion`
- Canvas tools provide keyboard alternatives
- File drop zones also have click-to-browse fallback
- Screen reader announcements for processing status changes (via `aria-live`)

**Icon accessibility:**
- **Decorative icons** (next to text): `aria-hidden="true"`
- **Icon-only buttons**: MUST have `aria-label`
- **Status icons**: `role="img"` + `aria-label`

---

## 8. Error & Exception States

### 8.1 Error State Matrix

| Trigger | Message Pattern | CTA | Recoverable? |
|---------|----------------|-----|-------------|
| File too large | "File exceeds {max}MB limit" | "Choose a smaller file" | Yes |
| Unsupported format | "Format not supported. Use {formats}" | "Choose another file" | Yes |
| Upload failed (network) | "Upload failed. Check your connection." | [Retry] | Yes |
| Processing failed | "Processing failed. Please try again." | [Retry] | Yes |
| Processing timeout | "Processing timed out." | [Retry] | Maybe |
| Batch partial failure | "3 of 5 files failed" | [Retry failed] [Download successful] | Yes |
| Auth required | "Sign in to use this tool" | [Sign in] [Register] | Yes |
| Insufficient credits | "Not enough credits" | [Buy credits] | Yes |
| Rate limited | "Too many requests. Wait a moment." | Auto-dismiss | Yes |
| File corrupt | "File could not be read" | [Upload a different file] | Yes |

### 8.2 Error Visual Design

- Background: `--destructive-light`
- Border: `--destructive` at 20% opacity
- Icon: `XCircle` or `AlertTriangle` in `--destructive`
- Errors appear **in context** (near the action that caused them)
- Error messages are **specific and actionable**
- Error state never destroys user work

---

## 9. Internationalization (i18n)

### 9.1 Translation Key Conventions

```
Namespace structure:
  common.json    shared UI (nav, actions, preview labels)
  tools.json     image tools + PDF tools
  textTools.json text tool specific
  idPhoto.json   ID photo specific

Key naming pattern:
  {feature}.{component}.{element}
```

### 9.2 Text Length Constraints

| Element | Max chars (EN) | Max chars (ZH) |
|---------|---------------|----------------|
| Button label | 20 | 8 |
| Tool card title | 25 | 10 |
| Tool card description | 80 | 40 |
| Action bar status | 50 | 25 |
| Page title (h1) | 40 | 16 |

### 9.3 Localization Rules

- Numbers: `Intl.NumberFormat` for locale-aware formatting
- File sizes: `formatBytes()` utility (KB/MB)
- Dates: `Intl.DateTimeFormat` with locale from i18n
- Pluralization: i18next `count` interpolation
- No string concatenation -- use full sentence keys with interpolation
- Fallback chain: zh-CN -> en

---

## 10. Performance Budget

### 10.1 Loading Performance

| Metric | Target |
|--------|--------|
| First Contentful Paint (FCP) | < 1.5s (4G) |
| Largest Contentful Paint (LCP) | < 2.5s (4G) |
| Total blocking time (TBT) | < 200ms |
| Initial JS bundle (gzipped) | < 200KB |

### 10.2 Runtime Performance

| Interaction | Target |
|-------------|--------|
| Canvas preview update (mosaic, compress slider) | < 16ms (60fps) |
| Text stats update on keystroke | < 50ms |
| PDF thumbnail render per page | < 200ms |
| Comparison slider drag | 0ms perceived lag |
| File drop zone response | < 100ms |

### 10.3 Asset Budgets

| Asset type | Budget |
|-----------|--------|
| Tool illustration SVG | < 5KB each |
| Lucide icons (tree-shaken) | ~200B each |
| Source Sans 3 font (4 weights, woff2) | ~60KB via @fontsource |
| Source Code Pro font (2 weights, woff2) | ~30KB via @fontsource |

### 10.4 Minimum Device Target

- **Mobile:** 2019+ mid-range Android (4GB RAM)
- **Desktop:** Chrome/Firefox/Safari/Edge, last 2 major versions
- **Network:** Functional on 3G; optimized for 4G+

---

## 11. Tool Naming & Routing Map

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
- Route paths: kebab-case
- Component names: PascalCase
- i18n key prefixes: camelCase
- Documentation references: Product Name (EN)

---

## 12. Decisions Log

| Decision | Choice | Section |
|----------|--------|---------|
| Color strategy | Monochrome -- no brand accent in UI, no category colors | 1.2 |
| Brand indigo | Logo only (hardcoded `#4F46E5`), not a design token | 1.2 |
| Visual tone | Minimal-neutral, content-first | 1.3 |
| Typography | Source Sans 3 + System CJK, loaded via @fontsource | 2.2 |
| Animation | Minimal -- one `fade-in` keyframe, Tailwind transitions only | 2.5 |
| Empty states | Simple icon + description text | 5.2 |
| Home page | Hero + all tools by category | 6.0 |
| Navigation depth | 2 levels: Home -> Tool | 6.0 |
| Header | Minimal -- Logo + user actions only | 6.1 |
| Action bar | Fixed bottom, auto/manual/none modes | 6.3 |
| Error handling | In-context, specific & actionable messages | 8 |
| UI component library | shadcn/ui (new-york), Tailwind CSS v4, oklch | 1.4 |
| Per-tool design | Separate files in `docs/spec/tools/` | 4 |

---

## 13. Open Items

1. **Dark mode polish** -- Dark mode is functional but not refined
2. **Mobile gesture details** -- Swipe-to-dismiss, bottom sheet specifics for canvas tools
3. **Prerender plugin** -- Evaluate build-time prerendering for SEO (replacing custom Vite SEO plugin)
4. **ThemeProvider** -- Replace `next-themes` with custom Vite-native ThemeProvider
5. **View Transitions** -- Adopt React 19 `<ViewTransition>` when stable
