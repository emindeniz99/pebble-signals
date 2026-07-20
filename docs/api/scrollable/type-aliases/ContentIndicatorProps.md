[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [scrollable](../README.md) / ContentIndicatorProps

# Type Alias: ContentIndicatorProps

> **ContentIndicatorProps** = `object`

Defined in: scrollable.ts:81

Props for [ContentIndicator](../functions/ContentIndicator.md).

## Properties

### edge

> **edge**: `"up"` \| `"down"`

Defined in: scrollable.ts:83

Which chevron: `"up"` (a "^") or `"down"` (a "v").

***

### height?

> `optional` **height?**: `number`

Defined in: scrollable.ts:89

Gutter (band) height in px. Defaults to `GUTTER` (26).

***

### show

> **show**: () => `boolean`

Defined in: scrollable.ts:85

Thunk — true while there is content in that direction (shows the chevron). Read a signal inside so it tracks.

#### Returns

`boolean`

***

### style?

> `optional` **style?**: `PiuStyle`

Defined in: scrollable.ts:91

Override the chevron Style. Defaults to a lazily-created centered bold 24px Gothic style.

***

### width?

> `optional` **width?**: `number`

Defined in: scrollable.ts:87

Gutter width in px. Defaults to the screen width (a width-less label measures 0 — gotcha 16).
