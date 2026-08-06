[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [flow](../README.md) / For

# Function: For()

> **For**\<`T`\>(`props`): `Container`

Defined in: [flow.ts:367](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L367)

For({ each, key, children }) — keyed reconcile. `each` is a thunk
returning an array; `key` maps item -> unique key (default: identity);
`children` is (item, index) -> node. Rows whose keys survive are kept;
new keys mount in their own root; removed keys dispose; a DUPLICATE key
keeps its first occurrence and the later items are skipped. Reconcile
does MINIMAL piu ops (remove departed, insert/move only misplaced
nodes) — a full empty()+re-add per update destabilizes the piu Pebble
port and costs native churn per row (measured: app death after ~15-25
cycles).

## Type Parameters

### T

`T`

## Parameters

### props

[`ForProps`](../type-aliases/ForProps.md)\<`T`\>

## Returns

`Container`
