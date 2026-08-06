[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [grid](../README.md) / Grid

# Function: Grid()

> **Grid**\<`T`\>(`props`): `Content`

Defined in: [grid.ts:58](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/grid.ts#L58)

Grid — lay items out in `columns`-wide rows: the RN `FlatList numColumns`
analog (app launchers, icon pickers, keypads).

  <Grid columns={3} items={icons} cell={(it, i) => <Label string={it.label} width={40} height={40} />} />

Builds a Column of ceil(n / columns) Rows, each holding up to `columns` cells
from `cell(item, index)`; the last row is short when n isn't a multiple. STATIC
structure — Piu lays it out once at construction (for a changing item set, drive
<For>/VirtualList over the rows instead). Cells own their own size (Grid is a
pure layout wrapper — gotcha 16 is per-cell). Built per-call at runtime (Rule 5
— no module scope). See the module header.

## Type Parameters

### T

`T`

## Parameters

### props

[`GridProps`](../type-aliases/GridProps.md)\<`T`\>

## Returns

`Content`
