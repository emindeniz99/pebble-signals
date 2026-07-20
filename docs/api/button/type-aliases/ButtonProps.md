[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [button](../README.md) / ButtonProps

# Type Alias: ButtonProps

> **ButtonProps** = `object`

Defined in: button.ts:64

Props for [Button](../functions/Button.md).

## Properties

### focus?

> `optional` **focus?**: `boolean`

Defined in: button.ts:78

Whether this button takes input focus after mount (default true) so its
behavior receives Select presses. Only ONE node can hold focus — pass
`false` on every button but one when a screen has several (see the header).

***

### height?

> `optional` **height?**: `number`

Defined in: button.ts:72

Button height in px. Defaults to 40.

***

### label

> **label**: `string` \| (() => `string`)

Defined in: button.ts:66

The centered caption. A thunk (`() => s`) makes it reactive (the `string` whitelist); a bare string is static.

***

### onLongPress?

> `optional` **onLongPress?**: () => `void`

Defined in: button.ts:84

Optional long-press handler (RN Pressable parity). When given, holding
Select ~500ms fires this INSTEAD of `onPress` (the release that follows is
swallowed). Omit for a plain button (no timer is ever armed).

#### Returns

`void`

***

### onPress

> **onPress**: () => `void`

Defined in: button.ts:68

Fired once per completed press — on RELEASE (RN Pressable semantics), not on press-down.

#### Returns

`void`

***

### width?

> `optional` **width?**: `number`

Defined in: button.ts:70

Button width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16).
