[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [menu](../README.md) / MenuProps

# Type Alias: MenuProps

> **MenuProps** = `object`

Defined in: [menu.ts:74](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L74)

Props for [Menu](../functions/Menu.md).

## Properties

### activeColor?

> `optional` **activeColor?**: `Color`

Defined in: [menu.ts:92](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L92)

Active row text color. Defaults to `"white"`.

***

### activeFill?

> `optional` **activeFill?**: `Color`

Defined in: [menu.ts:94](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L94)

Active row background fill. Defaults to `"#1a4d4d"`.

***

### color?

> `optional` **color?**: `Color`

Defined in: [menu.ts:90](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L90)

Inactive row text color. Defaults to `"#808080"`.

***

### font?

> `optional` **font?**: `string`

Defined in: [menu.ts:96](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L96)

Row font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### height?

> `optional` **height?**: `number`

Defined in: [menu.ts:86](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L86)

Viewport height in px — the clip window the list scrolls within. Defaults to 132.

***

### items

> **items**: `string`[]

Defined in: [menu.ts:76](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L76)

The row captions, top to bottom. One `rowHeight`-tall Label per item.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [menu.ts:88](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L88)

Per-row height in px. Defaults to 28.

***

### selected

> **selected**: `number` \| (() => `number`)

Defined in: [menu.ts:82](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L82)

The selected row index. A thunk (`() => i`) makes the list reactive — one
effect re-highlights AND re-scrolls on change (idiom 5b); a bare number is
applied once at construction (static). Clamped to `[0, items.length-1]`.

***

### width?

> `optional` **width?**: `number`

Defined in: [menu.ts:84](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L84)

Viewport width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16).
