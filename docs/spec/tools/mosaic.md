# Mosaic

Status: draft | Updated: 2026-03-03

**Pattern:** A - Canvas | **Run Mode:** none

## Layout

Image as canvas, minimal floating toolbar.

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

## Interactions

- Image IS the canvas, occupies main workspace area
- Compact toolbar above canvas: **Rectangle select** (draw rect -> fill mosaic), **Brush** (freehand paint mosaic), **Eraser** (remove mosaic from area)
- Cursor changes to crosshair/brush when over canvas
- Drag to draw -> mosaic rendered **in real-time** on HTML Canvas, zero latency
- Parameters (block size, blur strength) on toolbar via small inline sliders; adjusting updates existing mosaic regions live
- Full undo/redo stack (operation-level, not pixel-level)
- **Entirely client-side** -- no backend needed

## Why This Pattern

Mosaic requires precise spatial targeting. Only direct canvas manipulation allows users to specify exactly where to apply the effect.
