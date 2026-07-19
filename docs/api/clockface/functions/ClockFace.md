[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [clockface](../README.md) / ClockFace

# Function: ClockFace()

> **ClockFace**(`props`): `Content`

Defined in: clockface.ts:67

ClockFace — a reactive analog clock (hour/minute[/second] hands + hour ticks)
on ONE Piu Port.

  const [m] = useState(30);
  <ClockFace hours={10} minutes={m} />            // reactive: repaints when m changes
  <ClockFace hours={3} minutes={15} seconds={45} /> // static, with a second hand

Composes [Canvas](../../draw/functions/Canvas.md): the `hours`/`minutes`/`seconds` reads inside `paint`
auto-track, so the face repaints for free when a signal it reads changes.
Omitting `seconds` draws no second hand. See the module header for the angle
contract.

## Parameters

### props

[`ClockFaceProps`](../type-aliases/ClockFaceProps.md)

## Returns

`Content`
