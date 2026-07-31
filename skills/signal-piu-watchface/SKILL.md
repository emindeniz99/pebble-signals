---
name: signal-piu-watchface
description: Build, run and verify Pebble watchfaces/watchapps with signal-piu — Solid-style signals + JSX (no VDOM) on the Moddable XS/Piu "Alloy" stack. Use when the user asks to create or modify a Pebble watchface/app in a project that uses signal-piu, or asks to add signal-piu to a Pebble project. Covers the memory budgets, valid fonts, the read-syntax rules, the emulator verify loop, and the component catalog.
---

# Building Pebble apps with signal-piu

signal-piu is a fine-grained reactive UI library for Pebble watches
(gabbro = round 260×260, emery = rect 200×228) on the official Alloy stack
(Moddable XS JS engine + Piu UI). Components run ONCE — there is no
re-render, no VDOM: a reactive prop is a thunk (`string={() => count()}`)
that drives exactly one effect. `<Label>` returns a real Piu `Label`, so
hand-Piu and JSX coexist.

## Non-negotiable budgets (measured; violating them aborts the firmware)

| Budget | Number | Symptom when blown |
|---|---|---|
| JS heap ("arena") | 32 KB total, 26,624 B usable (slots+chunk; 6,144 B is the value stack) | `fxAbort memory full` — app exits to launcher |
| Boot symbol floor | ~150 archive symbols | dies AT BOOT, no error visible |
| XS value stack | 384 slots / 6,144 B | `fxAbort JavaScript stack overflow` |
| Mod archive | ~116.8 KB moving edge | install/refuse |

Rules that follow: bytes not objects; indices not references; recompute,
don't cache; app module scope loads into boot RAM — keep screens lean;
lists NEVER materialize per-row nodes (see Lists below).

## Quickstart

```bash
# inside a signal-piu checkout / consumer project
APP=<name> node build.mts        # builds src/tsx/examples/<name>.tsx (or --app)
tools/reset-emulator.sh gabbro   # hard-reset the emulator (do this per app)
pebble install --emulator gabbro # FOREGROUND — piped/backgrounded installs lie
# wait >= 35s: the firmware cold-boots ~30s BEFORE the app appears
pebble screenshot out.png        # then READ the image — never size-check it
```

The build has loud gates: `fontcheck` (an invalid font renders BLANK on
device — the gate saves you), `lint-reads` (read-syntax mistakes below are
build errors, not runtime surprises), tree-shaking (an app ships only what
it imports). If the build prints `treeshake: SKIPPED` because of a dynamic
`importNow` of a HOST module, rebuild with that specifier declared —
`TREESHAKE_ALLOW="qrcode"` — which keeps pruning ON for everything else
(pruning runtime modules cannot break host imports). The message names the
specifiers and prints the exact line to copy. The `pebble/`, `embedded:` and
`piu/` prefixes are built in, so e.g. `"piu/Timeline"` needs no flag at all;
`TREESHAKE_FORCE=1` still works but switches the whole safety scan off.

`CRASH_UI=0` (drop the on-watch crash screen) requires the minifier — its
saving is dead-code elimination — so `CRASH_UI=0 MINIFY=0` fails the build
loudly instead of silently shipping the crash screen you asked to remove.

## Valid fonts (ONLY these — anything else renders blank)

`14px Gothic`, `18px Gothic`, `24px Gothic`, `28px Gothic` (each also
`bold`), `42px Bitham` (+ `bold`), `21px Roboto`, `bold 49px Roboto`,
`bold 28px Droid`. NOT valid: `bold 30px Bitham` (Black-only face).
Custom TTF: ship `src/tsx/examples/<app>/fonts/<Family>-<Suffix>.ttf` and
use `<size>px <Family>`. Pebble Gothic has NO `▲▼↑↓` glyphs — use ASCII
`^` / `v`.

## Read-syntax rules (lint-enforced; both syntaxes are by design)

- `useState` → read by CALLING: `const [count, setCount] = useState(0);
  count()`. Pass the GETTER (or a thunk) where reactivity should flow.
- `signal()` / `computed()` → read with `.value`. NEVER call a computed —
  `c()` throws on device.
- Passing a setter/getter to another module or a callback table? WRAP it:
  `boot({ setName: (v) => setName(v) })` — a bare `{ setName }` escape is a
  build error (it was once device-fatal).
- No dependency arrays exist. Effects/bindings track what they READ.

## Ownership rule (replaces React's Rules of Hooks)

Conditional hooks are legal (components run once — nothing matches by
position). The rule here: hooks that SUBSCRIBE (`useClock`, `useAccel`,
`useBattery`, timers, `useHostTimer`…) must be called inside a component
body / the `render()` build — never at module scope — so disposal reaches
their cleanup.

## Minimal watchface

```tsx
import { render } from "runtime/jsx-runtime";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });

render(() => {
	const now = useClock("minute"); // "second" | "minute" | "hour" | "day"
	return <Column>
		<Label style={big} string={() => now().toTimeString().slice(0, 5)} />
	</Column>;
}, { skin: bg, style: big });
```

## Component catalog (import from `runtime/<module>`; all opt-in, tree-shaken)

- Flow: `Show`, `For`, `VirtualList`, `SectionList`, `Navigator`
  (`nav.push(build, data?)` — push a SHARED builder + plain data, not a
  per-push closure: measured 0 B/push in slots vs ~60–100 B for closures),
  `Move`, `animate`, `ErrorBoundary` (a crash screen is ON by default).
- Widgets: Canvas/draw, Badge, ProgressBar, Slider, Toggle, Meter,
  Sparkline, DotIndicator, Gauge, ClockFace, QR (round rule below),
  Image/ImageBackground/VectorImage, Grid, Scrollable, Menu, Picker,
  NumberField, TextFlow (+ `shape="circle"`), ActionMenu, Spinner,
  StatusBar, ActionBar, Card, Dialog, Tabs, RoundSafeArea, Button.
- Hooks: useState/signal/computed/effect/batch/useMemo/onCleanup,
  useInterval/useTimeout, useToggle/useCounter/useDebounce,
  useTween/useSpring/useSequence + Easing, useClock/useTimeParts,
  watchInfo/useDisplayBounds/backlight/exitApp, useBattery, useConnection,
  useAccel/useTap, useCompass, useMessage/useAppMessage, useConfig,
  useKVStorage/localStorage, files (readFile/writeFile/deleteFile/
  listFiles), hosttime (ticks/elapsed/useHostTimer), useHaptics,
  useAppFocus("did"|"will"), useWakeup, useDictation (gated), useLongPress/
  useRepeatClick/useMultiClick, useBackHandler.
- Full list with device screenshots: `docs/components.md`.

## Lists — the ceilings are real

`VirtualList` is the DEFAULT list. Use it (or `SectionList`) — recycled
cells, RAM = O(visible rows) — for anything list-shaped. `For` is for
SMALL, bounded collections only (~10-12 bare Labels; ~6-8 skinned rows;
~3 reactive rows is near the wall — 5 crash). A height-less container
with 3+ fixed-height children can crash layout — give lists a box.

The build enforces the split as ADVICE: `lint-reads` warns
`[for-ceiling]` on a `<For>` whose `each` is not a small literal, naming
the measured numbers and pointing at `VirtualList`. It is a WARNING —
the build still passes. Retune the literal bound with `LINT_FOR_MAX=<n>`
(default 8); `LINT_READS=0` bypasses the whole gate.

## Round screen rules

- Wrap top strips in `RoundSafeArea`; inset content off clipped corners.
- QR codes: a screen-sized square LOSES its corner finder patterns to the
  round bezel and stops scanning — `<QR fullscreen>` renders the largest
  inscribed square (183 px on gabbro) instead. Wider quiet zone:
  `size={124}`.

## Verify loop (the receipts discipline — screenshots or it didn't happen)

1. Build; watch for gate failures (they say exactly what to fix).
2. `tools/reset-emulator.sh <plat>` — reset PER APP; the screenshot
   transport rots after ~4–8 installs in one session.
3. Foreground `pebble install`; wait ≥ 35 s on a fresh reset.
4. Capture: `pebble screenshot`; if it times out, use the qemu MONITOR
   screendump (port from `/tmp/pb-emulator.json`, send
   `screendump /path.ppm`, convert with PIL — `tools/drive.py` does this).
5. READ the image. An empty-home frame, a stale frame and the crash screen
   all pass a size check. The crash screen (error text on watch) IS the
   default ErrorBoundary telling you what threw.
6. Buttons: `pebble emu-button --emulator <plat> click up|down|select|back`.
7. Logs: JS `console.log` is a NO-OP on release firmware. Attach
   `pebble logs` BEFORE a foreground reinstall to stream the per-second
   XS memory instruments; route app diagnostics through the devlog
   AppMessage bridge (`globalThis.__spError` receives `(err, ctx)`).

## Phone data (weather etc.)

The watch does NOT fetch directly (watch-side `fetch` OOMs the arena —
device-gated). The proven path: phone-side pkjs does the HTTP work and
sends results over AppMessage; on the watch use `useConfig` (persisted,
partial-merge) or `useMessage`. See `src/tsx/examples/weather.tsx` for the
receipted pattern.

## Deep references (in this package)

- `docs/components.md` — every component + device screenshots
- `docs/xs-heap-playbook.md` — the memory trick inventory
- `docs/debugging.md` — symptom table
- `docs/migration.md` — from C / Rocky / React
- `docs/handbook.md` — the 24 numbered gotchas with measurements (moved off the
  front page 2026-07-31; `README.md` is now the pitch/quickstart page)
