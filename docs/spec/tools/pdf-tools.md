# PDF Tools

Status: draft | Updated: 2026-03-03

**Pattern:** C - Unified Workspace | **Run Mode:** manual

## Concept

All PDF operations (merge, reorder, rotate, delete, extract, compress) happen in a single visual workspace. Users add files, manipulate pages via thumbnail grid, and export with the desired operations applied.

## Layout

Page thumbnail grid as primary workspace.

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
|  8 pages - 3 files - 4.2 MB          [Clear all]   |
+---------------------------------------------------+
|  Floating selection bar (when pages selected):      |
|  2 selected | [Rotate] [Delete] [Extract] | [All] X|
+---------------------------------------------------+
```

## Workspace Interactions

- **Add files:** Drop or browse to add PDF files and images (images auto-convert to PDF via backend)
- **Multi-source merge:** Adding multiple files automatically interleaves all pages into one flat grid
- **Thumbnail grid:** Each page rendered as a thumbnail with page number and source file indicator
- Click to select/deselect pages (highlighted border on selected)
- Drag-and-drop reorder with drag ghost and insertion line indicator
- **Per-page quick actions:** Hover reveals rotate button on thumbnail corner; right-click/long-press for context menu (rotate 90/180/270, delete)
- Rotate action -> thumbnail visually rotates in-place with CSS transform
- Delete action -> thumbnail fades out and collapses

## Selection Actions (Floating Bottom Bar)

- Appears when one or more pages are selected
- **Rotate selected** -- rotate all selected pages 90 degrees clockwise
- **Delete selected** -- remove selected pages from workspace
- **Extract selected** -- export only the selected pages as a new PDF
- **Select All / Deselect All** toggle
- Dismiss (X) to clear selection

## Export Flow

1. Merge: if multiple source files, merge into one PDF
2. Reorder: apply the page order as arranged in the grid
3. Rotate: apply any per-page rotation
4. Compress (optional): if user clicks "Compress & Export"
5. Download the final result

Each step shows progress in the processing indicator bar.

## Status Bar

- Page count, file count, total size
- "Clear all" to reset workspace

## Why Unified Workspace

PDF operations are inherently combinatorial -- users frequently need to merge + reorder + delete + rotate in one session. Splitting into separate tools forces re-uploading and re-processing. The unified workspace lets users do everything in one flow.
