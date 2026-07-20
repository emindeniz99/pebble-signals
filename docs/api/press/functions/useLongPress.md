[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [press](../README.md) / useLongPress

# Function: useLongPress()

> **useLongPress**(`button`, `ms`, `onFire`): [`PressHandlers`](../type-aliases/PressHandlers.md)

Defined in: press.ts:90

useLongPress(button, ms, onFire) — HOLD-TO-CONFIRM. Press and hold `button` for
`ms`; `onFire` runs only if the button is STILL held when `ms` elapses. Releasing
early cancels it (nothing fires) — the classic "hold to confirm / hold to delete".

  const [ok, setOk] = useState(false);
  <Container focus {...useLongPress("Select", 600, () => setOk(true))}>
    <Label string={() => (ok() ? "confirmed" : "hold SELECT…")} />
  </Container>

onPress arms a ONE-SHOT — a setInterval that clearInterval's itself before firing
(no setTimeout on device; the timers.ts useTimeout shape) — so `onFire` runs
exactly once, `ms` after the press. onRelease clears the pending one-shot, so a
release before `ms` fires nothing. The id lives in a per-call closure; `track`
stops a still-armed hold when the owner is disposed (no leak on navigate-away).
Both handlers return `true` to consume the button. Call inside a render root so
`track` binds (Rule 5).

## Parameters

### button

[`PressButton`](../type-aliases/PressButton.md)

which hardware button — `"Select" | "Up" | "Down" | "Back"`.

### ms

`number`

hold duration (ms) the button must be held before `onFire` runs.

### onFire

() => `void`

invoked once when the button has been held `ms`.

## Returns

[`PressHandlers`](../type-aliases/PressHandlers.md)

a [PressHandlers](../type-aliases/PressHandlers.md) bag `{ onPress<Button>, onRelease<Button> }` to
  spread on a focused node.
