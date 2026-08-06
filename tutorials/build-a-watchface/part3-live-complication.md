# Part 3 — a live complication

Goal: add an hour-based greeting ("good morning / afternoon / evening"),
*derived* from the hour with `computed`. It's a tiny feature, but it teaches
the payoff of fine-grained reactivity: a `computed` re-evaluates only when its
inputs change, and its Label repaints only then — while the seconds line ticks
every second.

## Split the time into fields

First, keep the hour as its own signal so we can derive from it:

```tsx
const [hh, setHh] = useState(0);
const [mm, setMm] = useState(0);
const [ss, setSs] = useState(0);
const [day, setDay] = useState("");

function tick() {
  const d = new Date();
  setHh(d.getHours());
  setMm(d.getMinutes());
  setSs(d.getSeconds());
  setDay(DAYS[d.getDay()] + " " + two(d.getDate()) + "." + two(d.getMonth() + 1));
}
```

## Derive the greeting with `computed`

```tsx
import { computed, useState } from "runtime/signals";

// re-derives only when hh() changes — i.e. on the hour, not the second
const greeting = computed(() => {
  const h = hh();
  return h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
});
```

and render it. **Read a `computed` with `.value`, not `()`:**

```tsx
<Label style={greetStyle} string={() => greeting.value} />
```

The finished file is [`src/watchface.tsx`](src/watchface.tsx).

## The three read syntaxes (don't trip on this)

pebble-signals has three source kinds and — for now — three read syntaxes:

| you wrote | how you read it |
|---|---|
| `const [hh] = useState(0)` | **call**: `hh()` |
| `const s = signal(0)` | **`.value`**: `s.value` |
| `const g = computed(() => …)` | **`.value`**: `g.value` |

`computed` and `signal` return a `{ value }` object; `useState` returns a
`[getter, setter]` pair. If you accidentally *call* a computed (`greeting()`),
it throws at runtime — and pebble-signals's error guard swallows subscriber
exceptions so the machine survives, which means the symptom is a **blank
Label**, not a crash. If a binding renders nothing, check you used `.value`.
(Unifying these three into one syntax is a tracked ergonomics task.)

## What just happened — the payoff

`greeting` is a `computed` that reads `hh()`. It subscribes to the hour and
nothing else, so:

- the **seconds** Label re-runs every second;
- the **time** Label re-runs once a minute;
- the **greeting** `computed` re-derives — and its Label repaints — only when
  the hour band changes, a few times a day.

You don't orchestrate any of that. The reactive graph tracks exactly which
Label reads which signal and updates only what changed, with a flat heap (no
allocation per update in steady state). On a watch that runs this face 24/7,
"don't repaint what didn't change" is the difference between smooth and dead
battery. (`computed` also *caches*: read `greeting.value` ten times in one
frame and the function body runs at most once.)

## Where does state go? (both placements work)

This tutorial declares its signals at **module scope** — next to the skins,
above `render()`. If you come from React that looks like a global-variable
sin: there, state must live inside the component so each instance gets its
own copy across re-renders. pebble-signals has **no re-render**, so a component
function runs exactly once — and state is created once *wherever you declare
it*. Both placements cost the same RAM and both are idiomatic:

```tsx
// A) module scope — clean for a single-screen app (this tutorial)
const [ss, setSs] = useState(0);

// B) inside the component — the React-familiar shape, and REQUIRED the
//    moment a component is reusable (each call site needs its own state)
import type { Component } from "runtime/jsx-runtime";

type BlinkProps = { label: string };
const Blink: Component<BlinkProps> = (props) => {
  const [on, setOn] = useState(true);        // created once, at mount
  setInterval(() => setOn((v) => !v), 1000);
  return <Label string={() => (on() ? props.label : "")} />;
};
// <Blink label="⚑" /> twice on screen = two independent `on` signals
```

Rule of thumb: one screen, one owner → module scope reads cleanest; a
component used more than once (or shipped for others) → state inside, props
typed with `Component<P>`. There is no hooks-order rule and no "must be
inside a component" rule — `useState` is an ordinary function call.

## Where to go next

- **Mix in hand-written Piu:** the `coexist` example adds imperative
  `new Label(...)` next to JSX — useful when migrating an Alloy face.
- **Persist state:** `device.keyValue.open()` is the proper on-watch
  key/value store (see the roadmap's `deviceinfo` example).
- **Bigger UIs:** for lists and multiple screens that would blow the 32 KB
  arena, see the `list` (recycled cells) and `lazyscreen` (`importNow`)
  examples, and `docs/xs-heap-playbook.md`.
