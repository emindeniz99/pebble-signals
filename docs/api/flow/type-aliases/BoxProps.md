[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [flow](../README.md) / BoxProps

# Type Alias: BoxProps

> **BoxProps** = `object`

Defined in: [flow.ts:52](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L52)

Host-box coordinates shared by every control-flow component. These are
CONSTRUCTION-TIME STATICS — Piu lays out at construction and this port
rejects reactive coordinate writes (use [Move](../functions/Move.md) for dynamic
position). GOTCHA: an unconstrained container measures at ZERO when
empty — pass `width`/`height` (or `left`+`right`/`top`+`bottom`) for
stable layout; a width-less host defaults to the full screen width.

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: [flow.ts:58](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L58)

***

### height?

> `optional` **height?**: `number`

Defined in: [flow.ts:54](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L54)

***

### left?

> `optional` **left?**: `number`

Defined in: [flow.ts:55](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L55)

***

### right?

> `optional` **right?**: `number`

Defined in: [flow.ts:56](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L56)

***

### skin?

> `optional` **skin?**: `Skin` \| `SkinDictionary`

Defined in: [flow.ts:59](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L59)

***

### style?

> `optional` **style?**: `Style` \| `StyleDictionary`

Defined in: [flow.ts:60](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L60)

***

### top?

> `optional` **top?**: `number`

Defined in: [flow.ts:57](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L57)

***

### width?

> `optional` **width?**: `number`

Defined in: [flow.ts:53](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L53)
