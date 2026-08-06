---
name: Bug report
about: A watchface rendered wrong, died at boot, or a documented number did not reproduce
title: "[bug] "
labels: ["bug"]
assignees: ""
---

<!--
Device bugs here are terse by nature — XS gives no stack traces or line
numbers on the Pebble port — so the receipts below ARE the debugging
information. An issue with a platform, the budget numbers and one screenshot
is usually fixable; one without them costs a full round-trip before anyone can
even guess. See CONTRIBUTING.md ("Rule 2 — measured numbers or it didn't
happen") for what counts as a receipt.
-->

## What happened

<!-- One or two sentences. If the app died, quote the exact abort line —
`fxAbort memory full`, `fxAbort JavaScript stack overflow`, `TypeError: call:
not a function` are all different bugs with different causes. -->

## What you expected

## Where it happened

- [ ] On the **watch / QEMU emulator**
- [ ] In the **Node suites** (`pnpm run test`)
- [ ] At **build time** (`node build.mts` / `pnpm run dev`)
- [ ] In the **docs** — a number or example that does not reproduce

## Platform

| | |
|---|---|
| Emulator / watch | <!-- gabbro (round 260×260) / emery (rect 200×228) / both / physical --> |
| Pebble SDK | <!-- `pebble sdk list` → expect 4.17 (active) --> |
| pebble-signals version | <!-- 0.1.0, or the commit SHA if you are working in the repo --> |
| Node / pnpm | <!-- `node --version` (≥ 24) · `pnpm --version` (≥ 11) --> |
| Host OS | |

## The four budgets

<!--
The three firmware-fixed budgets plus the archive edge are where almost every
device bug actually lands, and they are only visible on-device. Paste whatever
you have — partial numbers still narrow it down a lot. Skip this block for a
Node-only or build-time bug.

Getting them (the capture must attach to a LIVE pypkjs BEFORE the app's XS
machine is created — one shell invocation, foreground install):

  pebble logs --emulator gabbro > /tmp/cap.txt 2>&1 &
  sleep 3
  pebble install --emulator gabbro        # foreground — relaunches the app
  sleep 10
  kill %1; grep instruments /tmp/cap.txt  # 0 lines = dead transport, NOT a quiet app

On the numeric `instruments:` line: [7] chunk used, [8] chunk avail,
[9] slot used, [10] slot avail, [11] stack peak, [12] stack total (6144),
[13] GC runs, [14] keys.
-->

| Budget | Ceiling | Yours |
|---|---|---|
| JS heap ("arena") | 26,624 B usable (slots + chunk) | <!-- slot used + chunk used --> |
| Boot symbols | ~150 archive symbols | <!-- `python3 tools/xsa-symbols.py build/mods/<plat>/mc.xsa` --> |
| XS value stack | 384 slots / 6,144 B | <!-- stack peak, column [11] --> |
| Archive size | ~116,816 B boots / 117,042 B dies | <!-- `stat -c%s build/mods/<plat>/mc.xsa` --> |

```
paste the raw instruments: line(s) here, or the fxAbort line and what preceded it
```

## Screenshot receipt

<!--
Required for anything visual. Drag the PNG in.

  pebble screenshot                              # if the transport is healthy
  python3 tools/drive.py gabbro d:shot           # qemu-monitor screendump — keeps
                                                 # working when the above rots

Two things to check before attaching, both measured failure modes: on a
freshly reset emulator wait >= 32 s after `pebble install` (earlier grabs the
firmware boot frame), and READ the PNG rather than size-checking it — an empty
home screen, a stale frame from the previous app, and the `render() threw`
crash screen all look like a valid capture.

The crash screen IS a good receipt — the default error boundary paints the
escaped error on the watch, and that text is usually the whole answer.
-->

## Minimal repro

<!-- The smallest .tsx that shows it. This goes straight into the examples
directory as a regression app, so smaller is genuinely faster. Fonts must name
a real face at that exact size AND weight or the label renders nothing at all
(handbook gotcha 20) — `18px Gothic`, `bold 24px Gothic`, `bold 28px Gothic`,
`bold 42px Bitham` are verified. -->

```tsx
```

## Anything else

<!-- Did it work in an earlier version? Which components/hooks does the app
import (the import closure is what actually ships)? Links to the doc page or
handbook gotcha you were following. -->
