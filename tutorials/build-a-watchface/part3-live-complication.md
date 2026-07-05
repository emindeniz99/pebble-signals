# Part 3 — a live complication

Goal: add an hour-based greeting ("good morning / afternoon / evening"). It's a
tiny feature, but it teaches the single most important thing about signal-piu:
**a Label only repaints when its value actually changes** — even if you write
to its signal every second.

## Add the greeting

```tsx
const [greeting, setGreeting] = useState("");

function tick() {
  const d = new Date();
  const h = d.getHours();
  setHhmm(two(h) + ":" + two(d.getMinutes()));
  setSs(two(d.getSeconds()));
  setDay(DAYS[d.getDay()] + " " + two(d.getDate()) + "." + two(d.getMonth() + 1));
  setGreeting(h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening");
}
```

and one more Label at the top of the `<Column>`:

```tsx
<Label style={greetStyle} string={() => greeting()} />
```

The finished file is [`src/watchface.tsx`](src/watchface.tsx).

## What just happened — the payoff

Look closely at `tick()`: it calls `setGreeting(...)` **every second**, with
the *same* string for most of the hour. Yet the greeting line does not flicker
or repaint every second — only the seconds line does.

That's because **signal-piu skips same-value writes.** Internally a set is
`if (next !== current) notify()`. When you `setGreeting("good morning")` and it
was already `"good morning"`, nothing is marked dirty, no effect re-runs, no
Piu node is touched. The greeting Label repaints exactly once per hour band, at
the boundary where the text really changes.

This is *fine-grained reactivity* in one screen:

- the **seconds** Label re-runs every second (its value changes every second);
- the **time** Label re-runs once a minute;
- the **greeting** Label re-runs a few times a day.

…all from one `tick()` that naively sets everything every second. You don't
orchestrate any of that — the reactive graph does, and it does it with a flat
heap (no allocation per update in steady state). On a watch that runs this face
24/7, "don't repaint what didn't change" is the difference between smooth and
dead battery.

## A note on `computed`

You might reach for `computed(() => hh() < 12 ? … )` to derive the greeting
instead of setting it in `tick()`. `computed` is a real primitive in the API
and is covered by the conformance laws — but there is a **known open issue**
(2026-07): a *module-scope* `computed` read directly inside a JSX `string={}`
thunk currently renders blank on-device in this exact shape. Until that's
root-caused (tracked in `docs/roadmap.md`), derive values the way this tutorial
does — compute in the updater and set a plain signal. Same result, and it
teaches the same-value-skip lesson better anyway.

## Where to go next

- **Mix in hand-written Piu:** the `coexist` example adds imperative
  `new Label(...)` next to JSX — useful when migrating an Alloy face.
- **Persist state:** `device.keyValue.open()` is the proper on-watch
  key/value store (see the roadmap's `deviceinfo` example).
- **Bigger UIs:** for lists and multiple screens that would blow the 32 KB
  arena, see the `list` (recycled cells) and `lazyscreen` (`importNow`)
  examples, and `docs/xs-heap-playbook.md`.
