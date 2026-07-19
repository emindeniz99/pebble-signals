# Catalog expansion plan — full react-pebble gap analysis

A per-item decision on **everything react-pebble advertises** (from its README
inventory + our published-0.1.1 source audit): what signal-piu WILL implement,
what it WON'T, where each lands, and how. The goal is react-pebble's breadth
WITHOUT losing the runtime-reactive model and WITHOUT charging any app for a
feature it doesn't import.

Legend: ✅ WILL (planned, phased below) · ⚠️ LATER (real, deferred by priority) ·
❌ WON'T (with reason) · 🔬 RESEARCH-GATED (need the real Moddable module shape
first, Rule 1 — NOT copyable from react-pebble, which removed these).

## Design principle: take the ideas, build the BETTER version

react-pebble is the map of *what a Pebble app needs*, not a spec to clone. For
every item we ask "what's the best version OUR model makes possible?" and ship
that — often strictly better than theirs:

- **Runtime-dynamic, not static snapshot.** Their `MenuLayer`/lists/animation are
  compiled snapshots (multiview drops screens, animation is 1fps). Ours are live
  signals — a menu whose items come from phone data at runtime just works; an
  animation runs at the real tween rate.
- **Reactive by default.** A `<Circle r={radius}>` where `radius` is a signal
  re-draws on change with no VDOM diff — one Port invalidate. Their props are
  build-time values.
- **Real, not stubbed.** Their sensor hooks were fictional-global stubs they
  removed. Ours wrap the actual Moddable/firmware module and expose it as a
  signal you can compose (`useBattery()` drives a reactive gauge).
- **Honest + measured.** Every component ships a device receipt and a zero-cost
  proof (Rule 2 / Rule 12). We never advertise what doesn't boot.
- **Smaller where it counts.** Opt-in modules + tree-shaking mean a 3-component
  watchface pays for 3 components, not a 65-hook framework.

So the API *names* may echo react-pebble (familiarity), but the semantics,
correctness, and cost are ours to make excellent. Parity is the floor, not the
goal.

## The zero-cost invariant (the rule every item obeys)

**A new catalog entry costs ZERO boot symbols, ZERO arena bytes, ZERO archive
size for an app that doesn't import it.** Enforced by per-app tree-shaking
(`tools/treeshake.mts` ships only the imported closure) IF new code lives in a
**NEW opt-in module**, never in always-shipped core (`runtime/signals`,
`runtime/jsx-runtime`, `runtime/flow`). Types are erased → rich TS is free.
Gate per phase: a non-user app's symbol count + `mc.xsa` size stay byte-identical
(`tools/host-symbols.py` + size A/B). Const-arrows only in preloaded modules
(gotcha 13); the 32KB arena + 384-slot wall are why (Rule 4).

## Module layout

```
runtime/{signals,jsx-runtime,flow}   CORE — unchanged, always shipped
runtime/draw/{circle,line,arc,path,canvas}        NEW opt-in
runtime/ui/{statusbar,actionbar,card,badge,menu,numberwindow,scrollable}
runtime/layout/{column,row,group,roundsafe,textflow}   (some already in core)
runtime/anim/{animation,easing}
runtime/sensors/{battery,accel,compass,health,vibration,light,location,dictation}
runtime/data/{message,fetch,websocket,datalog}
runtime/system/{watchinfo,applifecycle,wakeup,worker,memory,notification}
config/  (pkjs-side config-page builder)     timeline/  (server-side web API)
i18n/    (defineTranslations/useTranslation)
```

---

## Components — react-pebble's 26, decided

### Primitives
| react-pebble | decision | module | how |
|---|---|---|---|
| `Rect` | ✅ have (Container+Skin fill) — formalize sugar | `runtime/draw/rect` or doc | Container with skin; likely a doc/example, not new code |
| `Circle` | ✅ P1 | `runtime/draw` (ONE module, all primitives) | Port + onDraw; native circle CONFIRMED ABSENT (probe `drawprobe`, gabbro) — Piu Port exposes only `fillColor`+draw{String,Texture,Skin,Content} → JS-rasterize scanline `fillColor` spans. Reactive via component `effect()` + `port.invalidate()` (NOT the jsx bind path). |
| `Text` | ✅ have (`Label`/`Text` host) | core | already shipped |
| `Line` | ✅ P1 | `runtime/draw/line` | Port + onDraw |
| `Image` | ✅ have (`Texture`) — add rotation/scale | `runtime/draw/image` | rotation/scale via SVGImage/Port transform (we have slothvec) |
| `SVGImage` | ✅ have (slothvec/PDC) | core/example | shipped; document |
| `Arc` | ✅ P1 | `runtime/draw/arc` | Port + onDraw arc/ring |
| `Path` | ✅ P1 | `runtime/draw/path` | Port + onDraw polygon |
| `Canvas` | ✅ P1 | `runtime/draw/canvas` | raw Port exposing the draw context via `onDraw` |

### Layout
| `Window` | ✅ have (root Container / render) | core | shipped |
| `Group` | ✅ have (`Container`) | core | alias/sugar |
| `Column` | ✅ have (host) | core | shipped |
| `Row` | ✅ have (host) | core | shipped |
| `Scrollable` | ✅ P2 (have `Scroller` host) — add indicators | `runtime/ui/scrollable` | wrap Scroller + scroll indicators |
| `RoundSafeArea` | ✅ P2 | `runtime/layout/roundsafe` | inset children on round via screen.round |

### Composite UI
| `StatusBar` | ✅ P1 | `runtime/ui/statusbar` | Container+Label top strip (or native layer if exposed) |
| `ActionBar` | ✅ P1 | `runtime/ui/actionbar` | right-edge Container of icons |
| `Card` | ✅ P1 | `runtime/ui/card` | title+body Container composition |
| `Badge` | ✅ P1 | `runtime/ui/badge` | circle (Port) + centered Label |
| `TextFlow` | ✅ P2 | `runtime/ui/textflow` | multi-line paragraph Label(s) |
| `AnimatedImage` | ✅ P3 | `runtime/draw/animimage` | frame sequence over the shared tween ticker |

### Navigation & menus
| `MenuLayer` | ✅ P2 | `runtime/ui/menu` | over `VirtualList` (runtime-dynamic) + selection |
| `SimpleMenu` | ✅ P2 | `runtime/ui/menu` | flat single-section sugar over MenuLayer |
| `ActionMenu` | ✅ P2 | `runtime/ui/actionmenu` | overlay + back-nav over Navigator |
| `NumberWindow` | ✅ P2 | `runtime/ui/numberwindow` | numeric picker (min/max/step) |
| `WindowStack` | ✅ have (`Navigator`) | core | Navigator IS this — document the equivalence |

**Components verdict: all 26 covered — ~14 already exist, ~9 new opt-in modules,
none blocked by our model.** (Our runtime-dynamic versions are strictly more
capable than react-pebble's static snapshots.)

---

## Hooks — react-pebble's 65+, decided by category

### Time & animation (8)
`useTime`✅have · `useFormattedTime`✅have · `useInterval`✅have ·
`useAnimation/Sequence/Spawn`✅P3 `runtime/anim` (over our tween ticker) ·
`useTimer`✅P3 · `lerp`+18 easings✅P3 `runtime/anim/easing` (pure fns, tiny).

### Input (6)
`useButton`✅have · `useLongButton`✅P2 · `useMultiClick/RepeatClick/RawClick`✅P2
`runtime/system` (button-timing over our press handlers) · `useListNavigation`✅P2.

### Sensors & hardware (14) 🔬 RESEARCH-GATED
`useBattery, useAccelerometer(+Raw/Tap), useCompass, useHealth(+Alert/History/
HeartRate), useMeasurementSystem, useVibration, useLight, useLocation,
useDictation` — ⚠️ P2/P5, **one module per PR**, each proven on QEMU first (the
`dictate` probe is the template). **react-pebble's published code does NOT have
these** (removed as fictional-global stubs) — we find the real Moddable/Pebble
module shape ourselves (Rule 1: SDK/firmware first).

### State & storage (6)
`useState`✅have · `useLocalStorage`✅P1 `runtime/data/localstorage` (persisted
signal over our Store/KV) · `useKVStorage`✅P1 (same path) · `useFileStorage`⚠️P3 ·
`useConfiguration`✅P3 (with config builder) · `useAppSync`⚠️P4.

### Data & networking (5)
`useMessage`✅P3 `runtime/data/message` · `useFetch`✅P3 (pebbleproxy — the ONE
piece copyable from react-pebble's published code) · `useWebSocket`⚠️P4 ·
`useHTTPClient`⚠️P4 · `useDataLogging`⚠️P4.

### Watch info (5)
`useWatchInfo`✅have (deviceinfo) · `useLocale`✅P3 · `useDisplayBounds`✅have
(screen.width/height) · `useContentSize/UnobstructedArea`✅P3 (timeline peek).

### System & lifecycle (~20)
`useApp`✅have · `useAppFocus`✅P3 · `useAppGlance`⚠️P4 · `useTimeline*`⚠️P4 ·
`useAccountToken/WatchToken`⚠️P4 · `useRawResource`✅P3 · `useSmartstrap`❌ (niche
UART accessory — ⚠️P5 only on request) · `useQuietTime`✅P3 · `useLaunchReason/
Info`✅P3 · `useExitReason`✅P3 · `useNotification`⚠️P4 · `useWakeup`⚠️P4 ·
`useMemoryStats`✅P3 (we have instrumentation) · `useMemoryPressure`⚠️P4 ·
`pebbleLog`✅have (report()/devlog bridge).

### Workers (3) · Companion (1) · i18n (2) · Geometry
`useWorkerLaunch/Message/Sender`⚠️P4 (we have the worker experiment) ·
`useSports`❌ (⚠️P5, niche) · `defineTranslations/useTranslation`✅P4 `i18n/` ·
polar/trig helpers✅P3 `runtime/anim` or a `geom` util (pure fns, free).

### Phone-side & server
Config builder (`ConfigPage/Section/Toggle/...`)✅P3 `config/` (Clay research
done) · Timeline web API (`pushUserPin/...`)⚠️P4 `timeline/` (server-side, pure).

---

## Beyond react-pebble — React Native + Piu-native + watch-idiomatic

react-pebble is one map; React Native's component vocabulary and **Piu's own
native capabilities** suggest components it never had. Watch-appropriate only
(small screen, button-driven, mostly no touch):

### React Native-inspired (button-driven watch analogs)
| RN idea | our component | module | how |
|---|---|---|---|
| `Switch` | `Toggle` | `runtime/ui/toggle` | boolean, flips on select; skin-swap on/off |
| `Slider` | `Slider` | `runtime/ui/slider` | number via up/down; a filled `Meter` + value |
| `ProgressBar`/`ActivityIndicator` | `Meter` + `Spinner` | `runtime/ui/meter`, `runtime/anim/spinner` | linear fill / animated arc (over draw/arc + tween) |
| `Modal`/`Alert` | `Dialog` | `runtime/ui/dialog` | overlay Container + button actions (like the crash screen) |
| `Picker`/`Select` | `Picker` | `runtime/ui/picker` | menu-backed single choice (over MenuLayer) |
| `Tabs` | `Tabs` | `runtime/ui/tabs` | Navigator-backed horizontal sections + dot indicator |
| `Checkbox`/`Radio` | `CheckList`/`RadioList` | `runtime/ui/checklist` | menu rows with a state glyph |
| `TextInput` | `TextInput` | `runtime/ui/textinput` | FORMALIZE our button char-picker (`text-input` example) |
| `Button`/`Pressable` | `Button` | `runtime/ui/button` | visual affordance + press binding |

### Piu-native (react-pebble never surfaces these — a real edge)
- **Screen transitions** — Piu has native `Transition` (slide/comb/wipe/fade).
  Expose on `Navigator` push/pop as an opt-in `transition` prop → animated
  navigation react-pebble can't do. 🔬 verify the Piu Transition API on device.
- **Clip / reveal mask** (`Die`/clip) — `runtime/draw/clip` for wipe-reveal
  effects (progress fills, unlocking animations).
- **Constraint `Layout`** — we already have the host; document + a `Layout`
  helper for proportional sizing.

### Watch-idiomatic (the stuff a watch UI kit actually needs)
- **`Gauge`/`Dial`** — radial progress/needle (over draw/arc) — THE watch
  primitive; powers battery/health/timer faces.
- **`ClockFace` helpers** — tick marks, hand angles, `polarPoint` (pairs with
  the geometry helpers already planned in `runtime/anim`).
- **`DotIndicator`** — page dots bound to `Navigator` depth (pairs with Tabs).
- **`Sparkline`** — tiny inline trend chart (over draw/path) for health/data.

These are all ✅ opt-in modules under the same zero-cost invariant; priority
slots into P2/P3 after the P1 primitives + UI-kit they build on.

## Showcase app (`gallery`) — every feature behind a menu

Our lazy multi-screen feature (Navigator + `screens/` lazy modules, O(1) arena)
is exactly the shape of a component gallery:

- **Root** = a scrolling menu (`MenuLayer`/`VirtualList`) listing every catalog
  entry, grouped (Draw · UI-kit · Hooks · Flow · …).
- **Each item** pushes a **lazy demo screen** for that component — a live,
  interactive example (button-drive the Toggle, watch the Gauge animate).
- **Doubles as:** the catalog's on-device smoke (add `gallery` to
  `tools/device-smoke.mts`), the screenshot source for `components.md`, and a
  living proof that the whole catalog boots together via lazy loading (each demo
  is O(1) arena — the exact strength react-pebble's combined app lacked).
- Lives at `src/tsx/examples/gallery/` with `gallery.tsx` (menu) +
  `screens/<component>.tsx` (one lazy demo each).

## components.md — the visual catalog

A `docs/components.md` (linked from docs/README) where every component has:
its name, a one-line description, a minimal usage snippet, and **two
screenshots** — round (gabbro 260×260) AND rect (emery 200×228) — captured from
its `gallery` demo screen (`pebble screenshot`, committed under
`screenshots/gallery/<component>-{gabbro,emery}.png`) so the doc shows how it
looks on both shapes. "This component looks like this"
— the doc a user actually browses to pick a component. Generated/curated as each
component ships (part of every phase's definition-of-done).

## What we WON'T do (and why)
- ❌ **Compile-time snapshot model** — it can't do runtime-dynamic structure
  (bench-proven failure). Our components stay runtime-reactive. This is the whole
  point of the library.
- ❌ **Rocky.js / native-C output targets** — we are Piu-only by design; a second
  codegen backend is a different project, not a catalog item.
- ❌ **Inheriting react-pebble's removed sensor stubs** — we find real shapes
  ourselves (Rule 1).
- ⚠️→❌-unless-asked: `useSmartstrap`, `useSports` (niche hardware/protocols).

## Fonts / colors / resources
All ✅ **already supported** (custom TTF fonts device-proven, named colors,
Texture/pdc/raw/apng resources via gen-manifest) — document parity, no new code.

---

## Phasing (each phase = one PR: opt-in module + tests + 100% cov + gabbro
receipt + zero-cost A/B + example in the smoke catalog + docs/api regen)

0. **P1 gating device probe — DONE (`drawprobe`, gabbro,
   `screenshots/drawprobe-gabbro.png`).** MEASURED (Rule 2): the Piu Port
   `onDraw` context exposes ONLY `fillColor`, `drawString`, `drawTexture`,
   `drawSkin`, `drawContent` as functions. Every native primitive —
   `drawCircle`, `drawLine`, `drawRoundRect`, `drawPixel`, `fillPolygon`,
   `blendColor` — reports `undefined`. **Verdict: no native path exists.**
   Circle/Line/Arc/RoundRect are ALL JS-rasterized as horizontal `fillColor`
   scanline spans (`p.fillColor(color, x, y, w, 1)` per row). Reactive via a
   component-owned `effect(() => { deps(); port.invalidate(); })`, NOT the jsx
   bind path. Substrate settled; draw modules may be written.
1. **P1 draw primitives** — Circle, Line, Arc (one `runtime/draw` module, ONE
   Port paints many — never one Port per shape, gotcha 16). Path/Canvas need a
   different substrate (JS scanline fill, SVGImage/PDC for vectors, or a
   raw-Poco escape hatch that is NO LONGER a Piu node) — decide after the probe.
2. **P1 UI-kit** — StatusBar, ActionBar, Card, Badge (`runtime/ui/*`).
3. **P1 storage** — useLocalStorage / useKVStorage (`runtime/data/localstorage`).
4. **P2 menus + input** — MenuLayer/SimpleMenu/ActionMenu/NumberWindow,
   multi/long/repeat-click, Scrollable, RoundSafeArea, TextFlow.
5. **P2 sensors** — one research-gated device-proven module per PR.
6. **P3 data/config/anim/system** — message/fetch, config builder, animation
   hooks + easing, watch-info/lifecycle hooks.
7. **P4/P5** — timeline, glance, wakeup, workers, i18n, notifications, smartstrap,
   sports — on demand.

## Orchestration (per owner direction)
- **Research + this plan = the main agent (me).** The item decisions above are
  mine, grounded in react-pebble's README inventory + its published-0.1.1 source
  audit (which proved the sensor hooks are stubs it removed).
- **Implementation = subagents.** Each phase's independent modules fan out to
  parallel subagents once the pattern for that phase is established (one
  reference module built + device-verified first, then siblings copy it). I own
  device verification, the zero-cost A/B, and gate-keeping.

Prior art + model tradeoff: `docs/design-journey.md`. Measured comparison:
`projects/react-pebble-bench/`.
