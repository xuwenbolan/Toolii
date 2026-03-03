# ID Photo

Status: draft | Updated: 2026-03-03

**Pattern:** A - Canvas with Guide Overlay | **Run Mode:** manual

## Layout

Photo canvas with compliance overlay.

```
+---------------------------------------------------+
|  Spec: [1-inch] [2-inch] [Passport] [Custom]       |
|  ------------------------------------------------- |
|  +-----------------------------------------------+ |
|  |         +- - - - - - - -+                     | |
|  |         :   head line    :                     | |
|  |         :  +----------+  :                     | |
|  |         :  |   Face   |  :  <-- guide overlay  | |
|  |         :  |   area   |  :                     | |
|  |         :  +----------+  :                     | |
|  |         :   chin line    :                     | |
|  |         +- - - - - - - -+                     | |
|  +-----------------------------------------------+ |
|                                                     |
|  Checks:  [x] Face detected  [x] Size OK  [ ] Background |
|                                                     |
|  Background: [White] [Blue] [Red]      [Generate]   |
+---------------------------------------------------+
```

## Interactions

- Select photo spec -> workspace shows **dashed compliance guide frame** (head top line, chin line, shoulder markers)
- Upload/capture photo -> photo appears inside guide frame
- User can **drag and pinch/scroll to reposition and scale** the photo within the frame
- Compliance checklist updates **in real-time**: face detected, size OK, background color
- Background color: one-click swap, preview updates instantly
- Final "Generate" calls backend for precise processing
