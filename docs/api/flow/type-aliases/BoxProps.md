[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / BoxProps

# Type Alias: BoxProps

> **BoxProps** = `object`

Defined in: flow.ts:52

Host-box coordinates shared by every control-flow component. These are
CONSTRUCTION-TIME STATICS — Piu lays out at construction and this port
rejects reactive coordinate writes (use [Move](../functions/Move.md) for dynamic
position). GOTCHA: an unconstrained container measures at ZERO when
empty — pass `width`/`height` (or `left`+`right`/`top`+`bottom`) for
stable layout; a width-less host defaults to the full screen width.

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: flow.ts:58

***

### height?

> `optional` **height?**: `number`

Defined in: flow.ts:54

***

### left?

> `optional` **left?**: `number`

Defined in: flow.ts:55

***

### right?

> `optional` **right?**: `number`

Defined in: flow.ts:56

***

### skin?

> `optional` **skin?**: `Skin` \| `SkinDictionary`

Defined in: flow.ts:59

***

### style?

> `optional` **style?**: `Style` \| `StyleDictionary`

Defined in: flow.ts:60

***

### top?

> `optional` **top?**: `number`

Defined in: flow.ts:57

***

### width?

> `optional` **width?**: `number`

Defined in: flow.ts:53
