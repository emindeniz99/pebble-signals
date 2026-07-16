[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / ForProps

# Type Alias: ForProps\<T\>

> **ForProps**\<`T`\> = [`BoxProps`](BoxProps.md) & `object`

Defined in: flow.ts:72

Props for [For](../functions/For.md).

## Type Declaration

### children

> **children**: (`item`, `i`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Row builder — each row runs under its own root and disposes on removal.

#### Parameters

##### item

`T`

##### i

`number`

#### Returns

[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

### each

> **each**: [`Thunk`](Thunk.md)\<`T`[]\>

The array — a thunk; read a signal inside so the list is live.

### key?

> `optional` **key?**: (`item`, `i`) => `unknown`

item -> unique key (default: item identity). Rows whose keys survive
are KEPT (minimal Piu ops); a DUPLICATE key keeps its first occurrence
and later items are skipped; NaN keys are normalized to stay stable.

#### Parameters

##### item

`T`

##### i

`number`

#### Returns

`unknown`

## Type Parameters

### T

`T`
