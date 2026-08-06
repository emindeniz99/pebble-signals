[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [meter](../README.md) / MeterProps

# Type Alias: MeterProps

> **MeterProps** = `object`

Defined in: [meter.ts:26](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L26)

Props for [Meter](../functions/Meter.md).

## Properties

### gap?

> `optional` **gap?**: `number`

Defined in: [meter.ts:40](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L40)

Gap between bars in px. Defaults to 2.

***

### height?

> `optional` **height?**: `number`

Defined in: [meter.ts:34](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L34)

Bar height in px. Defaults to 20.

***

### off?

> `optional` **off?**: `Color`

Defined in: [meter.ts:38](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L38)

Unlit-bar color. Defaults to `"#303030"`.

***

### on?

> `optional` **on?**: `Color`

Defined in: [meter.ts:36](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L36)

Lit-bar color. Defaults to `"#00c000"`.

***

### segments?

> `optional` **segments?**: `number`

Defined in: [meter.ts:30](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L30)

Number of bars. Defaults to 5.

***

### value

> **value**: `number` \| (() => `number`)

Defined in: [meter.ts:28](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L28)

Fill level, 0..1 (clamped). A thunk (`() => v`) makes the meter reactive; a bare number is static.

***

### width?

> `optional` **width?**: `number`

Defined in: [meter.ts:32](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/meter.ts#L32)

Total width in px. Defaults to 100.
