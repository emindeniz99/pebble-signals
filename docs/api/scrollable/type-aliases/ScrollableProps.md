[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [scrollable](../README.md) / ScrollableProps

# Type Alias: ScrollableProps

> **ScrollableProps** = `object`

Defined in: scrollable.ts:127

Props for [Scrollable](../functions/Scrollable.md).

## Properties

### children?

> `optional` **children?**: [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Defined in: scrollable.ts:139

The content to scroll — any nodes; stacked in an inner Column and clipped to the viewport.

***

### height

> **height**: `number`

Defined in: scrollable.ts:129

Height of the clip window the content scrolls within, in px (a size-less container measures 0 — gotcha 16). With `indicator`, two `GUTTER`-tall chevron bands are added OUTSIDE it, so the widget renders `height + 2·GUTTER` tall.

***

### indicator?

> `optional` **indicator?**: `boolean`

Defined in: scrollable.ts:135

Reserve up/down chevron gutters (a Pebble ContentIndicator) reflecting the travel remaining. Default off.

***

### max?

> `optional` **max?**: `number`

Defined in: scrollable.ts:137

Max scroll in px (content height − `height`) for the down chevron. A plain number is correct from the first frame; omit and the widget falls back to the inner Column's MEASURED height (accurate once measured — the initial frame may miss the down chevron).

***

### offset

> **offset**: () => `number`

Defined in: scrollable.ts:133

Scroll position in px (content shifted UP) — a THUNK; read a signal inside so scrolling is live. Rounded to whole px.

#### Returns

`number`

***

### width?

> `optional` **width?**: `number`

Defined in: scrollable.ts:131

Viewport width in px. Defaults to the screen width.
