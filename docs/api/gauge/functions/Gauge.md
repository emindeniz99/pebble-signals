[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [gauge](../README.md) / Gauge

# Function: Gauge()

> **Gauge**(`props`): `Content`

Defined in: [gauge.ts:82](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/gauge.ts#L82)

Gauge — a reactive circular gauge/dial on ONE Piu Port.

  const [v] = useState(0.5);
  <Gauge value={v} label={(x) => Math.round(x * 100) + "%"} /> // reactive
  <Gauge value={0.25} size={80} />                             // static

Composes [Canvas](../../draw/functions/Canvas.md): the `value` read inside `paint` auto-tracks, so the
gauge repaints for free when a signal it reads changes. `value` is clamped to
`[0,1]`; `0` draws only the track (no fill arc). See the module header.

## Parameters

### props

[`GaugeProps`](../type-aliases/GaugeProps.md)

## Returns

`Content`
