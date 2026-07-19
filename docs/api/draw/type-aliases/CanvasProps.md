[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [draw](../README.md) / CanvasProps

# Type Alias: CanvasProps

> **CanvasProps** = `object`

Defined in: draw.ts:81

Props for [Canvas](../functions/Canvas.md).

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: draw.ts:89

***

### fill?

> `optional` **fill?**: `Color`

Defined in: draw.ts:95

Optional background color painted before every frame. Piu does NOT
auto-clear a Port between repaints, so without this the surface keeps the
previous frame's pixels — pass a `fill` for an opaque canvas.

***

### height?

> `optional` **height?**: `number`

Defined in: draw.ts:85

Surface height in px. Defaults to the screen height.

***

### left?

> `optional` **left?**: `number`

Defined in: draw.ts:86

***

### paint

> **paint**: (`g`) => `void`

Defined in: draw.ts:102

The frame painter. Called once per repaint with a [DrawContext](DrawContext.md).
MUST be pure — it runs a second, non-drawing time each reactive change to
collect dependencies (read your signals in here / in the args you pass to
`g.*`, and the canvas repaints when they change).

#### Parameters

##### g

[`DrawContext`](DrawContext.md)

#### Returns

`void`

***

### right?

> `optional` **right?**: `number`

Defined in: draw.ts:87

***

### top?

> `optional` **top?**: `number`

Defined in: draw.ts:88

***

### width?

> `optional` **width?**: `number`

Defined in: draw.ts:83

Surface width in px. Defaults to the screen width (a width-less port measures 0 — gotcha 16).
