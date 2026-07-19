[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [toggle](../README.md) / Toggle

# Function: Toggle()

> **Toggle**(`props`): `Content`

Defined in: toggle.ts:59

Toggle — a reactive on/off pill with a sliding knob, on ONE Piu Port.

  const [on, setOn] = useState(false);
  <Toggle on={on} />                        // reactive: knob slides when on flips
  <Toggle on={true} onColor="blue" />       // static

Composes [Canvas](../../draw/functions/Canvas.md): the `on` read inside `paint` auto-tracks, so the
toggle repaints (knob moves right when on, left when off) for free when a
signal it reads changes. See the module header.

## Parameters

### props

[`ToggleProps`](../type-aliases/ToggleProps.md)

## Returns

`Content`
