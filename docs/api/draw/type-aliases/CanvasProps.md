[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [draw](../README.md) / CanvasProps

# Type Alias: CanvasProps

> **CanvasProps** = `object`

Defined in: draw.ts:58

Props for [Canvas](../functions/Canvas.md).

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: draw.ts:66

***

### fill?

> `optional` **fill?**: `Color`

Defined in: draw.ts:72

Optional background color painted before every frame. Piu does NOT
auto-clear a Port between repaints, so without this the surface keeps the
previous frame's pixels — pass a `fill` for an opaque canvas.

***

### height?

> `optional` **height?**: `number`

Defined in: draw.ts:62

Surface height in px. Defaults to the screen height.

***

### left?

> `optional` **left?**: `number`

Defined in: draw.ts:63

***

### paint

> **paint**: (`g`) => `void`

Defined in: draw.ts:79

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

Defined in: draw.ts:64

***

### top?

> `optional` **top?**: `number`

Defined in: draw.ts:65

***

### width?

> `optional` **width?**: `number`

Defined in: draw.ts:60

Surface width in px. Defaults to the screen width (a width-less port measures 0 — gotcha 16).
