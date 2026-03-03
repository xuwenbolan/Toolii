# Image Compress

Status: draft | Updated: 2026-03-03

**Pattern:** B - Live Compare | **Run Mode:** manual

## Layout

Full-width workspace, image as visual center.

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

## Interactions

- Upload -> image fills workspace immediately, becomes visual center
- **Image Comparison Slider** -- vertical divider dragged left/right to compare original vs compressed
- Quality slider -> right side preview + estimated file size update **in real-time** (client-side Canvas compression for preview, no backend call)
- File sizes shown as floating labels on bottom-left (original) and bottom-right (compressed)
- Final submit calls backend for accurate result
- Result replaces the preview; slider now compares original vs final output

## Why This Pattern

Compression is a quality-vs-size tradeoff. Users MUST see the difference to make a decision. Numbers alone are meaningless.
