[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [meter](../README.md) / Meter

# Function: Meter()

> **Meter**(`props`): `Content`

Defined in: meter.ts:54

Meter — a reactive segmented linear meter (battery / signal bars), on ONE
Piu Port.

  const [level] = useState(0.6);
  <Meter value={level} />                    // reactive: repaints when level changes
  <Meter value={0.4} segments={4} on="lime" />// static, 4 bars

Composes [Canvas](../../draw/functions/Canvas.md): the `value` read inside `paint` auto-tracks, so the
meter repaints for free when a signal it reads changes. See the module header.

## Parameters

### props

[`MeterProps`](../type-aliases/MeterProps.md)

## Returns

`Content`
