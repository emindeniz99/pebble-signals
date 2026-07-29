[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [timers](../README.md) / useTimeout

# Function: useTimeout()

> **useTimeout**(`callback`, `delay`): () => `void`

Defined in: timers.ts:114

useTimeout(callback, delay) — run `callback` ONCE, `delay` ms from now, then
self-clear. Returns a manual `cancel()`.

  useTimeout(() => setDone(true), 3000);                  // fire once after 3s
  const cancel = useTimeout(hide, 2000); cancel();        // cancel before it fires

Implemented as a setInterval (written when setTimeout was believed absent
on device — REFUTED, see the module header; kept as-is, it works) whose
callback clearInterval's its OWN timer before invoking `callback` — clearing
first means it fires exactly once even if `callback` throws. A bare-number
`delay` arms once; `null` arms nothing. A THUNK `delay` is reactive with the
same one-effect teardown as [useInterval](useInterval.md): changing the delay re-arms
the one-shot (the pending fire is cancelled and a fresh countdown starts —
including after it already fired, so pass a plain number for a true one-shot),
and a `null` return pauses it. Auto-cleared on owner dispose; `cancel()` stops
a pending fire by hand.

## Parameters

### callback

() => `void`

### delay

[`TimerDelay`](../type-aliases/TimerDelay.md)

## Returns

() => `void`
