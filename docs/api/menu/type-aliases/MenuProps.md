[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [menu](../README.md) / MenuProps

# Type Alias: MenuProps

> **MenuProps** = `object`

Defined in: menu.ts:74

Props for [Menu](../functions/Menu.md).

## Properties

### activeColor?

> `optional` **activeColor?**: `Color`

Defined in: menu.ts:92

Active row text color. Defaults to `"white"`.

***

### activeFill?

> `optional` **activeFill?**: `Color`

Defined in: menu.ts:94

Active row background fill. Defaults to `"#1a4d4d"`.

***

### color?

> `optional` **color?**: `Color`

Defined in: menu.ts:90

Inactive row text color. Defaults to `"#808080"`.

***

### font?

> `optional` **font?**: `string`

Defined in: menu.ts:96

Row font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### height?

> `optional` **height?**: `number`

Defined in: menu.ts:86

Viewport height in px — the clip window the list scrolls within. Defaults to 132.

***

### items

> **items**: `string`[]

Defined in: menu.ts:76

The row captions, top to bottom. One `rowHeight`-tall Label per item.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: menu.ts:88

Per-row height in px. Defaults to 28.

***

### selected

> **selected**: `number` \| (() => `number`)

Defined in: menu.ts:82

The selected row index. A thunk (`() => i`) makes the list reactive — one
effect re-highlights AND re-scrolls on change (idiom 5b); a bare number is
applied once at construction (static). Clamped to `[0, items.length-1]`.

***

### width?

> `optional` **width?**: `number`

Defined in: menu.ts:84

Viewport width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16).
