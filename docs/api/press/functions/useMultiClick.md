[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [press](../README.md) / useMultiClick

# Function: useMultiClick()

> **useMultiClick**(`button`, `handlers`, `opts?`): [`PressHandlers`](../type-aliases/PressHandlers.md)

Defined in: press.ts:242

useMultiClick(button, handlers, opts?) — DOUBLE / TRIPLE CLICK. Counts how many
times `button` is clicked within a rolling `window` ms of quiet, then dispatches
`handlers[count]` — `handlers[2]` for a double-click, `handlers[3]` for a triple,
and so on. A count with no entry in `handlers` is a no-op.

  <Container focus {...useMultiClick("Down", { 2: reset, 3: hardReset })}>
    …
  </Container>

onPress increments the click count (and pauses the idle countdown while the button
is held); onRelease (re)arms a ONE-SHOT `window` timer — a setInterval that clears
itself before firing (no setTimeout on device; the timers.ts useTimeout shape).
Each further click within `window` bumps the count and restarts the timer, so a
burst collapses to ONE dispatch; once the button has been quiet for `window` the
one-shot fires `handlers[count]` (if present) and RESETS the count to 0. The id +
count live in per-call closures; `track` clears a pending timer on owner dispose.
Both handlers return `true` to consume the button. Call inside a render root so
`track` binds (Rule 5).

## Parameters

### button

[`PressButton`](../type-aliases/PressButton.md)

which hardware button — `"Select" | "Up" | "Down" | "Back"`.

### handlers

`Record`\<`number`, () => `void`\>

map of click-count → callback (`{ 2: dbl, 3: triple }`).

### opts?

[`MultiClickOptions`](../type-aliases/MultiClickOptions.md)

`{ window=300 }` — the inter-click quiet time that ends a burst.

## Returns

[`PressHandlers`](../type-aliases/PressHandlers.md)

a [PressHandlers](../type-aliases/PressHandlers.md) bag `{ onPress<Button>, onRelease<Button> }` to
  spread on a focused node.
