[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [clockface](../README.md) / ClockFaceProps

# Type Alias: ClockFaceProps

> **ClockFaceProps** = `object`

Defined in: clockface.ts:35

Props for [ClockFace](../functions/ClockFace.md).

## Properties

### face?

> `optional` **face?**: `Color`

Defined in: clockface.ts:45

Dial background color. Defaults to `"black"`.

***

### hand?

> `optional` **hand?**: `Color`

Defined in: clockface.ts:47

Hour + minute hand color. Defaults to `"white"`.

***

### hours

> **hours**: `number` \| (() => `number`)

Defined in: clockface.ts:37

Hour (0–23; `%12` is applied). A thunk (`() => h`) makes the face reactive; a bare number is static.

***

### minutes

> **minutes**: `number` \| (() => `number`)

Defined in: clockface.ts:39

Minute (0–59). A thunk makes the face reactive; a bare number is static.

***

### second?

> `optional` **second?**: `Color`

Defined in: clockface.ts:49

Second hand color. Defaults to `"#e01818"`.

***

### seconds?

> `optional` **seconds?**: `number` \| (() => `number`)

Defined in: clockface.ts:41

Optional second (0–59). When present, a thin second hand is drawn. A thunk is reactive.

***

### size?

> `optional` **size?**: `number`

Defined in: clockface.ts:43

Face diameter in px. Defaults to 144.

***

### ticks?

> `optional` **ticks?**: `Color`

Defined in: clockface.ts:51

Hour-tick color. Defaults to `"#606060"`.
