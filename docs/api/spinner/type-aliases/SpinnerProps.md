[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [spinner](../README.md) / SpinnerProps

# Type Alias: SpinnerProps

> **SpinnerProps** = `object`

Defined in: [spinner.ts:49](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L49)

Props for [Spinner](../functions/Spinner.md).

## Properties

### color?

> `optional` **color?**: `Color`

Defined in: [spinner.ts:53](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L53)

Moving-segment color. Defaults to `"#1560bd"`.

***

### periodMs?

> `optional` **periodMs?**: `number`

Defined in: [spinner.ts:61](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L61)

Full-rotation period in ms (clamped to ≥1). Defaults to 1000.

***

### running?

> `optional` **running?**: `boolean` \| (() => `boolean`)

Defined in: [spinner.ts:67](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L67)

Whether the spinner animates. A thunk (`() => b`) freezes/resumes it
reactively; a bare `false` freezes it at angle 0 (never starts a timer).
Defaults to `true` (starts immediately).

***

### size?

> `optional` **size?**: `number`

Defined in: [spinner.ts:51](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L51)

Diameter of the (square) canvas in px. Defaults to 48.

***

### sweepDeg?

> `optional` **sweepDeg?**: `number`

Defined in: [spinner.ts:59](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L59)

Arc length of the moving segment, in degrees. Defaults to 90.

***

### thickness?

> `optional` **thickness?**: `number`

Defined in: [spinner.ts:57](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L57)

Ring-band thickness in px, grown inward from the edge. Defaults to 4.

***

### trackColor?

> `optional` **trackColor?**: `Color`

Defined in: [spinner.ts:55](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/spinner.ts#L55)

Optional faint full-ring drawn behind the segment. Omitted = no track ring.
