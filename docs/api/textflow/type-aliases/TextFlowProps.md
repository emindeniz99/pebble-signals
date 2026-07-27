[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [textflow](../README.md) / TextFlowProps

# Type Alias: TextFlowProps

> **TextFlowProps** = `object`

Defined in: textflow.ts:211

Props for [TextFlow](../functions/TextFlow.md).

## Properties

### align?

> `optional` **align?**: `"left"` \| `"center"`

Defined in: textflow.ts:232

Horizontal alignment. `"left"` (default, the reliable one) or `"center"`. Forced to `"center"` when `shape="circle"`.

***

### charsPerLine?

> `optional` **charsPerLine?**: `number`

Defined in: textflow.ts:224

Per-line character budget for the wrap. Defaults to `max(1, floor(width / 9))`.

***

### color?

> `optional` **color?**: `Color`

Defined in: textflow.ts:228

Text color. Defaults to `"white"`.

***

### fill?

> `optional` **fill?**: `number`

Defined in: textflow.ts:243

Circle-fill fraction (0..1) — how much of each chord to use, leaving a bezel margin. Defaults to 0.92. Only used when `shape="circle"`.

***

### font?

> `optional` **font?**: `string`

Defined in: textflow.ts:226

Text font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### height?

> `optional` **height?**: `number`

Defined in: textflow.ts:222

Block height in px. A REACTIVE `text` thunk always gets a fixed
construction-time height (this value, else `maxLines * lineHeight`) —
Piu position/size is construction-time state, so the re-wrap must not
resize a mounted box. A bare string still shrinks to its own wrap.

***

### lineHeight?

> `optional` **lineHeight?**: `number`

Defined in: textflow.ts:230

Per-line height in px (each Label's height + the Column's row pitch). Defaults to 22.

***

### maxLines?

> `optional` **maxLines?**: `number`

Defined in: textflow.ts:234

Max wrapped lines; extra lines are dropped. Defaults to 8.

***

### shape?

> `optional` **shape?**: `"block"` \| `"circle"`

Defined in: textflow.ts:241

Wrap silhouette. `"block"` (default) wraps to a fixed rectangle. `"circle"`
wraps each line to the circle's chord at its height, so the text FILLS the
round screen (a lens shape) instead of a square — designed for round
screens, always center-aligned. See [wrapCircle](../functions/wrapCircle.md).

***

### text

> **text**: `string` \| (() => `string`)

Defined in: textflow.ts:213

The paragraph text. A thunk (`() => s`) re-wraps + rebuilds on change; a bare string wraps once (static).

***

### width?

> `optional` **width?**: `number`

Defined in: textflow.ts:215

Block width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16).
