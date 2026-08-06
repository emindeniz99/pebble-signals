[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [draw](../README.md) / CanvasProps

# Type Alias: CanvasProps

> **CanvasProps** = `object`

Defined in: [draw.ts:103](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L103)

Props for [Canvas](../functions/Canvas.md).

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: [draw.ts:111](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L111)

***

### fill?

> `optional` **fill?**: `Color`

Defined in: [draw.ts:117](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L117)

Optional background color painted before every frame. Piu does NOT
auto-clear a Port between repaints, so without this the surface keeps the
previous frame's pixels — pass a `fill` for an opaque canvas.

***

### height?

> `optional` **height?**: `number`

Defined in: [draw.ts:107](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L107)

Surface height in px. Defaults to the screen height.

***

### left?

> `optional` **left?**: `number`

Defined in: [draw.ts:108](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L108)

***

### paint

> **paint**: (`g`) => `void`

Defined in: [draw.ts:124](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L124)

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

Defined in: [draw.ts:109](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L109)

***

### top?

> `optional` **top?**: `number`

Defined in: [draw.ts:110](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L110)

***

### width?

> `optional` **width?**: `number`

Defined in: [draw.ts:105](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/draw.ts#L105)

Surface width in px. Defaults to the screen width (a width-less port measures 0 — gotcha 16).
