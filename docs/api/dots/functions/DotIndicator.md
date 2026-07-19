[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [dots](../README.md) / DotIndicator

# Function: DotIndicator()

> **DotIndicator**(`props`): `Content`

Defined in: dots.ts:48

DotIndicator — a reactive row of dots with one highlighted, on ONE Piu Port.

  const [page] = useState(0);
  <DotIndicator count={4} active={page} />       // reactive: the dot moves
  <DotIndicator count={3} active={1} on="cyan" /> // static

Composes [Canvas](../../draw/functions/Canvas.md): `active` read inside `paint` auto-tracks, so the
highlight moves for free when a signal it reads changes. See the module header.

## Parameters

### props

[`DotIndicatorProps`](../type-aliases/DotIndicatorProps.md)

## Returns

`Content`
