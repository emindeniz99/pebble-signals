[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [scrollable](../README.md) / ScrollableProps

# Type Alias: ScrollableProps

> **ScrollableProps** = `object`

Defined in: scrollable.ts:129

Props for [Scrollable](../functions/Scrollable.md).

## Properties

### children?

> `optional` **children?**: [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Defined in: scrollable.ts:139

The content to scroll — any nodes; stacked in an inner Column and clipped to the viewport.

***

### height

> **height**: `number`

Defined in: scrollable.ts:131

Viewport height in px — the clip window the content scrolls within (a size-less container measures 0 — gotcha 16).

***

### indicator?

> `optional` **indicator?**: `boolean`

Defined in: scrollable.ts:137

Overlay up/down chevrons (a Pebble ContentIndicator) reflecting the travel remaining. Default off.

***

### offset

> **offset**: () => `number`

Defined in: scrollable.ts:135

Scroll position in px (content shifted UP) — a THUNK; read a signal inside so scrolling is live. Rounded to whole px.

#### Returns

`number`

***

### width?

> `optional` **width?**: `number`

Defined in: scrollable.ts:133

Viewport width in px. Defaults to the screen width.
