# Part 2 — date & layout

Goal: turn the single line from Part 1 into a real face — time, seconds, and a
date line — stacked and styled. You'll learn how signal-piu lays out (once, at
construction, fill-based) and see that each `<Label>` subscribes to *only* the
signal it reads.

## Add signals and lines

```tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const dateStyle = new Style({ font: "18px Gothic", color: "#AAAAAA" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const [hhmm, setHhmm] = useState("");
const [ss, setSs] = useState("");
const [day, setDay] = useState("");

function tick() {
  const d = new Date();
  setHhmm(two(d.getHours()) + ":" + two(d.getMinutes()));
  setSs(two(d.getSeconds()));
  setDay(DAYS[d.getDay()] + " " + two(d.getDate()) + "." + two(d.getMonth() + 1));
}
tick();
setInterval(tick, 1000);

render(() => (
  <Container left={0} right={0} top={0} bottom={0}>
    <Column>
      <Label style={timeStyle} string={() => hhmm()} />
      <Label style={dateStyle} string={() => ss() + "   " + day()} />
    </Column>
  </Container>
), { skin: bg, style: dateStyle });
```

## What just happened

**`<Column>` stacks its children vertically** and centers them. It's a Piu
`Column`; signal-piu just lets you write it as JSX. There's also `<Row>`,
`<Container>` (free positioning), and `<Scroller>`.

**Layout is fill-based and runs once.** The `<Container>` uses
`left/right/top/bottom={0}` — it fills its parent. There are no hard-coded
pixel sizes, which is exactly why the same file renders correctly on gabbro
(260×260 round) and emery (200×228 square) with no per-platform code. Position
and size props are *construction-time* — Piu measures the tree once. (You
cannot make `left`/`width` reactive; for motion you reposition imperatively —
a later topic.)

**Each Label subscribes independently.** The time Label reads `hhmm()`, the
date Label reads `ss()` and `day()`. When `tick()` runs, all three setters
fire, but each Label only re-runs for the signals *it* read. There is no
"re-render the Column" step — the Column object is built once and never
rebuilt.

**`Style` is shared, not per-node.** `timeStyle`/`dateStyle` are created once
at module scope and referenced by many nodes. On a 32 KB machine that matters:
one `Style` object, many Labels pointing at it. (Same for `Skin`.)

## Try it

- Swap `<Column>` for `<Row>` — the lines lay out side by side (and overflow;
  a good way to feel the difference).
- Give the date Label its own color by making a second `Style` — you'll see
  only that line change.

Next: [Part 3 — a live complication](part3-live-complication.md).
