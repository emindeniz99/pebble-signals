[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / VLRich

# Type Alias: VLRich\<T\>

> **VLRich**\<`T`\> = `VLBase`\<`T`\> & `object`

Defined in: flow.ts:138

[VirtualList](../functions/VirtualList.md) rich mode: a recycled SUBTREE per slot via `renderRow`
(built once, never destroyed). Mutually exclusive with `format`. Each
extra node per row costs arena — the measured ceiling is brutal (see the
`richlist` example).

⚠️ rich mode is only device-proven at `rows: 1` (the `richlist` example).
`renderRow` with `rows>1` HANGS the gabbro firmware (MEASURED 2026-07 —
the screenshot/watch-info transport times out; reproduced non-scrolling and
string-only, so it is the rich multi-row layout itself, not the content or
the scroll). For a scrollable MULTI-row list use simple mode (`format`),
which is device-proven at `rows: 5` (`forbind5vl`). `SectionList` is
device-gated for exactly this reason.

## Type Declaration

### format?

> `optional` **format?**: `never`

### renderRow

> **renderRow**: (`indexThunk`, `data`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Slot builder: `indexThunk()` is the slot's CURRENT record index (reads
live). Must return ONE element per slot (array/null throws loud — same
port constraint as [ForProps.children](ForProps.md)).

#### Parameters

##### indexThunk

[`Thunk`](Thunk.md)\<`number`\>

##### data

[`DataSource`](DataSource.md)\<`T`\>

#### Returns

[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

## Type Parameters

### T

`T`
