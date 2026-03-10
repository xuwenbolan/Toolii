# Toolii Frontend Design Specification

Status: final | Updated: 2026-03-10

> Visual identity, interaction patterns, and per-tool design for the Toolii frontend.

---

## 1. Design Philosophy

### 1.1 Quiet Surface, Crafted Touch

The interface is calm -- generous whitespace, neutral tones, content at the center. But every interaction point is polished: hovers have transitions, entries have rhythm, state changes breathe. Restraint is not austerity; it is concentrating the attention budget on where the user's hands reach.

**Three principles:**

- **Whitespace is structure** -- organize with space, not lines or color blocks
- **Motion is feedback** -- every state change should be felt, but never waited for
- **Restraint is quality** -- one fewer element means one more detail polished

### 1.2 Color Strategy

Neutral foundation, color carries meaning.

- **Base palette** -- black/white/gray, driven by CSS variables
- **Brand** -- indigo `#4F46E5` (logo only, not a design token)
- **Semantic** -- red/green/amber/blue for status (error, success, warning, info)
- Color should not compete with the user's content (images, documents, text)

Semantic color is a signal, not an alarm. It appears as a tinted background with a low-saturation icon -- like an indicator light that catches attention without startling. Full-saturation solid color is reserved for moments that demand immediate action (destructive confirmation, critical errors).

### 1.3 Visual Tone

- Light mode as default and primary design target
- Dark mode: supported via CSS variables
- Content-first -- the user's files are the visual center; UI chrome stays quiet
- Progressive disclosure -- reveal controls as needed, not all at once
- Personality comes from **typography, spacing, motion** -- not from color

### 1.4 UI Foundation

[shadcn/ui](https://ui.shadcn.com/) (new-york style) as the component layer: unstyled primitives that take direction from our design tokens, not the other way around.

Extend components by wrapping, not by modifying `ui/` source. All visual customization flows through CSS variables in `index.css`.

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

### 2.5 Motion & Timing

**Philosophy:** Motion is feedback, not decoration. Every transition should feel intentional -- quick enough to never block, smooth enough to feel crafted.

```
--duration-fast:    150ms    hover, color, opacity changes
--duration-normal:  250ms    panel enter/exit, layout shifts
--ease-out:         cubic-bezier(0.22, 1, 0.36, 1)   natural deceleration
```

**Guidelines:**
- Hover/focus transitions: always present, always fast (150ms)
- Element enter/exit: fade + subtle translate, ease-out
- Layout changes: smooth reflow, no hard jumps
- Loading states: skeleton shimmer or subtle pulse, not spinners
- Drag interactions: element locks to cursor/finger position, no trailing delay, no elastic catch-up
- Respect `prefers-reduced-motion`: degrade to instant state change

**Motion lookup table:**

| Element | Property | Values | Duration | Easing |
|---------|----------|--------|----------|--------|
| ToolResultPanel enter | translateY | 100% → 0 | 250ms | ease-out |
| ToolResultPanel exit | translateY | 0 → 100% | 200ms | ease-in |
| Dropdown / Popover | scaleY + opacity | 0.95/0 → 1/1 | 150ms | ease-out |
| Card hover | background-color | neutral shift | 150ms | linear |
| ToolWorkspaceDropzone idle | scale (icon) | breathing pulse | 2s loop | ease-in-out |
| ToolWorkspaceDropzone active | scale + border | 1→1.05, primary border | 150ms | ease-out |
| ToolWorkspaceDropzone reject | translateX | shake ±4px | 300ms | ease-out |
| ToolErrorBanner enter | translateX | shake ±4px | 300ms | ease-out |
| Page transition | opacity + translateY | 0/8px → 1/0 | 250ms | ease-out |
| Progress bar fill | width | 0% → n% | 150ms | linear |

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

### 3.2 Run Modes

Each tool operates in one of three run modes, which determines its action bar behavior:

| Run Mode | Action Bar Behavior |
|----------|-------------------|
| **auto** | No "Process" button. Processing starts on upload. |
| **manual** | "Process" button visible. User configures then submits. |
| **none** | No action bar. Tool is entirely client-side. |

### 3.3 Drag-and-Drop File Interaction

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

Individual tool designs are maintained in `docs/spec/tools/`. Tools without a dedicated spec file follow the generic pattern assigned by their interaction pattern (Section 3.1) and run mode (Section 3.2).

### 4.1 Code Skeletons

Every tool page follows the same structural formula. Below are two reference skeletons covering the most common combinations. New tools should copy the matching skeleton and fill in tool-specific logic.

**Pattern D (Instant Convert) + auto mode — simplest case:**

```tsx
export function HeicConvertPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<FileResult[]>([])
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const { pending, progress, error, errorMeta, reset, run } = useFileUpload()

  const runState = useToolRunState({
    mode: 'auto',
    hasInput: files.length > 0,
    hasResult: results.length > 0,
    pending,
    error,
    texts: { /* status strings */ },
  })

  // auto mode: trigger processing on file drop
  const handleFiles = async (incoming: File[]) => {
    reset()
    setFiles(incoming)
    const res = await run('/api/tools/image/heic-convert', incoming)
    setResults(res)
    setResultPanelOpen(true)
  }

  return (
    <>
      <ToolPageShell
        title={t('heicConvert.title')}
        description={t('heicConvert.description')}
        toolName="image/heic-convert"
        layout="compact"
      >
        <ToolWorkspaceDropzone
          accept={{ 'image/heic': ['.heic', '.heif'] }}
          multiple
          onFiles={handleFiles}
        />
        <ToolErrorBanner error={error} errorMeta={errorMeta} />
      </ToolPageShell>

      <ToolActionBar
        mode="auto"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        onViewResult={results.length ? () => setResultPanelOpen(true) : undefined}
      />

      <ToolResultPanel
        open={resultPanelOpen}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        {/* Download list */}
      </ToolResultPanel>
    </>
  )
}
```

**Pattern B (Live Compare) + manual mode — with sidebar controls:**

```tsx
export function CompressPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState(80)
  const [result, setResult] = useState<FileResult | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const { pending, progress, error, errorMeta, reset, run } = useFileUpload()

  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: { /* status strings */ },
  })

  const handleCompress = async () => {
    if (!file) return
    const res = await run('/api/tools/image/compress', [file], { quality })
    setResult(res)
    setResultPanelOpen(true)
  }

  return (
    <>
      <ToolPageShell
        title={t('compress.title')}
        description={t('compress.description')}
        toolName="image/compress"
        layout="workspace"
        width="wide"
        sidebar={
          <div className="space-y-4">
            <Slider value={[quality]} onValueChange={([v]) => setQuality(v)} />
          </div>
        }
      >
        <ToolWorkspaceDropzone
          accept={{ 'image/*': [] }}
          onFiles={(f) => { reset(); setFile(f[0] ?? null) }}
        />
        <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={handleCompress} />
        {file && result && <ImageCompareSlider before={file} after={result} />}
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        toolName="image/compress"
        ctaLabel={t('compress.startCompress')}
        ctaDisabled={!file || pending}
        onCta={handleCompress}
        onViewResult={result ? () => setResultPanelOpen(true) : undefined}
      />

      <ToolResultPanel
        open={Boolean(result && resultPanelOpen)}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        {/* Before/after comparison, download button */}
      </ToolResultPanel>
    </>
  )
}
```

**Skeleton checklist (applies to all patterns):**

1. State: `file(s)`, `result(s)`, `resultPanelOpen` — always these three
2. Hooks: `useFileUpload()` for upload state, `useToolRunState()` for status text
3. Structure: `<ToolPageShell>` → `<ToolActionBar>` → `<ToolResultPanel>` — always this order, siblings at top level
4. Error: `<ToolErrorBanner>` inside the shell, near the action that caused it
5. i18n: keys from `tools` namespace for tool-specific text, `common` for shared actions

---

## 5. Visual Differentiation

### 5.1 Icons

All icons come from `lucide-react`. Each tool's icon is configured in the backend `tools` table -- the database is the source of truth.

### 5.2 Empty States

Empty state is an invitation, not a blank.

- Minimal: one icon, one line of guidance, one action
- Tone: helpful, not urgent -- "drop a file here" rather than "you must upload"
- The drop zone IS the empty state -- no separate upload widget
- Mobile: prominent touch-friendly "Browse files" button

---

## 6. Page Design

### 6.0 Home Page

**Decision: Hero + all tools by category (flat 2-level navigation)**

Home page directly shows ALL tools grouped by category. Users click a tool and go directly to its workspace.

**Hero section:**
- Compact (120-160px tall)
- Brand name + one-line value proposition
- Optional trust indicators ("Files processed locally", "No sign-up needed")

**Tool category cards:**
- Responsive grid: 2 columns on small screens, 4 on wide screens
- Card: category name (semibold) + one-line description (muted)
- Hover: subtle background shift -- felt but not flashy
- Visibility: controlled by backend `toolStore`

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
- Panel height adapts to content, max ~70vh

### 6.4 Responsive Behavior

| Breakpoint | Behavior |
|-----------|----------|
| < 640px (mobile) | Single column, full-width workspace, bottom-fixed action bar |
| 640-1024px (tablet) | Single column or compact split |
| 1024px+ (desktop) | Full split/workspace layout |

**Per-pattern mobile adaptations:**

| Pattern | Desktop | Mobile (< 640px) |
|---------|---------|-------------------|
| **A** Canvas | Direct manipulation with mouse/trackpad | Pinch-to-zoom + pan; toolbar moves to bottom sheet |
| **B** Live Compare | Side-by-side split view | Stacked vertically; swipe or toggle to switch before/after |
| **C** Thumbnail Grid | Multi-column grid with hover actions | 2-column grid; long-press for selection mode |
| **D** Instant Convert | Single column, already compact | No change needed; dropzone shows prominent "Browse" button |
| **E** Live Editor | Side-by-side editor + stats panel | Stacked; stats panel collapses to summary bar, tap to expand |

### 6.5 In-Progress Navigation Guard

When the user has an active file or unsaved result and attempts to navigate away (browser back, clicking another tool, closing tab):

- **During processing**: block navigation with a confirmation dialog ("Processing in progress. Leave anyway?")
- **Result available but not downloaded**: show a soft warning ("You have an undownloaded result. Leave anyway?")
- **No active state**: navigate freely, no prompt
- Implementation: `beforeunload` event for tab close, route-level `useBlocker` for in-app navigation

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

## 8. Error States

**Principles:**
- Errors appear **in context** (near the action that caused them), not as global toasts
- Messages are **specific and actionable** -- tell the user what went wrong and what to do next
- Error state never destroys user work
- Prefer recoverable flows (retry, choose another file) over dead ends

**Visual treatment:**
- Background: `--destructive-light`
- Border: `--destructive` at 20% opacity
- Icon: `XCircle` or `AlertTriangle` in `--destructive`

---

## 9. Text & Localization

Text length must accommodate both EN and ZH without breaking layout:

| Element | Max EN | Max ZH |
|---------|--------|--------|
| Button label | 20 | 8 |
| Tool card title | 25 | 10 |
| Tool card description | 80 | 40 |
| Action bar status | 50 | 25 |
| Page title (h1) | 40 | 16 |

---

## 10. Open Items

1. **Dark mode polish** -- Functional but not refined
2. **Mobile gesture details** -- Swipe-to-dismiss, bottom sheet specifics for canvas tools
3. **View Transitions** -- Adopt React 19 `<ViewTransition>` when upgrading from React 18
