[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [statusbar](../README.md) / StatusBarProps

# Type Alias: StatusBarProps

> **StatusBarProps** = `object`

Defined in: [statusbar.ts:38](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/statusbar.ts#L38)

Props for [StatusBar](../functions/StatusBar.md).

## Properties

### background?

> `optional` **background?**: `Color`

Defined in: [statusbar.ts:48](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/statusbar.ts#L48)

Optional strip background fill. Omitted = transparent (no Skin).

***

### color?

> `optional` **color?**: `Color`

Defined in: [statusbar.ts:46](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/statusbar.ts#L46)

Text color. Defaults to `"white"`.

***

### height?

> `optional` **height?**: `number`

Defined in: [statusbar.ts:44](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/statusbar.ts#L44)

Strip height in px. Defaults to 20.

***

### time?

> `optional` **time?**: () => `string`

Defined in: [statusbar.ts:42](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/statusbar.ts#L42)

Time — a thunk (a clock is inherently live). Right on rect, centered below the title on round. Omitted = no time Label.

#### Returns

`string`

***

### title?

> `optional` **title?**: `string` \| (() => `string`)

Defined in: [statusbar.ts:40](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/statusbar.ts#L40)

Title — left on rect, centered on a round screen (top of the centered stack). A thunk (`() => s`) makes it reactive; a bare string is static. Omitted = no title Label.
