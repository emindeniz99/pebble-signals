[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [state](../README.md) / useToggle

# Function: useToggle()

> **useToggle**(`initial?`): \[() => `boolean`, () => `void`, (`v`) => `void`\]

Defined in: state.ts:66

useToggle(initial?) — a boolean signal with a flip and a set.

  const [on, toggle, setOn] = useToggle();       // starts false
  <Label string={() => (on() ? "ON" : "OFF")} /> // reactive read
  onPressSelect={toggle}                          // flip it
  setOn(true);                                    // or set it outright

Returns `[value, toggle, setValue]`: `value()` reads the current boolean
(reactive), `toggle()` flips it, `setValue(v)` sets it. Built on useState.

## Parameters

### initial?

`boolean` = `false`

starting value (default `false`).

## Returns

\[() => `boolean`, () => `void`, (`v`) => `void`\]
