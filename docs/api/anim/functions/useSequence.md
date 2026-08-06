[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [anim](../README.md) / useSequence

# Function: useSequence()

> **useSequence**(`steps`, `opts?`): () => `number` & `object`

Defined in: [anim.ts:200](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L200)

useSequence(steps, opts?) — chain keyframes into one motion on the device's
single interval timer: the RN Reanimated `withSequence` analog with Solid
ownership. Returns a getter `() => number`; read it in a binding to drive UI.

  const x = useSequence([{ to: 100, ms: 200 }, { hold: 300 }, { to: 0, ms: 400, ease: quadInOut }]);
  <Label string={() => String(Math.round(x()))} />

Each move eases FROM where the previous step ended (the first from `opts.from`,
default 0); a `{ hold: ms }` step stays put. The steps are planned into a flat
segment list ONCE at call time; ONE `setInterval` (~30fps) advances elapsed ms
and writes the piecewise-eased value into a signal. Non-looping, it settles on
the final value and releases the timer; `opts.loop` wraps elapsed modulo the
total and never stops. The timer is auto-cleared when the owning screen is
disposed (the timers.ts `track(clear)` contract); the returned getter carries a
manual `.stop()`. Zero module scope — the signal, timer and plan are all built
inside the call (Rule 5). Feed it [withDelay](withDelay.md)/[withRepeat](withRepeat.md)/[yoyo](yoyo.md).

## Parameters

### steps

[`SeqStep`](../type-aliases/SeqStep.md)[]

### opts?

[`SequenceOptions`](../type-aliases/SequenceOptions.md)

## Returns

() => `number` & `object`
