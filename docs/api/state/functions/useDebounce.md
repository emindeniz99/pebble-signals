[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [state](../README.md) / useDebounce

# Function: useDebounce()

> **useDebounce**\<`T`\>(`source`, `delayMs`): () => `T`

Defined in: state.ts:161

useDebounce(source, delayMs) — a getter that trails `source` but settles only
after it has been stable for `delayMs`.

  const [count] = useCounter(0);
  const settled = useDebounce(count, 400);
  <Label string={() => "raw " + count()} />
  <Label string={() => "settled " + settled()} />  // lags 400ms behind

ONE effect subscribes to `source()`; each change cancels the previous pending
timeout (the effect's own owner drain — see the module header) and arms a new
`useTimeout(delayMs)` that writes the latest source value into an internal
signal, so a burst of changes collapses to only the LAST. The pending timeout
auto-cancels when the owner is disposed. `source` should read a signal (that
is what makes the effect re-run); `delayMs` is a static number.

## Type Parameters

### T

`T`

## Parameters

### source

() => `T`

the reactive value to trail.

### delayMs

`number`

quiet time (ms) before the value settles.

## Returns

a reactive getter for the debounced value.

() => `T`
