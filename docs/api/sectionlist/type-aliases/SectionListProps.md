[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [sectionlist](../README.md) / SectionListProps

# Type Alias: SectionListProps\<H, R\>

> **SectionListProps**\<`H`, `R`\> = `object`

Defined in: [sectionlist.ts:85](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L85)

Props for [SectionList](../functions/SectionList.md).

## Type Parameters

### H

`H` = `unknown`

### R

`R` = `unknown`

## Properties

### height?

> `optional` **height?**: `number`

Defined in: [sectionlist.ts:111](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L111)

List height in px — split evenly into `rows` row heights. Defaults to `rows * 34`.

***

### renderHeader

> **renderHeader**: (`header`) => `string`

Defined in: [sectionlist.ts:95](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L95)

Header datum -> caption string (SectionList styles it BOLD; headers never highlight).

#### Parameters

##### header

`H`

#### Returns

`string`

***

### renderRow

> **renderRow**: (`row`) => `string`

Defined in: [sectionlist.ts:97](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L97)

Item datum -> caption string (SectionList styles it normal, or highlighted when selected).

#### Parameters

##### row

`R`

#### Returns

`string`

***

### rows?

> `optional` **rows?**: `number`

Defined in: [sectionlist.ts:107](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L107)

Visible slot count (recycled Labels — each is live Piu nodes on the 32KB heap; keep small). Defaults to 4.

***

### sections

> **sections**: () => [`Section`](Section.md)\<`H`, `R`\>[]

Defined in: [sectionlist.ts:93](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L93)

The sections — a THUNK returning `[{ header, rows }, …]`, read ONCE at
construction (like grid.ts's `items`): Piu lays the list out at construction
and VirtualList windows a FIXED flat model, so a CHANGING section set means
rebuilding the screen, not mutating this. The thunk is purely so a caller can
compute the sections inline.

#### Returns

[`Section`](Section.md)\<`H`, `R`\>[]

***

### selected?

> `optional` **selected?**: `number` \| (() => `number`)

Defined in: [sectionlist.ts:105](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L105)

The selected ITEM index — 0-based over ROWS only (headers are never counted
or selectable), so "selection skips headers" holds by construction. A THUNK
(`() => i`) makes it reactive — one effect re-highlights AND keeps the row in
view on change (idiom 5b); a bare number applies once (static). Clamped to
`[0, rowCount-1]`. Omit for a static, non-highlighted list.

***

### width?

> `optional` **width?**: `number`

Defined in: [sectionlist.ts:109](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L109)

List width in px. Defaults to the screen width (a width-less list measures 0 — gotcha 16).
