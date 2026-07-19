[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [toggle](../README.md) / ToggleProps

# Type Alias: ToggleProps

> **ToggleProps** = `object`

Defined in: toggle.ts:33

Props for [Toggle](../functions/Toggle.md).

## Properties

### height?

> `optional` **height?**: `number`

Defined in: toggle.ts:39

Pill height in px (also sets the corner radius = height/2). Defaults to 24.

***

### knob?

> `optional` **knob?**: `Color`

Defined in: toggle.ts:45

Knob disc color. Defaults to `"white"`.

***

### offColor?

> `optional` **offColor?**: `Color`

Defined in: toggle.ts:43

Pill color when off. Defaults to `"#606060"`.

***

### on

> **on**: `boolean` \| (() => `boolean`)

Defined in: toggle.ts:35

Toggle state. A thunk (`() => b`) makes it reactive; a bare boolean is static.

***

### onColor?

> `optional` **onColor?**: `Color`

Defined in: toggle.ts:41

Pill color when on. Defaults to `"#00a000"`.

***

### width?

> `optional` **width?**: `number`

Defined in: toggle.ts:37

Pill width in px. Defaults to 44.
