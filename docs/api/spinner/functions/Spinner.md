[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [spinner](../README.md) / Spinner

# Function: Spinner()

> **Spinner**(`props`): `Content`

Defined in: spinner.ts:85

Spinner — an animated indeterminate loading indicator on ONE Piu Port.

  <Spinner />                                   // 48px, spins immediately
  <Spinner size={64} trackColor="#202020" />    // with a faint track ring
  const [busy] = useState(true);
  <Spinner running={busy} />                     // reactive: freezes when false

Composes [Canvas](../../draw/functions/Canvas.md): an INTERNAL `angle` signal, advanced by a lazily
created ~30fps `setInterval`, is read inside `paint`, so the Canvas effect
auto-tracks and rotates the arc segment for free. Unlike the display-only
widgets, a Spinner OWNS its animation (a loader animates itself); the timer
stops on owner dispose via [track](../../signals/functions/track.md), and a thunk `running` starts/stops
it reactively. See the module header for the full contract.

## Parameters

### props

[`SpinnerProps`](../type-aliases/SpinnerProps.md)

## Returns

`Content`
