[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [textflow](../README.md) / wrapText

# Function: wrapText()

> **wrapText**(`text`, `charsPerLine`, `maxLines`): `string`[]

Defined in: [textflow.ts:91](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/textflow.ts#L91)

Greedily word-wrap `text` into at most `maxLines` lines, each at most
`charsPerLine` characters long (counting the single spaces that join words).
Pure — no Piu, no signals — so it is unit-testable in isolation and reused by
[TextFlow](TextFlow.md).

Rules (all device-safe — none can crash or loop):
- Whitespace runs split words; leading / trailing / repeated whitespace
  collapses (empty tokens are skipped).
- A word joins the current line when `line + " " + word` still fits; otherwise
  the current line is committed and the word begins the next.
- A single word LONGER than `charsPerLine` takes its own line — it overflows
  visually but is never split and never crashes (the first word of a line is
  always placed regardless of the budget).
- At most `maxLines` lines are returned; remaining words are dropped.
  `maxLines <= 0` yields no lines; empty / whitespace-only text yields no lines.

## Parameters

### text

`string`

the paragraph to wrap

### charsPerLine

`number`

per-line character budget (a lone word may exceed it)

### maxLines

`number`

hard cap on returned lines (extra lines dropped)

## Returns

`string`[]

the wrapped lines, in order
