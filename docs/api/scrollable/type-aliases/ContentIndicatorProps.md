[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [scrollable](../README.md) / ContentIndicatorProps

# Type Alias: ContentIndicatorProps

> **ContentIndicatorProps** = `object`

Defined in: scrollable.ts:83

Props for [ContentIndicator](../functions/ContentIndicator.md).

## Properties

### canDown

> **canDown**: () => `boolean`

Defined in: scrollable.ts:87

Thunk — true while there is content BELOW (paints the down chevron). Read a signal inside so it tracks.

#### Returns

`boolean`

***

### canUp

> **canUp**: () => `boolean`

Defined in: scrollable.ts:85

Thunk — true while there is content ABOVE (paints the up chevron). Read a signal inside so it tracks.

#### Returns

`boolean`

***

### height?

> `optional` **height?**: `number`

Defined in: scrollable.ts:91

Overlay height in px — the chevrons sit at its top and bottom edges. Defaults to the screen height.

***

### width?

> `optional` **width?**: `number`

Defined in: scrollable.ts:89

Overlay width in px. Defaults to the screen width (a width-less port measures 0 — gotcha 16).
