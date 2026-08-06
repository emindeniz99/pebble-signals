[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [dots](../README.md) / DotIndicatorProps

# Type Alias: DotIndicatorProps

> **DotIndicatorProps** = `object`

Defined in: [dots.ts:21](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L21)

Props for [DotIndicator](../functions/DotIndicator.md).

## Properties

### active

> **active**: `number` \| (() => `number`)

Defined in: [dots.ts:25](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L25)

The highlighted index. A thunk (`() => i`) makes it reactive; a bare number is static. Clamped to `[0, count-1]`.

***

### count

> **count**: `number`

Defined in: [dots.ts:23](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L23)

How many dots to draw (a page/step count). Values ≤ 0 draw nothing.

***

### height?

> `optional` **height?**: `number`

Defined in: [dots.ts:29](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L29)

Row height in px. Defaults to 12.

***

### off?

> `optional` **off?**: `Color`

Defined in: [dots.ts:33](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L33)

Inactive-dot color. Defaults to `"#606060"`.

***

### on?

> `optional` **on?**: `Color`

Defined in: [dots.ts:31](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L31)

Active-dot color. Defaults to `"white"`.

***

### radius?

> `optional` **radius?**: `number`

Defined in: [dots.ts:35](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L35)

Inactive-dot radius in px; the active dot is `radius+1`. Defaults to 3.

***

### width?

> `optional` **width?**: `number`

Defined in: [dots.ts:27](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/dots.ts#L27)

Row width in px. Defaults to 96.
