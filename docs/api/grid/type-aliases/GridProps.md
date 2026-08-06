[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [grid](../README.md) / GridProps

# Type Alias: GridProps\<T\>

> **GridProps**\<`T`\> = `object`

Defined in: [grid.ts:32](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L32)

Props for [Grid](../functions/Grid.md).

## Type Parameters

### T

`T`

## Properties

### cell

> **cell**: (`item`, `index`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Defined in: [grid.ts:38](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L38)

Renders one cell from its item + flat index. Returns a fully-sized node (Grid does not size cells).

#### Parameters

##### item

`T`

##### index

`number`

#### Returns

[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

***

### columns

> **columns**: `number`

Defined in: [grid.ts:34](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L34)

Number of cells per row (>= 1).

***

### height?

> `optional` **height?**: `number`

Defined in: [grid.ts:42](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L42)

Grid height in px. Optional (omit to size to content).

***

### items

> **items**: `T`[] \| (() => `T`[])

Defined in: [grid.ts:36](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L36)

The items to lay out — an array, or a thunk returning one (read ONCE at construction).

***

### width?

> `optional` **width?**: `number`

Defined in: [grid.ts:40](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L40)

Grid width in px. Optional (omit to size to content).
