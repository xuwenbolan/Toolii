# Scan Enhance

Status: draft | Updated: 2026-03-03

**Pattern:** B - Before/After | **Run Mode:** auto

## Layout

Side-by-side comparison.

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

## Interactions

- Upload -> auto-enhance with default mode, show side-by-side
- Three preset modes (no complex parameters): Auto, B&W Document, Color Document
- Switching preset -> right side updates (backend call per mode change, with loading state)
- Can also use comparison slider instead of side-by-side
