[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / VLRich

# Type Alias: VLRich\<T\>

> **VLRich**\<`T`\> = `VLBase`\<`T`\> & `object`

Defined in: flow.ts:151

[VirtualList](../functions/VirtualList.md) rich mode: a recycled SUBTREE per slot via `renderRow`
(built once, never destroyed). Mutually exclusive with `format`. Each
extra node per row costs arena — the measured ceiling is brutal (see the
`richlist` example).

⚠️ rich rows must not carry a FIXED HEIGHT (MEASURED on gabbro 2026-07-21;
this supersedes BOTH the original "rows>1 hangs the firmware" note and the
first re-measurement's "~2-row arena budget" reading). The A/B ladder:
  - `renderRow` -> Label with `height`, `rows: 2`  -> renders
  - `renderRow` -> Label with `height`, `rows: 3`  -> DIES
  - `renderRow` -> Label with NO height, `rows: 3` -> RENDERS  <- the tell
  - simple `format` (height-less Label),  `rows: 3`/`5` -> renders
Same app shape, same row count, same text in every cell — only the row's
height prop differs, so this is NOT an arena budget and NOT rich-vs-simple:
it is the port's "multi-child column with no vertical box" family the
Navigator host documents (a height-LESS host Column laying out FIXED-height
children dies past two). Let rich rows measure from their font, or give the
whole list a box. "Dies" = the app EXITS to the launcher, not a wedged run
loop (the original "hangs" came from the screenshot transport timing out,
which also happens when that transport rots — CLAUDE.md Rule 3).

NOTE `SectionList` still dies even with height-less rows, so it carries at
least one MORE factor (its rows also set `width` and drive `skin`/`style`
reactively, and it adds a keep-in-view effect) — bisect those next; it stays
device-gated until then.

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
