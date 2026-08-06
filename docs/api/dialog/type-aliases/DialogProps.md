[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [dialog](../README.md) / DialogProps

# Type Alias: DialogProps

> **DialogProps** = `object`

Defined in: [dialog.ts:75](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L75)

Props for [Dialog](../functions/Dialog.md).

## Properties

### fill?

> `optional` **fill?**: `Color`

Defined in: [dialog.ts:87](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L87)

Box background fill. Defaults to a dark gray (`"#202020"`).

***

### height?

> `optional` **height?**: `number`

Defined in: [dialog.ts:85](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L85)

Box height in px. Defaults to `screen.height - 40`.

***

### hint?

> `optional` **hint?**: `string`

Defined in: [dialog.ts:81](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L81)

Static bottom hint, e.g. `"SELECT to dismiss"`. Omit for no hint Label.

***

### message?

> `optional` **message?**: `string` \| (() => `string`)

Defined in: [dialog.ts:79](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L79)

Message body (wraps to the box width). A thunk (`() => s`) makes it reactive; a bare string is static. Omit for no message Label.

***

### textColor?

> `optional` **textColor?**: `Color`

Defined in: [dialog.ts:91](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L91)

Message + hint text color. Defaults to `"white"`.

***

### title?

> `optional` **title?**: `string` \| (() => `string`)

Defined in: [dialog.ts:77](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L77)

Bold title line. A thunk (`() => s`) makes it reactive; a bare string is static. Omit for no title Label.

***

### titleColor?

> `optional` **titleColor?**: `Color`

Defined in: [dialog.ts:89](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L89)

Title text color. Defaults to `"white"`.

***

### width?

> `optional` **width?**: `number`

Defined in: [dialog.ts:83](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dialog.ts#L83)

Box width in px. Defaults to `screen.width - 20` (a width-less container measures 0 — gotcha 16).
