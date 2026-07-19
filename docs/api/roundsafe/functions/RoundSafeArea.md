[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [roundsafe](../README.md) / RoundSafeArea

# Function: RoundSafeArea()

> **RoundSafeArea**(`props`): `Content`

Defined in: roundsafe.ts:55

RoundSafeArea — inset children to the round-screen safe area.

  <RoundSafeArea>
    <StatusBar title="Inbox" />   // no longer bezel-clipped on gabbro
  </RoundSafeArea>

On a ROUND screen (gabbro, `screen.round`) returns a Container inset by
`inset` (default 18) on all sides — centered, with an explicit width/height
of screen.{width,height} - 2*inset. On a RECT screen (emery) returns a
full-bleed Container (all edges 0, full screen width/height) — a pass-through.
`children` mount in both cases. See the module header for the gotcha-16
explicit-size contract.

## Parameters

### props

[`RoundSafeAreaProps`](../type-aliases/RoundSafeAreaProps.md)

## Returns

`Content`
