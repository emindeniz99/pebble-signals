[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [toggle](../README.md) / ToggleProps

# Type Alias: ToggleProps

> **ToggleProps** = `object`

Defined in: [toggle.ts:33](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L33)

Props for [Toggle](../functions/Toggle.md).

## Properties

### height?

> `optional` **height?**: `number`

Defined in: [toggle.ts:39](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L39)

Pill height in px (also sets the corner radius = height/2). Defaults to 24.

***

### knob?

> `optional` **knob?**: `Color`

Defined in: [toggle.ts:45](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L45)

Knob disc color. Defaults to `"white"`.

***

### offColor?

> `optional` **offColor?**: `Color`

Defined in: [toggle.ts:43](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L43)

Pill color when off. Defaults to `"#606060"`.

***

### on

> **on**: `boolean` \| (() => `boolean`)

Defined in: [toggle.ts:35](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L35)

Toggle state. A thunk (`() => b`) makes it reactive; a bare boolean is static.

***

### onColor?

> `optional` **onColor?**: `Color`

Defined in: [toggle.ts:41](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L41)

Pill color when on. Defaults to `"#00a000"`.

***

### width?

> `optional` **width?**: `number`

Defined in: [toggle.ts:37](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/toggle.ts#L37)

Pill width in px. Defaults to 44.
