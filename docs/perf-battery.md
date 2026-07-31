# Performance & battery — what the runtime costs, measured

How signal-piu behaves under sustained updates, what that means for battery
on a Pebble, and the app-side rules that matter. Numbers follow Rule 2: each
is from a QEMU instruments capture in this repo (command + capture noted), or
explicitly marked analytical. QEMU cannot measure current draw or real CPU
time (emulated clock ≠ 240 MHz silicon) — see "What we could not measure".

## 1. What actually drains a Pebble battery

- **Display: memory-in-pixel LCD.** A STATIC frame costs ~nothing — the panel
  holds the image without refresh. Cost scales with *how often* and *how much*
  you redraw, not with showing something. Piu invalidates only the content
  whose property changed (a Label's rect, not the screen), so one ticking
  label redraws one small rect.
- **CPU wakeups.** Every timer callback wakes the core; work-per-wake and
  wakes-per-second are the app's main battery lever. The SoC idles between
  events; a 1 Hz face wakes 1×/s, a millisecond face 25×/s.
- **Radio (BT/PKJS).** Every AppMessage/fetch keeps the radio up — orders of
  magnitude above a local update. Not a runtime concern (the runtime never
  talks to the phone on its own), but the #1 app-side drain if used per-tick.

So the runtime's battery job is: **fewest wakeups, least work per wake,
smallest invalidation** — and no background work the app didn't ask for.

## 2. The runtime's battery posture (design, each point verifiable in source)

- **Zero background work.** The runtime owns NO standing timer. The only
  runtime-created timer is `animate()`'s shared ~30 fps ticker
  (`flow.ts` STEP=33): ONE native timer for N concurrent tweens, created on
  the first tween, **released the instant the last tween lands or stops**
  (`tickAll`/`stop` clear it and null the ticker; owner-dispose stops tweens).
  An idle app = zero timers from us.
- **Equal-value writes are skipped** before any graph work (`Signal.set`,
  law 8/27): a watchface writing h/m/s/ms every tick only pays for the fields
  that CHANGED — the hour label's subtree does nothing 3599 of 3600 ticks.
- **Coalesced turns (settle).** N writes in one event/batch → each affected
  effect runs ONCE per turn (diamond-safe, law 12). No cascade storms.
- **Lazy computeds** recompute on READ, not on write — a computed nobody is
  currently displaying costs zero on writes (version check only).
- **Bindings are per-property effects**: a change re-runs one thunk and one
  Piu property write — no tree diffing, no VDOM, nothing proportional to app
  size.

## 3. Measured: sustained updates are allocation-flat

**Setup:** `watchms` (the most aggressive example: 40 ms tick = 25 writes/s,
4 `useState` setters per tick, live `.mmm` label), gabbro, fresh emulator,
55 instruments heartbeats ≈ 55 s (capture 2026-07, this repo).

| metric | boot | after 55 s at 25 writes/s |
|---|---|---|
| Garbage collections | 2 | **2 (unchanged)** |
| Slot used | 17152 B | **17152 B (byte-flat)** |
| Chunk used | 5300 B | **5300 B (byte-flat)** |
| Native timers | 2 | 2 |

Liveness was verified by screenshot diff (618 pixels changed across 2 s — the
ms/second digits), so this is a RUNNING app, not a frozen one: **the
steady-state update path triggered no GC and no measurable heap growth for a
minute at 25 Hz.** Three equal-value setters skip per tick; the one real
change re-runs one string thunk and one `label.string` write.

Historical contrast: the M3-era object-API reactive label measured ~464 B
slots + ~116 B chunk of transient garbage per update with a GC every ~6
ticks ([handbook](handbook.md#measured-memory-reality-sdk-417) "Measured
memory reality"). The packed/lowered core since
removed that churn — the flat line above is the current behavior. (Different
app shapes; both numbers kept, each labeled with its era.)

Extrapolation (analytical, not a measurement): a 1 Hz watchface does 1/25th
of this work — GC pressure from the update path is effectively zero.

## 4. App-side rules that dominate battery

Ranked by real-world impact:

1. **Tick as coarsely as the UI needs.** 1 Hz for clocks; `watchms`'s 40 ms
   cadence is a demo of update THROUGHPUT, not a pattern — 25 wakes/s on a
   watchface is a battery bug regardless of how cheap each wake is.
2. **Don't talk to the phone per tick.** PKJS/fetch per update keeps the
   radio hot; batch phone traffic into rare, explicit refreshes
   (`createResource.refetch` on a button, not on a timer).
3. **Let equal-skip work for you.** Write the SAME derived fields every tick
   (`setH(h)` even when unchanged) — it's one `===` compare; do NOT build
   strings before the setter "to be safe" (string building is the only real
   per-tick cost; build strings inside the binding thunk of the label that
   actually changed).
4. **Group multi-signal updates in `batch()`** (or one event handler — turns
   coalesce anyway): N writes, one run per affected effect.
5. **`animate()` over hand-rolled intervals** for tweens: N tweens share one
   30 fps timer that self-releases; N `setInterval`s each wake the core.
6. **keepAlive `<Show>` for frequent toggles** (zero allocation per toggle,
   both subtrees stay live) vs default rebuild (allocation per swap, only one
   side alive) — CPU-vs-RAM; on battery, prefer keepAlive when toggling more
   than ~once/minute, rebuild when RAM-tight.
7. **VirtualList for lists**: fixed recycled labels, scroll = string writes
   only (no node churn — measured in the M6/forbind5vl rounds).

## 5. CPU hot paths (analytical, sizes from this repo's apps)

Per write that actually changes a value: one settle turn = union of
subscriber masks (a few 32-bit words), then per affected effect:
`unsubscribe` (one AND-NOT pass over signal rows × stride words — rows =
live signals, typically < 30; stride 1 below 33 effects) + the effect fn +
re-subscribe on reads. All integer/bitmask work on arrays — no object
allocation on the notify path (the flat line in §3 is this, observed).
At watch scale (dozens of signals/effects) this is microseconds-class work
per wake even on emulated timing; the string thunk + Piu text layout of the
changed label dominates, and both are proportional to the ONE label that
changed.

## 6. What we could NOT measure (honest limits)

- **Current draw (mA)** — QEMU has no battery model. Real ranking of
  display-vs-CPU-vs-radio costs needs hardware with a power rail.
- **Real CPU time per update** — QEMU timing ≠ SF32LB52 @240 MHz. We measure
  allocation/GC (valid: heap behavior is engine-level, not clock-level), not
  milliseconds.
- **Panel flush cost/rate** — undocumented; the 30 fps `animate()` cadence is
  the classic Pebble figure, revisit with an on-device flush measurement
  (noted at `flow.ts` STEP).

When real hardware is available: repeat §3's capture on-device, add a
battery-drain A/B (1 Hz face vs 25 Hz face over hours), and measure one
tween's cost via the power rail. Until then, §3's allocation-flat line plus
§1's wakeup math is the best-supported battery story.
