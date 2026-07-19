[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [draw](../README.md) / Canvas

# Function: Canvas()

> **Canvas**(`props`): `Content`

Defined in: draw.ts:117

Canvas — a reactive immediate-mode drawing surface on ONE Piu Port.

  const cx = useState(64)[0];
  <Canvas width={128} height={128} fill="black"
    paint={(g) => g.fillCircle(cx(), 64, 20, "red")} />

The circle follows `cx()` because `paint`'s reads are auto-tracked. See the
module header for the substrate + reactivity contract.

## Parameters

### props

[`CanvasProps`](../type-aliases/CanvasProps.md)

## Returns

`Content`
