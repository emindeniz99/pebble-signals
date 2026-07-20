[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [textflow](../README.md) / TextFlowProps

# Type Alias: TextFlowProps

> **TextFlowProps** = `object`

Defined in: textflow.ts:118

Props for [TextFlow](../functions/TextFlow.md).

## Properties

### align?

> `optional` **align?**: `"left"` \| `"center"`

Defined in: textflow.ts:132

Horizontal alignment. `"left"` (default, the reliable one) or `"center"`.

***

### charsPerLine?

> `optional` **charsPerLine?**: `number`

Defined in: textflow.ts:124

Per-line character budget for the wrap. Defaults to `max(1, floor(width / 9))`.

***

### color?

> `optional` **color?**: `Color`

Defined in: textflow.ts:128

Text color. Defaults to `"white"`.

***

### font?

> `optional` **font?**: `string`

Defined in: textflow.ts:126

Text font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### lineHeight?

> `optional` **lineHeight?**: `number`

Defined in: textflow.ts:130

Per-line height in px (each Label's height + the Column's row pitch). Defaults to 22.

***

### maxLines?

> `optional` **maxLines?**: `number`

Defined in: textflow.ts:134

Max wrapped lines; extra lines are dropped. Defaults to 8.

***

### text

> **text**: `string` \| (() => `string`)

Defined in: textflow.ts:120

The paragraph text. A thunk (`() => s`) re-wraps + rebuilds on change; a bare string wraps once (static).

***

### width?

> `optional` **width?**: `number`

Defined in: textflow.ts:122

Block width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16).
