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

Defined in: textflow.ts:225

Horizontal alignment. `"left"` (default, the reliable one) or `"center"`. Forced to `"center"` when `shape="circle"`.

***

### charsPerLine?

> `optional` **charsPerLine?**: `number`

Defined in: textflow.ts:217

Per-line character budget for the wrap. Defaults to `max(1, floor(width / 9))`.

***

### color?

> `optional` **color?**: `Color`

Defined in: textflow.ts:221

Text color. Defaults to `"white"`.

***

### fill?

> `optional` **fill?**: `number`

Defined in: textflow.ts:236

Circle-fill fraction (0..1) — how much of each chord to use, leaving a bezel margin. Defaults to 0.92. Only used when `shape="circle"`.

***

### font?

> `optional` **font?**: `string`

Defined in: textflow.ts:219

Text font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### lineHeight?

> `optional` **lineHeight?**: `number`

Defined in: textflow.ts:223

Per-line height in px (each Label's height + the Column's row pitch). Defaults to 22.

***

### maxLines?

> `optional` **maxLines?**: `number`

Defined in: textflow.ts:227

Max wrapped lines; extra lines are dropped. Defaults to 8.

***

### shape?

> `optional` **shape?**: `"block"` \| `"circle"`

Defined in: textflow.ts:234

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
