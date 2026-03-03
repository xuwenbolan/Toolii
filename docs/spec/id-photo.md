# Module 1: ID Photo Processing

Status: draft | Updated: 2026-03-03

Core monetization feature. Full pipeline from upload to printable output.

---

## Feature Set

| Feature | Description | Tech | Priority |
|---------|-------------|------|----------|
| Photo upload | Camera / album selection | Frontend upload + backend storage | P0 |
| Face detection | Auto-detect face position | MediaPipe Face Detection | P0 |
| Background replacement | White / blue / red backgrounds | rembg (multi-model tiers) | P0 |
| Auto crop | Crop to ID photo standards | Pillow + custom algorithm | P0 |
| Size standards library | Schengen / UK / China / US etc. | JSON config file | P0 |
| Compliance check | Head ratio, expression, lighting, angle | rembg contour + MediaPipe Face Mesh + rule engine | P0 |
| Layout output | Generate Boots 6x4 inch printable sheet | Pillow layout | P0 |
| Multi-photo layout | Multiple ID photos on one 6x4 sheet | Pillow layout algorithm | P1 |

---

## Background Removal Model Tiers (user-selectable)

| Tier | Model | Size | Speed | Quality | Use Case |
|------|-------|------|-------|---------|----------|
| Fast | silueta | ~43 MB | Fastest | Medium | Quick output, low requirements |
| Standard | u2net_human_seg | ~176 MB | Fast | Good | Daily use |
| HD | birefnet-portrait | ~973 MB | Slower | Excellent | Fine ID photo processing |

Note: "Fast" and "Standard" run on CPU (Backend local fallback). "HD" requires Cortex GPU service;
when Cortex is unavailable, falls back to "Fast" (silueta) automatically.

---

## Compliance Check Pipeline

```
User uploads photo
  -> rembg removes background -> person contour mask
  -> MediaPipe Face Mesh extracts facial landmarks
  -> Per-item rule checks
  -> Return non-compliant items with prompts
  -> All pass -> proceed to processing
```

| Check Item | Method | Fail Prompt |
|-----------|--------|-------------|
| No face / multiple faces | MediaPipe face detection count | "No face detected" / "Multiple faces detected" |
| Face angle tilted | Face Mesh pitch/yaw/roll, threshold violation | "Please face the camera directly" |
| Eyes closed | Eye landmarks EAR (Eye Aspect Ratio) | "Please open your eyes" |
| Mouth open | Upper/lower lip landmark distance ratio | "Please close your mouth" |
| Excessive expression | Mouth corner landmark upward amplitude | "Please maintain a neutral expression" |
| Too dark / too bright | Image brightness histogram | "Insufficient lighting" / "Excessive lighting" |
| Uneven lighting | Left/right face region brightness difference | "Uneven facial lighting" |
| Face too small / large | Face bounding box area ratio | "Please move closer/further" |
| Head/chin cropped | rembg contour + face landmarks at image edge | "Head is cropped" |
| Head proportion non-compliant | rembg contour top (head) + Face Mesh chin, head-to-image ratio | "Head proportion non-compliant, will auto-crop" |
| Eye position non-compliant | Face Mesh eye landmarks relative to image | "Eye position non-compliant, will auto-crop" |
| Insufficient resolution | Image pixels below minimum requirement | "Photo resolution too low" |

Note: Head top position is determined by the highest point of the rembg person contour mask
(MediaPipe Face Mesh landmarks only cover the forehead, not the top of the head/hair).

---

## Supported Photo Sizes (initial)

- Schengen visa: 35mm x 45mm
- UK visa/passport: 35mm x 45mm
- Chinese passport/visa: 33mm x 48mm
- US visa: 51mm x 51mm
- Japan visa: 35mm x 45mm (slightly different requirements)
