[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [timers](../README.md) / useInterval

# Function: useInterval()

> **useInterval**(`callback`, `delay`): () => `void`

Defined in: timers.ts:63

useInterval(callback, delay) — run `callback` every `delay` ms on the
device's single interval timer. Returns a manual `cancel()`.

  useInterval(() => setCount((c) => c + 1), 1000);        // static: every 1s
  useInterval(tick, () => paused() ? null : 1000);        // reactive: pausable
  const cancel = useInterval(poll, 500); cancel();        // manual stop

A bare-number `delay` arms once; `null` arms nothing. A THUNK `delay` is
reactive — ONE effect re-reads it and, on every change, clearInterval's the
previous timer (at the top of the run) before creating the new one, so a
delay change never leaks a timer and a `null` return pauses with zero live
timers (idiom 5b). The interval is auto-cleared when the owning screen is
disposed (mirrors animate()'s `track(stop)`); `cancel()` clears it by hand.
See the module header for the teardown contract.

## Parameters

### callback

() => `void`

### delay

[`TimerDelay`](../type-aliases/TimerDelay.md)

## Returns

() => `void`
