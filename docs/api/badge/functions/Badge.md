[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [badge](../README.md) / Badge

# Function: Badge()

> **Badge**(`props`): `Content`

Defined in: badge.ts:70

Badge — a reactive filled disc with a centered number, on ONE Piu Port.

  const [n] = useState(3);
  <Badge count={n} />              // reactive: repaints when n changes
  <Badge count={7} color="blue" /> // static

Composes [Canvas](../../draw/functions/Canvas.md): the `count` read inside `paint` auto-tracks, so the
badge repaints for free when a signal it reads changes. See the module header.

## Parameters

### props

[`BadgeProps`](../type-aliases/BadgeProps.md)

## Returns

`Content`
