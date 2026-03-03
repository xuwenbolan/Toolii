# Word Counter

Status: draft | Updated: 2026-03-03

**Pattern:** E - Live Editor | **Run Mode:** none

## Layout

Text area + live stats panel.

```
+---------------------------------------------------+
|  +-----------------------------+ +--------------+  |
|  |                             | | Chars  1,247 |  |
|  |  Type or paste text here... | | Words    186 |  |
|  |                             | | Sentences 12 |  |
|  |  User is typing and every   | | Paragraphs 3 |  |
|  |  keystroke updates the      | | Lines      8 |  |
|  |  stats panel in real-time   | | ------------ |  |
|  |                             | | GPT-4   312 |  |
|  |                             | | Claude  298 |  |
|  |                             | | Llama   305 |  |
|  +-----------------------------+ +--------------+  |
+---------------------------------------------------+
```

## Interactions

- Left: large text area (monospace or body font, user choice)
- Right: stats panel, every metric updates **on every keystroke** (debounce token counts to 300ms)
- No submit button -- everything is live
