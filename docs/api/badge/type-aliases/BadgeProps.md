[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [badge](../README.md) / BadgeProps

# Type Alias: BadgeProps

> **BadgeProps** = `object`

Defined in: [badge.ts:47](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/badge.ts#L47)

Props for [Badge](../functions/Badge.md).

## Properties

### color?

> `optional` **color?**: `Color`

Defined in: [badge.ts:53](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/badge.ts#L53)

Disc fill color. Defaults to `"red"`.

***

### count

> **count**: (() => `number`) \| `number`

Defined in: [badge.ts:49](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/badge.ts#L49)

The number to show. A thunk (`() => n`) makes the badge reactive; a bare number is static.

***

### size?

> `optional` **size?**: `number`

Defined in: [badge.ts:51](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/badge.ts#L51)

Disc diameter in px. Defaults to 28.

***

### style?

> `optional` **style?**: `Style`

Defined in: [badge.ts:57](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/badge.ts#L57)

Override the label Style. Defaults to a lazily-created 18px Gothic style.

***

### textColor?

> `optional` **textColor?**: `Color`

Defined in: [badge.ts:55](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/badge.ts#L55)

Number color. Defaults to `"white"`.
