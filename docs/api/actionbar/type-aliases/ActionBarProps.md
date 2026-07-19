[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [actionbar](../README.md) / ActionBarProps

# Type Alias: ActionBarProps

> **ActionBarProps** = `object`

Defined in: actionbar.ts:39

Props for [ActionBar](../functions/ActionBar.md).

## Properties

### background?

> `optional` **background?**: `Color`

Defined in: actionbar.ts:51

Bar background fill. Omitted = transparent (no Skin built).

***

### color?

> `optional` **color?**: `Color`

Defined in: actionbar.ts:49

Hint text color. Defaults to `"white"`.

***

### down?

> `optional` **down?**: `string` \| (() => `string`)

Defined in: actionbar.ts:45

Down-button hint (bottom slot). Thunk = reactive, string = static, omitted = blank.

***

### select?

> `optional` **select?**: `string` \| (() => `string`)

Defined in: actionbar.ts:43

Select-button hint (center slot). Thunk = reactive, string = static, omitted = blank.

***

### up?

> `optional` **up?**: `string` \| (() => `string`)

Defined in: actionbar.ts:41

Up-button hint (top slot). A thunk (`() => s`) makes it reactive; a bare string is static; omitted = blank.

***

### width?

> `optional` **width?**: `number`

Defined in: actionbar.ts:47

Bar width in px. Defaults to 28.
