# Cursor Click Darkening

OpenScreen can briefly darken an editable cursor when a recorded click occurs. The editor exposes the effect as **Cursor → Click Darken**, from 0% (off) to 100%. The default is 20%.

The effect is supported in:

- the native DOM cursor preview;
- the legacy Pixi cursor overlay;
- Canvas cursor rendering;
- MP4 and GIF exports through `FrameRenderer`.

## Reusing the effect

The shared implementation lives in `src/lib/cursor/clickVisuals.ts` and has no renderer dependency:

```ts
import {
  getCursorClickBrightness,
  getCursorImageFilter,
} from "@/lib/cursor/clickVisuals";

const brightness = getCursorClickBrightness(clickDarken, clickProgress);
element.style.filter = getCursorImageFilter({ brightness });
```

Both inputs use the normalized 0..1 range. `clickProgress` starts at 1 on a click and returns to 0 over the renderer's click animation. `getCursorBrightnessTint()` provides the equivalent multiply tint for Pixi sprites.

When integrating another renderer, pass `cursorClickDarken` through its configuration and use the same click progress that drives the cursor bounce. This keeps preview and export timing aligned.
