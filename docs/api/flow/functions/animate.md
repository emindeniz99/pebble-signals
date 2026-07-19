[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / animate

# Function: animate()

> **animate**(`from`, `to`, `ms`, `easing?`): [`Tween`](../interfaces/Tween.md)

Defined in: flow.ts:633

animate(from, to, ms, easing?) — a Reanimated-style tween. Returns a getter
thunk backed by a signal; the shared ~30fps ticker eases the value from -> to
over `ms` and drops it when it lands. Read it in a binding to drive UI:
  const x = animate(0, 100, 400);
  <Label string={() => "x " + Math.round(x())} />
`easing` maps progress 0..1 -> 0..1 (default linear). The tween is registered
with the current owner, so disposing the subtree that created it stops it;
`.stop()` cancels manually. setInterval is always present on device (the base
mod manifest provides the timer module) — no no-timer fallback: if it is ever
absent the throw is the correct fail-loud signal (a missing timer module),
not a silently frozen tween.

## Parameters

### from

`number`

### to

`number`

### ms

`number`

### easing?

(`t`) => `number`

## Returns

[`Tween`](../interfaces/Tween.md)
