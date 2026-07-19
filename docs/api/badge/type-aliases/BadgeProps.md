[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [badge](../README.md) / BadgeProps

# Type Alias: BadgeProps

> **BadgeProps** = `object`

Defined in: badge.ts:47

Props for [Badge](../functions/Badge.md).

## Properties

### color?

> `optional` **color?**: `Color`

Defined in: badge.ts:53

Disc fill color. Defaults to `"red"`.

***

### count

> **count**: (() => `number`) \| `number`

Defined in: badge.ts:49

The number to show. A thunk (`() => n`) makes the badge reactive; a bare number is static.

***

### size?

> `optional` **size?**: `number`

Defined in: badge.ts:51

Disc diameter in px. Defaults to 28.

***

### style?

> `optional` **style?**: `Style`

Defined in: badge.ts:57

Override the label Style. Defaults to a lazily-created 18px Gothic style.

***

### textColor?

> `optional` **textColor?**: `Color`

Defined in: badge.ts:55

Number color. Defaults to `"white"`.
