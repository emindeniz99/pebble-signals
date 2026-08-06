[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [progressbar](../README.md) / ProgressBar

# Function: ProgressBar()

> **ProgressBar**(`props`): `Content`

Defined in: [progressbar.ts:54](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/progressbar.ts#L54)

ProgressBar — a reactive horizontal progress bar on ONE Piu Port.

  const [v] = useState(0.5);
  <ProgressBar value={v} />               // reactive: repaints when v changes
  <ProgressBar value={0.25} width={80} /> // static

Composes [Canvas](../../draw/functions/Canvas.md): the `value` read inside `paint` auto-tracks, so the
bar repaints for free when a signal it reads changes. `value` is clamped to
`[0,1]`; `0` draws no fill, `1` fills the whole track. See the module header.

## Parameters

### props

[`ProgressBarProps`](../type-aliases/ProgressBarProps.md)

## Returns

`Content`
