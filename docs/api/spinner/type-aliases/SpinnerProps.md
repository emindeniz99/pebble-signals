[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [spinner](../README.md) / SpinnerProps

# Type Alias: SpinnerProps

> **SpinnerProps** = `object`

Defined in: spinner.ts:49

Props for [Spinner](../functions/Spinner.md).

## Properties

### color?

> `optional` **color?**: `Color`

Defined in: spinner.ts:53

Moving-segment color. Defaults to `"#1560bd"`.

***

### periodMs?

> `optional` **periodMs?**: `number`

Defined in: spinner.ts:61

Full-rotation period in ms (clamped to ≥1). Defaults to 1000.

***

### running?

> `optional` **running?**: `boolean` \| (() => `boolean`)

Defined in: spinner.ts:67

Whether the spinner animates. A thunk (`() => b`) freezes/resumes it
reactively; a bare `false` freezes it at angle 0 (never starts a timer).
Defaults to `true` (starts immediately).

***

### size?

> `optional` **size?**: `number`

Defined in: spinner.ts:51

Diameter of the (square) canvas in px. Defaults to 48.

***

### sweepDeg?

> `optional` **sweepDeg?**: `number`

Defined in: spinner.ts:59

Arc length of the moving segment, in degrees. Defaults to 90.

***

### thickness?

> `optional` **thickness?**: `number`

Defined in: spinner.ts:57

Ring-band thickness in px, grown inward from the edge. Defaults to 4.

***

### trackColor?

> `optional` **trackColor?**: `Color`

Defined in: spinner.ts:55

Optional faint full-ring drawn behind the segment. Omitted = no track ring.
