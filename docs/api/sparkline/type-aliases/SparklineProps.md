[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [sparkline](../README.md) / SparklineProps

# Type Alias: SparklineProps

> **SparklineProps** = `object`

Defined in: [sparkline.ts:28](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L28)

Props for [Sparkline](../functions/Sparkline.md).

## Properties

### color?

> `optional` **color?**: `Color`

Defined in: [sparkline.ts:36](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L36)

Line color. Defaults to `"#00c0ff"`.

***

### data

> **data**: `number`[] \| (() => `number`[])

Defined in: [sparkline.ts:30](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L30)

The series to plot. A thunk (`() => number[]`) makes the chart reactive; a bare array is static.

***

### height?

> `optional` **height?**: `number`

Defined in: [sparkline.ts:34](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L34)

Chart height in px. Defaults to 48.

***

### thickness?

> `optional` **thickness?**: `number`

Defined in: [sparkline.ts:38](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L38)

Line thickness in px. Defaults to 1.

***

### width?

> `optional` **width?**: `number`

Defined in: [sparkline.ts:32](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L32)

Chart width in px. Defaults to 144.
