[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [sparkline](../README.md) / Sparkline

# Function: Sparkline()

> **Sparkline**(`props`): `Content`

Defined in: [sparkline.ts:52](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/sparkline.ts#L52)

Sparkline — a reactive mini line chart on ONE Piu Port.

  const [xs] = useState([3, 1, 4, 1, 5]);
  <Sparkline data={xs} />                       // reactive: repaints when xs changes
  <Sparkline data={[1, 2, 3]} color="lime" />   // static

Composes [Canvas](../../draw/functions/Canvas.md): the `data` read inside `paint` auto-tracks, so the
chart repaints for free when a signal it reads changes. See the module header
for the mapping + edge-case contract.

## Parameters

### props

[`SparklineProps`](../type-aliases/SparklineProps.md)

## Returns

`Content`
