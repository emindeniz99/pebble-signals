# Build a watchface in signal-piu

A three-part, hands-on tutorial: go from an empty file to a reactive digital
watchface running on a Pebble Round 2 (gabbro) or Pebble Time 2 (emery)
emulator. You will learn the whole signal-piu mental model along the way —
signals, JSX bindings, layout, and *fine-grained* updates (only what changed
repaints; no VDOM diff).

This is the signal-piu counterpart to the official Alloy watchface tutorial.
Alloy gives you imperative Piu; signal-piu gives you React/Solid-style JSX +
signals that compile down to the same Piu nodes.

## Prerequisites

- The signal-piu repo checked out and building (see the top-level `README.md`
  — you need the Pebble SDK 4.17 + the QEMU emulators).
- One terminal command you'll reuse:

  ```bash
  pnpm run dev -- --app watchface     # build + install + stream logs on gabbro
  ```

## The finished result

The complete, device-verified source is one file:
[`src/watchface.tsx`](src/watchface.tsx) (also shipped as the repo's
`src/tsx/examples/watchface.tsx`, so `--app watchface` just works). It renders:

```
      good morning        ← greeting, repaints only when the hour band changes
        09:02             ← HH:MM, big
   15   Sun 05.07         ← seconds + weekday + date
```

## The three parts

1. **[Part 1 — a ticking clock](part1-ticking-clock.md)** — the smallest
   reactive watchface: one signal, one `setInterval`, one JSX `<Label>`. You
   learn what a *signal* is and what a *binding* is.
2. **[Part 2 — date & layout](part2-date-and-layout.md)** — add a second and
   third line, a `<Column>`, and `Style`s. You learn how signal-piu lays out
   (fill-based, no per-platform code) and how each `<Label>` subscribes to
   only the signal it reads.
3. **[Part 3 — a live complication](part3-live-complication.md)** — an
   hour-based greeting. You learn the payoff: signal-piu skips same-value
   writes, so the greeting line stays put while the seconds line ticks every
   second. That independence is the entire point of fine-grained reactivity.

## Turning it into a *real* watchface

Everything above runs as an *app* (launch it from the launcher). To install it
as an actual watch face — shown when you raise your wrist, no launcher — flip
one field in the repo's `package.json`:

```jsonc
"watchapp": { "watchface": true }
```

then rebuild. (Leave it `false` while developing so the other examples still
build as apps.)

## Platform note

signal-piu — like Alloy — targets **emery (Pebble Time 2, 200×228 square)**
and **gabbro (Pebble Round 2, 260×260 round)**. This watchface is written once
with fill-based layout (`left/right/top/bottom`) and runs unchanged on both;
there is no per-platform code.
