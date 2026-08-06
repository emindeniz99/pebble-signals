[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [button](../README.md) / ButtonProps

# Type Alias: ButtonProps

> **ButtonProps** = `object`

Defined in: [button.ts:65](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L65)

Props for [Button](../functions/Button.md).

## Properties

### focus?

> `optional` **focus?**: `boolean`

Defined in: [button.ts:79](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L79)

Whether this button takes input focus after mount (default true) so its
behavior receives Select presses. Only ONE node can hold focus — pass
`false` on every button but one when a screen has several (see the header).

***

### height?

> `optional` **height?**: `number`

Defined in: [button.ts:73](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L73)

Button height in px. Defaults to 40.

***

### label

> **label**: `string` \| (() => `string`)

Defined in: [button.ts:67](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L67)

The centered caption. A thunk (`() => s`) makes it reactive (the `string` whitelist); a bare string is static.

***

### onLongPress?

> `optional` **onLongPress?**: () => `void`

Defined in: [button.ts:85](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L85)

Optional long-press handler (RN Pressable parity). When given, holding
Select ~500ms fires this INSTEAD of `onPress` (the release that follows is
swallowed). Omit for a plain button (no timer is ever armed).

#### Returns

`void`

***

### onPress

> **onPress**: () => `void`

Defined in: [button.ts:69](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L69)

Fired once per completed press — on RELEASE (RN Pressable semantics), not on press-down.

#### Returns

`void`

***

### width?

> `optional` **width?**: `number`

Defined in: [button.ts:71](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/button.ts#L71)

Button width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16).
