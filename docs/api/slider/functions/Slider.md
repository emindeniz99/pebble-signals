[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [slider](../README.md) / Slider

# Function: Slider()

> **Slider**(`props`): `Content`

Defined in: slider.ts:57

Slider — a reactive horizontal track with a thumb marking a value, on ONE
Piu Port.

  const [v, setV] = useState(0.5);
  <Slider value={v} />                    // reactive: thumb follows v
  <Slider value={30} min={0} max={100} /> // static

Composes [Canvas](../../draw/functions/Canvas.md): the `value` read inside `paint` auto-tracks, so the
thumb repaints for free when a signal it reads changes. See the module header.

## Parameters

### props

[`SliderProps`](../type-aliases/SliderProps.md)

## Returns

`Content`
