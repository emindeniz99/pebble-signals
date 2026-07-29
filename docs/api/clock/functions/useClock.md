[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [clock](../README.md) / useClock

# Function: useClock()

> **useClock**(`granularity?`): () => `Date`

Defined in: clock.ts:96

A reactive current-time getter — the RN `useClock` analog.

  const now = useClock();                                     // ticks every second
  <Label string={() => now().toTimeString().slice(0, 8)} />  // reactive HH:MM:SS
  const slow = useClock("minute");                           // ticks on the minute

Subscribes to the host's native tick service (`watch.addEventListener` on
"secondchange" / "minutechange"): ONE shared, wall-clock-aligned firmware
timer that fires immediately on subscribe then on each boundary (see the
module header). The returned getter reads a signal SEEDED with `new Date()`,
so it holds a valid Date synchronously; each tick writes a fresh Date and the
getter's readers repaint. Auto-cleans on owner dispose via [onCleanup](../../signals/functions/onCleanup.md) —
MUST be called inside a reactive owner (the render build / a component), not
at module scope.

## Parameters

### granularity?

[`ClockGranularity`](../type-aliases/ClockGranularity.md) = `"second"`

`"second"` (default) subscribes to "secondchange";
  `"minute"` / `"hour"` / `"day"` subscribe to the matching coarser host
  boundary (cheaper — a date-only display should use `"day"`).

## Returns

a getter `() => Date`; call it inside a binding thunk to subscribe.

() => `Date`
