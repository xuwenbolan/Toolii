# Toolii Frontend Design Spec Compliance Audit

Status: final | Updated: 2026-03-10

> Audit of existing frontend code against the [Frontend Design Specification](frontend-design.md).
> Scope: design tokens, interaction patterns, motion/accessibility, responsive layout, i18n.
> No code changes were made -- this document records gaps only.

---

## 1. Design Token Consistency

| File / Component | Spec Section | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| `hooks/useShareCard.ts` | 2.1 Colors via CSS vars | 20+ hardcoded hex/rgba (`#1f2937`, `#4b5563`, `rgba(180,155,110,0.14)`, etc.) | Canvas drawing uses hardcoded colors instead of reading CSS variables | Medium |
| `components/ui/input.tsx` | 2.1 Colors via CSS vars | `focus-visible:shadow-[0_0_0_3px_rgba(14,165,233,0.08)]` | Focus shadow uses hardcoded rgba; should use `--ring` variable | Medium |
| `components/ui/select.tsx` | 2.1 Colors via CSS vars | `focus:shadow-[0_0_0_3px_rgba(14,165,233,0.08)]` | Same as input.tsx | Medium |
| `components/tools/ImageCompareSlider.tsx` | 2.1 Colors via CSS vars | `shadow-[0_0_0_1px_rgba(0,0,0,0.18)]` | Shadow uses hardcoded rgba | Minor |
| `components/idPhoto/PhotoPreview.tsx` | 2.1 Colors via CSS vars | 5x `shadow-[0_0_0_1px_rgba(15,23,42,0.xx)]` | Multiple shadows with hardcoded rgba | Medium |
| `components/tools/ToolPageShell.tsx` | 2.1 Colors via CSS vars | `rgba(80,120,170,0.15)` radial gradient | Decorative gradient uses hardcoded color | Minor |
| `components/tools/ToolWorkspaceDropzone.tsx` | 2.1 Colors via CSS vars | `rgb(0_0_0/0.05)` dot pattern | Background pattern uses hardcoded color | Minor |
| `components/tools/BeforeAfterPreview.tsx` | 2.1 Colors via CSS vars | `rgba(120,120,120,0.18)` dot pattern | Background pattern uses hardcoded color | Minor |
| `components/tools/ArtifactPreviewCard.tsx` | 2.1 Colors via CSS vars | `rgba(120,120,120,0.18)` dot pattern | Same as BeforeAfterPreview | Minor |
| `pages/ImageTools/RemoveBgPage.tsx` | 2.1 Colors via CSS vars | `rgba(120,120,120,0.12)` checkerboard | Transparency checkerboard uses hardcoded color | Minor |
| `pages/ImageTools/SegmentPage.tsx` | 2.1 Colors via CSS vars | `rgba(59,130,246,0.7)` canvas overlay | Canvas overlay uses hardcoded blue | Minor |
| `pages/FaceMap/components/GeneCard.tsx` | 2.1 Colors via CSS vars | `rgba(180,140,100,0.2)` radial gradient | Decorative gradient uses hardcoded color | Minor |
| `App.css` | 2.1 Colors via CSS vars | `#646cffaa`, `#61dafbaa`, `#888` | Legacy stylesheet with hardcoded colors | Minor |
| `components/editor/typora-editor.css` | 2.1 Colors via CSS vars | 13x hardcoded hex (`#000`, `#ccc`, `#f5f5f5`, etc.) | Print styles and editor styles use hardcoded colors | Medium |
| 15+ admin/dashboard files | 2.2 Type scale | `text-[10px]`, `text-[11px]` arbitrary values | Should use `text-xs` (0.75rem) or `text-sm` (0.875rem) | Minor |
| `components/idPhoto/PhotoPreview.tsx` | 2.3 Border radius base=10px | `rounded-[6px]` | Non-standard radius, not in 10px-based scale | Minor |

---

## 2. Interaction Pattern Compliance

### 2.1 Shared Components

All five required shared components exist in `components/tools/`:

- `ToolPageShell.tsx` -- page container with layout modes (compact, split, workspace)
- `ToolActionBar.tsx` -- bottom-fixed action bar with status and CTA
- `ToolResultPanel.tsx` -- bottom-sliding result panel
- `ToolErrorBanner.tsx` -- contextual error/warning banner
- `ToolWorkspaceDropzone.tsx` -- drop zone with drag-and-drop feedback

### 2.2 Tool Page Matrix

| Tool Page | Pattern | Run Mode | State Trio | useFileUpload | useToolRunState | Component Structure | ErrorBanner | Status |
|---|---|---|---|---|---|---|---|---|
| CompressPage | B | manual | OK | OK | OK | OK | OK (inside Shell) | Compliant |
| RemoveBgPage | B | manual | OK | OK | OK | OK | OK (inside Shell) | Compliant |
| InpaintPage | A | manual | OK | OK | OK | OK | OK (inside Shell) | Compliant |
| ColorizePage | B | manual | OK (via hook) | OK (via hook) | OK (via hook) | OK | OK (inside Shell) | Compliant |
| WordCounterPage | E | none | OK | N/A | N/A | OK | N/A | Compliant |
| ScanEnhancePage | B | manual | OK | OK | OK | **Uses FileDropzone** | OK | Non-compliant |
| UpscalePage | B | manual | OK | OK | OK | **Uses FileDropzone** | OK | Non-compliant |
| DenoisePage | B | manual | OK (via hook) | OK (via hook) | OK (via hook) | **Uses FileDropzone** | OK | Non-compliant |
| RestoreFacePage | B | manual | OK (via hook) | OK (via hook) | OK (via hook) | **Uses FileDropzone** | OK | Non-compliant |
| SegmentPage | A | manual | Partial | Custom | OK | OK | **Missing** | Non-compliant |
| MosaicPage | A | none | Partial | No upload | OK | OK | **Missing** | Non-compliant |
| OcrPage | E | auto | Custom | Custom | OK | OK | **Missing** | Non-compliant |
| ConvertForm | D | auto | Batch array | Manual progress | OK | OK | OK | Partial |
| PdfToolsPage | C | manual | OK | OK | OK | **No ToolPageShell** | OK | Non-compliant |
| IdPhotoPage | A+B | manual | Multi-step | Custom | **Missing** | Custom panels | OK | Partial |
| FaceSimilarityPage | B | manual | Custom | Custom | OK | **No ToolPageShell** | OK | Non-compliant |
| FaceMapPage | B | auto | OK | OK | OK | OK | OK | Partial |

### 2.3 Interaction Pattern Gaps

| File / Component | Spec Section | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| ScanEnhancePage | 4.1 Use ToolWorkspaceDropzone | Uses FileDropzone | Missing spec-required drag animations (breathe, scale, shake) | Critical |
| UpscalePage | 4.1 Use ToolWorkspaceDropzone | Uses FileDropzone | Same as above | Critical |
| DenoisePage | 4.1 Use ToolWorkspaceDropzone | Uses FileDropzone | Same as above | Critical |
| RestoreFacePage | 4.1 Use ToolWorkspaceDropzone | Uses FileDropzone | Same as above | Critical |
| PdfToolsPage | 4.1 Shell->ActionBar->ResultPanel | No ToolPageShell wrapper | Custom grid layout instead of standard page shell | Critical |
| FaceSimilarityPage | 4.1 Shell->ActionBar->ResultPanel | No ToolPageShell; custom dropzones | Completely custom layout, no standard drop zone feedback | Critical |
| SegmentPage | 4.1 ToolErrorBanner inside Shell | Custom inline error state | No standard ToolErrorBanner component | Medium |
| MosaicPage | 4.1 ToolErrorBanner inside Shell | No error banner at all | Client-side canvas tool lacks error display | Medium |
| OcrPage | 4.1 ToolErrorBanner inside Shell | No standard ToolErrorBanner | Custom multi-page state management diverges from spec | Medium |
| ConvertForm | 4.1 State trio | Uses batch items[] array | No explicit `resultPanelOpen` boolean; manual progress tracking | Medium |
| IdPhotoPage | 4.1 useToolRunState | Not used | Multi-step workflow has no run state hook | Medium |
| FaceSimilarityPage | 3.3 ToolWorkspaceDropzone | Custom dropzone implementation | No spec-compliant drag feedback | Medium |

---

## 3. Motion & Accessibility

### 3.1 Motion

| File / Component | Spec Section | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| Global CSS | 2.5 @keyframes `shake` | **Not defined** | Animation referenced in ToolErrorBanner and ToolWorkspaceDropzone but has no @keyframes -- will not render | Critical |
| Global CSS | 2.5 @keyframes `breathe` | **Not defined** | Animation referenced in ToolWorkspaceDropzone idle state but has no @keyframes | Critical |
| Global CSS | 2.5 @keyframes `icon-bounce` | **Not defined** | Animation referenced in ToolWorkspaceDropzone active state but has no @keyframes | Critical |
| Global CSS | 2.5 @keyframes `section-in` | **Not defined** | Animation referenced in ToolPageShell, FaceMapPage, MobileNav but has no @keyframes | Critical |
| `components/tools/ToolResultPanel.tsx` | 2.5 Enter: translateY 100%->0, 250ms ease-out; Exit: 0->100%, 200ms ease-in | `translate-y-6` (6px); both directions use `--duration-normal` + `--ease-out` | translateY should be 100% not 6px; exit should be 200ms ease-in (not 250ms ease-out) | Critical |
| `components/tools/ToolWorkspaceDropzone.tsx` | 2.5 Active: scale 1->1.05 | `scale-[1.01]` (1% increase) | Scale should be 1.05 (5%) not 1.01 (1%) | Medium |
| `components/tools/ToolWorkspaceDropzone.tsx` | 2.5 Idle: breathing pulse, 2s loop | `breathe_3s` + `--ease-in-out` (undefined) | Duration should be 2s not 3s; `--ease-in-out` CSS variable is not defined | Medium |
| `components/tools/ToolErrorBanner.tsx` | 2.5 Shake 300ms ease-out | `shake_0.45s` (450ms) | Duration should be 300ms not 450ms | Medium |
| `index.css` | 2.5 Page transition 250ms ease-out | `fade-in 0.4s ease-out` | Duration should be 250ms not 400ms | Medium |
| `components/ui/card.tsx` | 2.5 Card hover: bg-color 150ms linear | No hover transition defined | Card hover background transition completely missing | Medium |
| Hover/focus transitions | 2.5 Always 150ms | button.tsx uses `--duration-fast` (150ms) correctly | Compliant | -- |
| Progress bar fill | 2.5 width, 150ms linear | ToolActionBar uses `--duration-fast` + `ease-linear` | Compliant | -- |
| prefers-reduced-motion | 2.5 Global response | index.css:227-235 + `motion-safe:` prefix throughout | Compliant | -- |

### 3.2 Accessibility

| File / Component | Spec Section | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| `components/tools/DownloadButton.tsx` | 7 Decorative icons need aria-hidden | `Loader2`/`Download` icons lack `aria-hidden` | Icons next to text should have `aria-hidden="true"` | Medium |
| `components/tools/ShareResultButton.tsx` | 7 Decorative icons need aria-hidden | `Check`/`Copy` icons lack `aria-hidden` | Same | Medium |
| `components/tools/ShareTransferButton.tsx` | 7 Decorative icons need aria-hidden | `Check`/`Copy`/`Loader2` lack `aria-hidden` | Same | Medium |
| `components/tools/ToolActionBar.tsx` | 7 Decorative icons need aria-hidden | `Loader2`/`Coins` icons lack `aria-hidden` | Same | Medium |
| `components/tools/GatedDownloadButton.tsx` | 7 Decorative icons need aria-hidden | `Coins` icon lacks `aria-hidden` | Same | Medium |
| 15+ Dashboard/Transfer pages | 7 Decorative icons need aria-hidden | Widespread missing `aria-hidden` on icons next to text labels | Buttons with icon+text generally lack aria-hidden on icon | Medium |
| `pages/Transfer/TransferCreatePage.tsx` | 7 Icon-only buttons need aria-label | Delete file button (Trash2 icon) has no aria-label | Icon-only button must have aria-label | Critical |
| `components/common/ShareLinkDialog.tsx` | 7 Icon-only buttons need aria-label | Copy button has no aria-label | Same | Critical |
| `components/tools/ToolActionBar.tsx` | 7 Processing status needs aria-live | Status text area has no `aria-live` attribute | Processing status changes should be announced via aria-live | Critical |
| Focus states | 7 Visible focus rings | All interactive elements use `focus-visible:ring-*` | Compliant | -- |
| Color contrast | 7 WCAG AA | oklch values provide sufficient contrast ratios | Compliant | -- |

---

## 4. Responsive & Layout

| File / Component | Spec Section | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| ToolPageShell | 6.2 Three layout modes | compact (`max-w-4xl`), split (equal cols at lg), workspace (60/40 at xl) | Compliant | -- |
| Header | 6.1 Sticky 56px + backdrop-blur | `h-14 sticky top-0 backdrop-blur` (h-14 = 3.5rem = 56px) | Compliant | -- |
| ToolActionBar | 6.3 Fixed bottom | `fixed inset-x-0 bottom-0 backdrop-blur-md` + safe-area-inset handling | Compliant | -- |
| ToolResultPanel | 6.3 Max ~70vh | `max-h-[70vh]` | Compliant | -- |
| `components/ui/button.tsx` | 6.4 Mobile touch targets 48-56px | sm: `h-8` (32px), default: `h-9` (36px), lg: `h-10` (40px) | **All button sizes below 48px minimum** for mobile touch targets | Critical |
| All tool pages | 6.5 Block navigation during processing | **Not implemented** (only DocEditorPage has beforeunload) | No `beforeunload` event, no `useBlocker` on any tool page | Critical |
| All tool pages | 6.5 Warn on undownloaded results | **Not implemented** | No soft warning when navigating away with available results | Critical |

---

## 5. i18n & Text Boundaries

| File / Component | Spec Section | Current Implementation | Gap | Severity |
|---|---|---|---|---|
| 20 tool pages (breadcrumbs) | 9 All user-facing text via i18n | `{ name: 'Home', path: '/' }` hardcoded string | Should use `t('nav.home')` -- translation key already exists in common.json | Critical |
| i18n key pattern | 9 `{feature}.{component}.{element}` | Keys follow convention (e.g., `compress.title`, `idPhoto.upload.processing`) | Compliant | -- |
| Namespace usage | 9 tools/common separation | `['tools', 'common']` dual namespace in useTranslation calls | Compliant | -- |
| String concatenation | 9 No concatenation, use interpolation | Uses `t('key', { var })` interpolation | Compliant | -- |
| Translation file structure | 9 Consistent zh-CN/en | Both languages have matching key structures | Compliant | -- |

---

## Summary

### By Severity

| Severity | Count |
|---|---|
| Critical | **16** |
| Medium | **17** |
| Minor | **12** |
| **Total** | **45** |

### Top 5 Issues

| Rank | Issue | Scope | Severity |
|---|---|---|---|
| **1** | **Missing @keyframes** (shake, breathe, icon-bounce, section-in) -- animations referenced but never defined, will not render in browsers | ToolErrorBanner, ToolWorkspaceDropzone, ToolPageShell, FaceMapPage, MobileNav | Critical |
| **2** | **FileDropzone instead of ToolWorkspaceDropzone** -- 4 tool pages use non-standard dropzone, lacking spec-required drag animations | ScanEnhance, Upscale, Denoise, RestoreFace | Critical |
| **3** | **Navigation guards completely missing** -- no beforeunload, no useBlocker on any tool page | All ~17 tool pages | Critical |
| **4** | **Hardcoded color values** -- rgba/hex colors scattered across components and canvas drawing code | useShareCard (20+), input/select shadows, background patterns, editor styles | Medium |
| **5** | **Decorative icons missing aria-hidden** -- icons next to button text generally lack accessibility marking | DownloadButton, ShareResultButton, ToolActionBar, 15+ Dashboard pages | Medium |

### Recommended Fix Priority

1. Define missing @keyframes in `index.css` (shake, breathe, icon-bounce, section-in)
2. Migrate ScanEnhance/Upscale/Denoise/RestoreFace from FileDropzone to ToolWorkspaceDropzone
3. Implement navigation guards (useBlocker + beforeunload) as a shared hook for all tool pages
4. Fix ToolResultPanel enter/exit animation (translateY 100%, exit timing)
5. Add aria-hidden to decorative icons; add aria-label to icon-only buttons; add aria-live to ToolActionBar
6. Replace hardcoded color values with CSS variables
7. Address mobile touch target sizing (button heights below 48px)
