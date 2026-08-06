[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [card](../README.md) / CardProps

# Type Alias: CardProps

> **CardProps** = `object`

Defined in: [card.ts:52](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L52)

Props for [Card](../functions/Card.md).

## Properties

### bodyColor?

> `optional` **bodyColor?**: `Color`

Defined in: [card.ts:66](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L66)

Body background fill. Omit for a transparent body (inherits the card fill).

***

### children?

> `optional` **children?**: [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Defined in: [card.ts:56](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L56)

Body content mounted below the title bar. May be omitted (an empty body).

***

### fill?

> `optional` **fill?**: `Color`

Defined in: [card.ts:62](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L62)

Card background fill. Defaults to a dark gray (`"#202020"`).

***

### height?

> `optional` **height?**: `number`

Defined in: [card.ts:60](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L60)

Card height in px. Omit to size to content.

***

### title?

> `optional` **title?**: `string` \| (() => `string`)

Defined in: [card.ts:54](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L54)

Title bar text. A thunk (`() => s`) makes the bar reactive; a bare string is static. Omit for a blank bar.

***

### titleColor?

> `optional` **titleColor?**: `Color`

Defined in: [card.ts:64](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L64)

Title text color. Defaults to `"white"`.

***

### width?

> `optional` **width?**: `number`

Defined in: [card.ts:58](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/card.ts#L58)

Card width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16).
