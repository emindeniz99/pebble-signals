[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [flow](../README.md) / MoveProps

# Type Alias: MoveProps

> **MoveProps** = [`BoxProps`](BoxProps.md) & `object`

Defined in: [flow.ts:162](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L162)

## Type Declaration

### children?

> `optional` **children?**: [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Static children, built once at mount (position moves; the subtree does not rebuild).

### x?

> `optional` **x?**: [`Thunk`](Thunk.md)\<`number`\>

Horizontal offset (px) from the base position — a thunk; read signals inside.

### y?

> `optional` **y?**: [`Thunk`](Thunk.md)\<`number`\>

Vertical offset (px) from the base position — a thunk; read signals inside.
