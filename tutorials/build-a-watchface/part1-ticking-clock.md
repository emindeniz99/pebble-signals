# Part 1 — a ticking clock

Goal: the smallest possible reactive watchface — the current time, updating
every second. By the end you'll understand the two ideas everything else
builds on: a **signal** and a **binding**.

## The whole thing

```tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });

const two = (n: number) => (n < 10 ? "0" : "") + n;

// 1. a signal: a value the UI can subscribe to
const [hhmm, setHhmm] = useState("");

// 2. update it once a second
function tick() {
  const d = new Date();
  setHhmm(two(d.getHours()) + ":" + two(d.getMinutes()));
}
tick();
setInterval(tick, 1000);

// 3. a binding: `string={() => hhmm()}` re-runs when hhmm changes
render(() => (
  <Container left={0} right={0} top={0} bottom={0}>
    <Label style={timeStyle} string={() => hhmm()} />
  </Container>
), { skin: bg, style: timeStyle });
```

Build it:

```bash
npm run dev -- --app watchface
```

## What just happened

**`useState("")` is a signal.** It returns a `[getter, setter]` pair — read
the value with `hhmm()`, change it with `setHhmm(...)`. This is the same shape
as React's `useState`, but the resemblance stops there: there is no component
re-render. The signal is a tiny node in a reactive graph.

**`string={() => hhmm()}` is a binding.** The `() =>` matters. If you wrote
`string={hhmm()}` you'd pass the *current string once* and it would never
update. By passing a *function that reads the signal*, signal-piu runs it once
to get the initial text AND records that this `<Label>` depends on `hhmm`.
When `setHhmm` later changes the value, only this Label's text is recomputed
and repainted — nothing else on screen is touched.

**No VDOM, no diff.** Compare to React, which would re-run your component and
diff a virtual tree. Here the subscription is direct: signal → this one Label.
On a 32 KB watch that difference is not a nicety, it's what makes it possible.

**`Container`, `Label`, `Skin`, `Style` are host globals** — real Piu objects
the firmware provides. signal-piu's JSX creates them for you; you can also
`new Label(...)` by hand and mix the two (see the `coexist` example).

## Try it

- Change `two(d.getMinutes())` to `two(d.getSeconds())` — now it ticks visibly
  every second.
- Remove the `() =>` from the binding and rebuild. The clock freezes at its
  first value — proof that the thunk is what makes it reactive.

Next: [Part 2 — date & layout](part2-date-and-layout.md).
