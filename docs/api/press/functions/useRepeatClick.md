[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [press](../README.md) / useRepeatClick

# Function: useRepeatClick()

> **useRepeatClick**(`button`, `onFire`, `opts?`): [`PressHandlers`](../type-aliases/PressHandlers.md)

Defined in: press.ts:155

useRepeatClick(button, onFire, opts?) — HOLD-TO-SCROLL. Press fires `onFire` once
immediately, then AUTO-REPEATS while the button is held, the gap SHRINKING each
time (`delay *= accel`, floored at `min`) so a held button scrolls faster the
longer you hold it — the key-repeat / spinner gesture. Releasing stops it.

  const [n, setN] = useState(0);
  <Container focus {...useRepeatClick("Up", () => setN((c) => c + 1))}>
    <Label string={() => "n " + n()} />
  </Container>

onPress clears any prior run, fires `onFire` once (so a single tap still acts
once), then arms a setInterval at `initial` ms; each tick fires `onFire`,
multiplies the delay by `accel` (clamped up to `min`) and RE-arms at the new delay
— only ONE live timer at a time (it reschedules, it never stacks). onRelease stops
the repeat. The id lives in a per-call closure; `track` stops a held repeat on
owner dispose. Both handlers return `true` to consume the button. Call inside a
render root so `track` binds (Rule 5).

## Parameters

### button

[`PressButton`](../type-aliases/PressButton.md)

which hardware button — `"Select" | "Up" | "Down" | "Back"`.

### onFire

() => `void`

invoked on the press and on every auto-repeat tick.

### opts?

[`RepeatClickOptions`](../type-aliases/RepeatClickOptions.md)

`{ initial=400, min=80, accel=0.8 }` — repeat tempo + acceleration.

## Returns

[`PressHandlers`](../type-aliases/PressHandlers.md)

a [PressHandlers](../type-aliases/PressHandlers.md) bag `{ onPress<Button>, onRelease<Button> }` to
  spread on a focused node.
