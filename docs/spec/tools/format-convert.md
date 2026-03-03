# HEIC to JPG / Format Convert

Status: draft | Updated: 2026-03-03

**Pattern:** D - Instant Convert | **Run Mode:** auto

## Layout

Drop zone -> batch progress grid.

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

## Interactions

- **Drop -> immediately start converting**, zero extra steps
- Batch support: multiple files shown as thumbnail grid
- Each file card shows status: waiting -> spinning -> checkmark
- Overall progress bar at bottom
- Individual download per file, or batch ZIP download when all complete
- For generic format convert: format selector shown before/after drop

## Why This Pattern

Format conversion has nothing to "see." Users want speed. Make the conversion process itself the visual experience (watching files complete one by one).
