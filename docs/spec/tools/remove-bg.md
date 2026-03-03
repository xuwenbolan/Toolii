# Remove Background

Status: draft | Updated: 2026-03-03

**Pattern:** B variant - Instant Result | **Run Mode:** auto

## Layout

Single result view with background options.

```
+---------------------------------------------------+
|  +-----------------------------------------------+|
|  |                                                ||
|  |         +------------+                         ||
|  |         |   Subject  |  (checkerboard =        ||
|  |         |            |   transparent)           ||
|  |         +------------+                         ||
|  |                                                ||
|  +-----------------------------------------------+|
|                                                     |
|  Background: [Transparent] [White] [Custom]  [Download PNG] |
+---------------------------------------------------+
```

## Interactions

- Upload -> **auto-process immediately**, no "start" button
- Loading state: skeleton pulse over the image area
- Result appears with **checkerboard pattern** for transparent areas
- Bottom bar: switch background -- transparent (checkerboard), white, solid color picker
- Compare with original: hold/click toggle to flash original image
- Future enhancement: brush tool for manual edge refinement

## Why Auto-Process

Background removal needs zero parameters. Any extra step is friction. The user expectation is "upload and it's done."
