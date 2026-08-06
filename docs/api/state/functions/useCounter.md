[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [state](../README.md) / useCounter

# Function: useCounter()

> **useCounter**(`initial?`, `opts?`): \[() => `number`, [`CounterControls`](../interfaces/CounterControls.md)\]

Defined in: [state.ts:113](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/state.ts#L113)

useCounter(initial?, opts?) — a bounded number with inc/dec/reset/set.

  const [count, c] = useCounter(0, { min: 0, max: 10 });
  <Label string={() => "n " + count()} />   // reactive read
  onPressUp={c.inc} onPressDown={c.dec}      // step ±1, clamped 0..10

Returns `[count, controls]`: `count()` reads the value (reactive); `controls`
is `{ inc, dec, reset, set }`. inc/dec move by `step` and CLAMP to `[min,max]`
(each bound independent and optional); `reset()` restores `clamp(initial)`;
`set(n)` writes `clamp(n)`. The initial value is ALSO clamped, so `count()`
never leaves the range. Built on useState.

## Parameters

### initial?

`number` = `0`

starting value, clamped into range (default `0`).

### opts?

[`CounterOptions`](../interfaces/CounterOptions.md)

`{ step=1, min?, max? }`.

## Returns

\[() => `number`, [`CounterControls`](../interfaces/CounterControls.md)\]
