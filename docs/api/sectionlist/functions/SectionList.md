[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [sectionlist](../README.md) / SectionList

# Function: SectionList()

> **SectionList**\<`H`, `R`\>(`props`): `Content`

Defined in: [sectionlist.ts:134](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sectionlist.ts#L134)

SectionList — a grouped list of section HEADERS + item ROWS over a recycled
window: React Native's <SectionList> on a watch.

  const [sel, setSel] = useState(0);
  <SectionList
    sections={() => [{ header: "Fruit", rows: ["Apple", "Pear"] }, …]}
    renderHeader={(h) => h} renderRow={(r) => r}
    selected={sel} rows={5} height={170} />

DISPLAY-ONLY (Rule 8) — the app owns the selected ITEM index and drives it
(buttons / a rotary); SectionList highlights that row and keeps it in view. The
sections+headers share one DERIVED flat index space over a standalone window
that recycles a fixed `rows` slot Labels as the window moves (RAM O(rows)).
Each slot's `string`/`style`/`skin` (all REACTIVE_PROPS-whitelisted) are driven
by ONE effect that dispatches on the current record's type — a bold header, a
normal row, or an active row (fill Skin) when selected. `selected` is an ITEM
index over ROWS only, so it can never land on a header. See the module header
for the derive + keep-in-view contract.

## Type Parameters

### H

`H` = `unknown`

### R

`R` = `unknown`

## Parameters

### props

[`SectionListProps`](../type-aliases/SectionListProps.md)\<`H`, `R`\>

## Returns

`Content`
