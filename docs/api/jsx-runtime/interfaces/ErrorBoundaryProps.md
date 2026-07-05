[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [jsx-runtime](../README.md) / ErrorBoundaryProps

# Interface: ErrorBoundaryProps

Defined in: jsx-runtime.ts:425

Props for [ErrorBoundary](../functions/ErrorBoundary.md). Box coordinates size the host (like Show).

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: jsx-runtime.ts:431

***

### children

> **children**: () => [`JSXNode`](../type-aliases/JSXNode.md)

Defined in: jsx-runtime.ts:435

the subtree to protect — a thunk returning nodes (like Show's children).

#### Returns

[`JSXNode`](../type-aliases/JSXNode.md)

***

### fallback

> **fallback**: (`err`, `reset`) => [`JSXNode`](../type-aliases/JSXNode.md)

Defined in: jsx-runtime.ts:437

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

Defined in: jsx-runtime.ts:427

***

### left?

> `optional` **left?**: `number`

Defined in: jsx-runtime.ts:428

***

### right?

> `optional` **right?**: `number`

Defined in: jsx-runtime.ts:429

***

### skin?

> `optional` **skin?**: `Skin` \| `SkinDictionary`

Defined in: jsx-runtime.ts:432

***

### style?

> `optional` **style?**: `Style` \| `StyleDictionary`

Defined in: jsx-runtime.ts:433

***

### top?

> `optional` **top?**: `number`

Defined in: jsx-runtime.ts:430

***

### width?

> `optional` **width?**: `number`

Defined in: jsx-runtime.ts:426
