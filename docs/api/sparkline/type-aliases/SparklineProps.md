[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [sparkline](../README.md) / SparklineProps

# Type Alias: SparklineProps

> **SparklineProps** = `object`

Defined in: sparkline.ts:28

Props for [Sparkline](../functions/Sparkline.md).

## Properties

### color?

> `optional` **color?**: `Color`

Defined in: sparkline.ts:36

Line color. Defaults to `"#00c0ff"`.

***

### data

> **data**: `number`[] \| (() => `number`[])

Defined in: sparkline.ts:30

The series to plot. A thunk (`() => number[]`) makes the chart reactive; a bare array is static.

***

### height?

> `optional` **height?**: `number`

Defined in: sparkline.ts:34

Chart height in px. Defaults to 48.

***

### thickness?

> `optional` **thickness?**: `number`

Defined in: sparkline.ts:38

Line thickness in px. Defaults to 1.

***

### width?

> `optional` **width?**: `number`

Defined in: sparkline.ts:32

Chart width in px. Defaults to 144.
