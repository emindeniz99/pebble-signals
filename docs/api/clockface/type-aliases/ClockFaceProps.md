[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [clockface](../README.md) / ClockFaceProps

# Type Alias: ClockFaceProps

> **ClockFaceProps** = `object`

Defined in: [clockface.ts:35](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L35)

Props for [ClockFace](../functions/ClockFace.md).

## Properties

### face?

> `optional` **face?**: `Color`

Defined in: [clockface.ts:45](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L45)

Dial background color. Defaults to `"black"`.

***

### hand?

> `optional` **hand?**: `Color`

Defined in: [clockface.ts:47](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L47)

Hour + minute hand color. Defaults to `"white"`.

***

### hours

> **hours**: `number` \| (() => `number`)

Defined in: [clockface.ts:37](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L37)

Hour (0–23; `%12` is applied). A thunk (`() => h`) makes the face reactive; a bare number is static.

***

### minutes

> **minutes**: `number` \| (() => `number`)

Defined in: [clockface.ts:39](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L39)

Minute (0–59). A thunk makes the face reactive; a bare number is static.

***

### second?

> `optional` **second?**: `Color`

Defined in: [clockface.ts:49](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L49)

Second hand color. Defaults to `"#e01818"`.

***

### seconds?

> `optional` **seconds?**: `number` \| (() => `number`)

Defined in: [clockface.ts:41](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L41)

Optional second (0–59). When present, a thin second hand is drawn. A thunk is reactive.

***

### size?

> `optional` **size?**: `number`

Defined in: [clockface.ts:43](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L43)

Face diameter in px. Defaults to 144.

***

### ticks?

> `optional` **ticks?**: `Color`

Defined in: [clockface.ts:51](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clockface.ts#L51)

Hour-tick color. Defaults to `"#606060"`.
