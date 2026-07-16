[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [jsx-runtime](../README.md) / ErrorBoundaryProps

# Interface: ErrorBoundaryProps

Defined in: jsx-runtime.ts:484

Props for [ErrorBoundary](../functions/ErrorBoundary.md). Box coordinates size the host (like Show).

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: jsx-runtime.ts:490

***

### children

> **children**: () => [`JSXNode`](../type-aliases/JSXNode.md)

Defined in: jsx-runtime.ts:494

the subtree to protect — a thunk returning nodes (like Show's children).

#### Returns

[`JSXNode`](../type-aliases/JSXNode.md)

***

### fallback

> **fallback**: (`err`, `reset`) => [`JSXNode`](../type-aliases/JSXNode.md)

Defined in: jsx-runtime.ts:496

shown when the subtree throws; `reset` re-runs `children` under a fresh root.

#### Parameters

##### err

`unknown`

##### reset

() => `void`

#### Returns

[`JSXNode`](../type-aliases/JSXNode.md)

***

### height?

> `optional` **height?**: `number`

Defined in: jsx-runtime.ts:486

***

### left?

> `optional` **left?**: `number`

Defined in: jsx-runtime.ts:487

***

### right?

> `optional` **right?**: `number`

Defined in: jsx-runtime.ts:488

***

### skin?

> `optional` **skin?**: `Skin` \| `SkinDictionary`

Defined in: jsx-runtime.ts:491

***

### style?

> `optional` **style?**: `Style` \| `StyleDictionary`

Defined in: jsx-runtime.ts:492

***

### top?

> `optional` **top?**: `number`

Defined in: jsx-runtime.ts:489

***

### width?

> `optional` **width?**: `number`

Defined in: jsx-runtime.ts:485
