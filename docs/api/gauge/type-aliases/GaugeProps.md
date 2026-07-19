[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [gauge](../README.md) / GaugeProps

# Type Alias: GaugeProps

> **GaugeProps** = `object`

Defined in: gauge.ts:48

Props for [Gauge](../functions/Gauge.md).

## Properties

### fill?

> `optional` **fill?**: `Color`

Defined in: gauge.ts:62

Foreground (value) arc color. Defaults to `"#00d0ff"`.

***

### label?

> `optional` **label?**: (`v`) => `string`

Defined in: gauge.ts:64

Optional centered label, given the clamped value (e.g. `v => Math.round(v*100)+"%"`).

#### Parameters

##### v

`number`

#### Returns

`string`

***

### labelColor?

> `optional` **labelColor?**: `Color`

Defined in: gauge.ts:66

Text color for the label. Defaults to `"white"`.

***

### labelStyle?

> `optional` **labelStyle?**: `Style`

Defined in: gauge.ts:68

Override the label Style. Defaults to a lazily-created 24px Gothic style.

***

### size?

> `optional` **size?**: `number`

Defined in: gauge.ts:52

Diameter of the square canvas in px. Defaults to 100.

***

### startDeg?

> `optional` **startDeg?**: `number`

Defined in: gauge.ts:54

Angle where the arc begins, in degrees (0 = 3 o'clock, clockwise). Defaults to 135.

***

### sweepDeg?

> `optional` **sweepDeg?**: `number`

Defined in: gauge.ts:56

Total sweep of a full (value=1) arc, in degrees. Defaults to 270 (a bottom-gap dial).

***

### thickness?

> `optional` **thickness?**: `number`

Defined in: gauge.ts:58

Ring band thickness in px, grown inward from the edge. Defaults to 8.

***

### track?

> `optional` **track?**: `Color`

Defined in: gauge.ts:60

Background (full-sweep) arc color. Defaults to `"#303030"`.

***

### value

> **value**: `number` \| (() => `number`)

Defined in: gauge.ts:50

Fill fraction, 0..1 (clamped). A thunk (`() => v`) makes the gauge reactive; a bare number is static.
