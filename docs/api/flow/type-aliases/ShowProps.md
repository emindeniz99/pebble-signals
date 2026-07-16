[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / ShowProps

# Type Alias: ShowProps

> **ShowProps** = [`BoxProps`](BoxProps.md) & `object`

Defined in: flow.ts:55

Props for [Show](../functions/Show.md).

## Type Declaration

### children

> **children**: [`Thunk`](Thunk.md)\<[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)\>

The truthy side — a THUNK returning nodes (built lazily per toggle).

### fallback?

> `optional` **fallback?**: [`Thunk`](Thunk.md)\<[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)\>

The falsy side; omitted = an empty placeholder (layout stays stable).

### keepAlive?

> `optional` **keepAlive?**: `boolean`

Build BOTH sides once at mount and swap by reference — zero allocation
per toggle, but both subtrees stay live (their effects keep running
off-screen). Default (false) rebuilds the active side per toggle:
cheaper memory, costlier toggles.

### when

> **when**: [`Thunk`](Thunk.md)\<`boolean`\>

The condition — a thunk; read signals inside to make it live.
