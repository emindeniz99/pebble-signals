[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / VirtualList

# Function: VirtualList()

> **VirtualList**\<`T`\>(`props`): `Container`

Defined in: flow.ts:487

VirtualList({ data, rows, at, format, ... }) — a virtualized ("windowed")
list; our FlatList. Creates a FIXED set of `rows` Labels ONCE and rewrites
their .string as the window moves — CELL RECYCLING: nodes are never
created or destroyed on scroll, so RAM is O(rows), not O(items). Any data
source with count() and get(i) works (the byte-record store is one), so
item DATA lives outside the arena (bytes) while only `rows` Piu nodes
exist — that is the whole trick behind an unbounded list on 32KB.
  data:   { count(): number, get(i): value }
  rows:   visible row count (default 3)
  at:     thunk -> window start index (read a signal inside it to scroll)
  format: (value, index) -> string  (default String(value))

PERF / LAZY DATA: only `rows` nodes ever exist (recycled), and get(i) is
called ONLY for the visible window — so the data source can lazy-fetch or
lazy-compute inside get(i) and an "unbounded" list costs O(rows) RAM. Keep
`rows` small (each row is live Piu nodes on the 32KB heap); use `format`
(one Label/row, cheap) over `renderRow` (a subtree/row) unless you need it.
A const arrow, not a `function` declaration (preloaded-module alias rule,
gotcha 13). Overscan is intentionally omitted: this port redraws text
instantly with no pixel/momentum scroll, so pre-mounting off-screen rows
buys nothing (there is no lazy mount to warm) — we render exactly `rows`.

## Type Parameters

### T

`T`

## Parameters

### props

[`VLSimple`](../type-aliases/VLSimple.md)\<`T`\> \| [`VLRich`](../type-aliases/VLRich.md)\<`T`\>

## Returns

`Container`
