[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [textflow](../README.md) / wrapCircle

# Function: wrapCircle()

> **wrapCircle**(`text`, `radius`, `lineHeight`, `maxLines`, `pxPerChar`, `fill`): `string`[]

Defined in: textflow.ts:185

Word-wrap `text` to FILL a circle of `radius` (centered vertically): each line
is packed to the chord width at its own height, so the top and bottom lines
hold fewer words and the paragraph forms a lens/circle rather than a square.
Pure — no Piu, no signals — so it is unit-testable and reused by [TextFlow](TextFlow.md)
(`shape="circle"`).

The line COUNT and the per-line budgets are mutually dependent (a taller block
pushes its end lines further off-center, narrowing them), so this iterates to a
fixed point: wrap with the current N, and if the result has a different line
count, re-wrap with that N (bounded to a few passes — this is layout, not exact
arithmetic). Lines are meant to be CENTER-aligned; the caller sizes the Column
to the full width so each centered line has its chord available.

## Parameters

### text

`string`

the paragraph to wrap

### radius

`number`

the circle radius in px (typically screen radius minus a bezel)

### lineHeight

`number`

per-line vertical pitch in px (sets each line's `dy`)

### maxLines

`number`

hard cap on returned lines (extra lines dropped)

### pxPerChar

`number`

approximate px per glyph at the font

### fill

`number`

fraction of each chord to fill, 0..1 (a bezel/breath margin)

## Returns

`string`[]

the wrapped lines, in order, forming a circular silhouette
