[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [textflow](../README.md) / TextFlow

# Function: TextFlow()

> **TextFlow**(`props`): `Content`

Defined in: textflow.ts:150

TextFlow — a wrapped multi-line paragraph: a Column of Label lines.

  <TextFlow text="A long paragraph that wraps across several lines." />
  <TextFlow text={() => msg()} width={140} align="center" />   // reactive re-wrap

DISPLAY-ONLY — the app supplies the string; TextFlow wraps it (manual word-wrap
via [wrapText](wrapText.md), NOT Piu 'Text') into one Label per line. A `text` thunk is
driven by ONE effect that re-wraps + rebuilds the lines (idiom 5b); a bare
string builds once. `align="left"` is the reliable default; `align="center"`
centers each line within the block width via the shared Style's `horizontal`
key. See the module header for the composition, rebuild shape and gotchas.

## Parameters

### props

[`TextFlowProps`](../type-aliases/TextFlowProps.md)

## Returns

`Content`
