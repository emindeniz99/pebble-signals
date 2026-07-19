[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [dialog](../README.md) / DialogProps

# Type Alias: DialogProps

> **DialogProps** = `object`

Defined in: dialog.ts:75

Props for [Dialog](../functions/Dialog.md).

## Properties

### fill?

> `optional` **fill?**: `Color`

Defined in: dialog.ts:87

Box background fill. Defaults to a dark gray (`"#202020"`).

***

### height?

> `optional` **height?**: `number`

Defined in: dialog.ts:85

Box height in px. Defaults to `screen.height - 40`.

***

### hint?

> `optional` **hint?**: `string`

Defined in: dialog.ts:81

Static bottom hint, e.g. `"SELECT to dismiss"`. Omit for no hint Label.

***

### message?

> `optional` **message?**: `string` \| (() => `string`)

Defined in: dialog.ts:79

Message body (wraps to the box width). A thunk (`() => s`) makes it reactive; a bare string is static. Omit for no message Label.

***

### textColor?

> `optional` **textColor?**: `Color`

Defined in: dialog.ts:91

Message + hint text color. Defaults to `"white"`.

***

### title?

> `optional` **title?**: `string` \| (() => `string`)

Defined in: dialog.ts:77

Bold title line. A thunk (`() => s`) makes it reactive; a bare string is static. Omit for no title Label.

***

### titleColor?

> `optional` **titleColor?**: `Color`

Defined in: dialog.ts:89

Title text color. Defaults to `"white"`.

***

### width?

> `optional` **width?**: `number`

Defined in: dialog.ts:83

Box width in px. Defaults to `screen.width - 20` (a width-less container measures 0 — gotcha 16).
