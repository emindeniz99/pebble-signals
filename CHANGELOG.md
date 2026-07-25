# Changelog

All notable changes to signal-piu. Format: [Keep a Changelog](https://keepachangelog.com);
each release carries an **Upgrading** subsection — the scaffold files a project
OWNS (wscript, src/c, tsconfigs, manifest — see docs/packaging.md "Upgrades")
are never auto-touched, so any change they need is listed there explicitly.
No registry releases yet; entries accumulate under Unreleased until the first
`npm publish`.

## [Unreleased]

### Added
- **`TextFlow` `shape="circle"` — text that FILLS a round screen (opt-in;
  100%-covered; device-verified on gabbro).** With `shape="circle"` each line is
  wrapped to the circle's chord at its own height (`wrapCircle`), so the top and
  bottom lines are short and the middle lines long — the paragraph silhouette
  becomes a lens that uses the whole round screen instead of a centered square
  that wastes the corners. Always center-aligned; the line count/budgets converge
  by a bounded fixed-point iteration. `fill` (0..1) trims a bezel margin.
- **Binding-expansion catalog — media, input, layout (opt-in; 100%-covered; all
  build for gabbro + emery, seven render-verified on gabbro — image, imagebackground
  (bitmap + live clock), vectorimage (PDC scaled 2×), grid, button, vibration,
  scrollable (full scroll + chevron flip) — the rest on device-proven substrate).**
  Media:
  `runtime/image` (`Image` — a bitmap on one Content, optional reactive-`variant`
  sprite), `runtime/imagebackground` (`ImageBackground` — children over a bitmap),
  `runtime/vectorimage` (`VectorImage` — a PDC vector on `SVGImage`, hiding the four
  post-mount transform rules); substrate device-proven by imgwatch/slothvec. Input
  (over the jsx-runtime focus/press substrate, `pebble emu-button`-driven): `runtime/button`
  (`Button` — focusable, pressed-skin swap, optional long-press), `runtime/press`
  (`useLongPress`/`useRepeatClick`/`useMultiClick` — handler bags to spread on a
  focused node), `runtime/backhandler` (`useBackHandler` — intercept Back; in-app
  pop proven, firmware exit-override device-gated). Layout/lists: `runtime/scrollable`
  (`Scrollable` + `ContentIndicator` — free-form clip+`moveBy` scroll with `Label`
  chevron gutters, device-verified; a draw-Canvas overlay wedges the firmware — gotcha 24),
  `runtime/grid` (`Grid` — N-column tiles), `runtime/sectionlist` (`SectionList` —
  grouped headers+rows over `VirtualList`; **DEVICE-GATED — hangs on gabbro, see
  Fixed/Changed below**). Output: `runtime/vibration` (`useHaptics` over the static
  `pebble/vibes`; buzz felt only on hardware).
- **`runtime/anim` motion models — `useSequence`/`useSpring` + combinators.**
  `useSequence(steps, opts)` chains keyframe moves/holds (optionally looping — RN
  `withSequence`); pure `withDelay`/`withRepeat`/`yoyo` compose into it; `useSpring`
  is physics-based motion (RN `withSpring`, a semi-implicit Euler integrator). Each
  owns one ~30fps interval under the `timers.ts` teardown contract.
- **gen-manifest derives bitmaps from bare `"x.png"` literals** (build enabler for
  the ergonomic `<Image src>` — the component builds `new Texture(src)` from a
  variable, so the only scannable literal is the `src` prop; URL/path-safe).
- **Exhaustive feasibility catalog** (docs/components.md): the survey classified the
  remaining Piu/Pebble surface — **9 device-gated** items (`useUnobstructedArea`,
  animated Navigator transitions, `useLocation`, `useDictation`, `usePhysicalButtons`,
  `useWebSocket`, native `RoundRect`/`Inverter`/`RichText`/`NinePatch`, content-clock
  animator, `ScreenBuffer`) documented as probe-pending, and the infeasible set
  expanded (Sound, touch gestures, `Die`/Wipe/Comb, native APNG, `Shape`,
  `useContentSize`/`useAppGlance`/`useTimelinePin`/`useQuietTime`, RN system APIs).
  **`QRCode` reclassified** from build-now to device-gated: its encoder is a native
  `xs_qrcode` absent from the built Pebble device tree, so a JS-only mod cannot
  resolve it without an on-device probe (or a too-heavy pure-JS encoder).
- **P2 catalog — menus, input & lists (opt-in; each device-verified on gabbro +
  emery):** `runtime/menu` (`Menu`, a scrolling selectable list — clip viewport +
  `moveBy` scroll), `runtime/picker` (`Picker`, a 3-row value carousel),
  `runtime/numberfield` (`NumberField`, a big-number stepper), `runtime/textflow`
  (`TextFlow`, manual word-wrap into a Column of Label lines), `runtime/actionmenu`
  (`ActionMenu`, a modal action sheet).
- **`runtime/spinner` (`Spinner`)** — an animated indeterminate loading indicator
  (Canvas + `arc` + a ~30fps `setInterval`, cleared on owner dispose).
  Device-verified on gabbro + emery.
- **Ergonomic hooks (pure reactive logic, torn down on owner dispose):**
  `runtime/timers` (`useInterval`/`useTimeout`, `setInterval`-based — no
  `setTimeout` on device), `runtime/state` (`useToggle`/`useCounter`/`useDebounce`),
  `runtime/anim` (`useTween` — eases toward a reactive target, composes `animate`).
  `timers` and `useTween` device-verified on gabbro; all three 100%-covered.
- **P3 device/time/connectivity/sensor hooks** (wrap proven Pebble host APIs
  verified against the on-disk Moddable/Pebble host; 100%-covered with the
  `watch` global / `importNow` stubbed, typed, and device-verified on gabbro —
  `useAccel`/`useBattery`/`watchInfo` read live values under `emu-*` injection):
  `runtime/clock` (`useClock`/`useTimeParts` over the native watch tick service —
  one shared, wall-clock-aligned firmware timer), `runtime/watchinfo`
  (`watchInfo`/`useDisplayBounds`), `runtime/message` (`useMessage`/`useAppMessage`
  over `pebble/message`), `runtime/config` (`useConfig` — Clay settings merged into
  a persisted `useKVStorage` cell), `runtime/accel` (`useAccel`/`useTap`),
  `runtime/compass` (`useCompass`), `runtime/battery` (`useBattery`, specifier
  `embedded:sensor/Battery`), `runtime/connection` (`useConnection`). Sensors and
  battery are single-instance host singletons with refcount cleanup, driven under
  QEMU via `pebble emu-accel`/`emu-compass`/`emu-battery`/`emu-bt-connection`.
  `useHealth`/`useLight` are documented (docs/components.md) as **not feasible**
  from watch JS today (no Moddable/host surface).
- **Device-gated data + lifecycle hooks** (typed API + honest caveats; 100%-covered):
  `runtime/fetch` (`useFetch` — reactive HTTP over `createResource`; watch-side
  `fetch` OOMs a signal-runtime app per gotcha 18a, so keep it lean or use
  fetch-over-message), `runtime/lifecycle` (`useLaunchReason` / `useAppFocus` /
  `useWakeup` over the bare `watch` global + `pebble/wakeup`; `didFocus`/`wakeup`
  are device-event-gated — Node-verified, build + boot on device).
- **`runtime/gauge` (`Gauge`) + `runtime/clockface` (`ClockFace`)** — arc-based
  Canvas widgets: a circular value dial (with an optional centered label) and an
  analog clock face (12 ticks + hour/minute/second hands). Device-verified.
- **`runtime/dialog` (`Dialog`) + `runtime/tabs` (`Tabs`)** — a centered
  title/message/hint modal card and a horizontal tab bar (active cell
  highlighted). Composition components; device-verified. (`Tabs` lays its cells
  out with a Piu `Row` — a bare `Container` stacks them at one x, measured.)
- **`runtime/roundsafe` (`RoundSafeArea`)** — a layout helper that insets its
  children to the round-screen safe area (and passes through on a rectangular
  screen), for content that would otherwise sit under a round watch's bezel.
- **Canvas-composition widgets (opt-in, each composes `Canvas` — reactive for
  free via auto-track):** `runtime/progressbar` (`ProgressBar`),
  `runtime/slider` (`Slider`), `runtime/toggle` (`Toggle`), `runtime/meter`
  (`Meter`, segmented), `runtime/sparkline` (`Sparkline`, a mini line chart),
  `runtime/dots` (`DotIndicator`, page dots). All device-verified on gabbro.
- **`runtime/easing` — Penner-style timing curves** (`linear`, `quadIn/Out/InOut`,
  `cubic*`, `sine*`, `expoOut`, `backOut`, `bounceOut`) for `animate()`/tweens;
  each maps `[0,1]→[0,1]` with exact 0/1 endpoints. Pure functions, no Piu.
- **`runtime/statusbar` — `StatusBar`**, a top strip with a left title and a
  right time (thunks auto-track). Device-verified on emery; on a round watch a
  top strip sits in the bezel-clipped cap (use a `RoundSafeArea` — coming).
- **`runtime/actionbar` — `ActionBar`**, Pebble's right-edge up/select/down
  button-hint strip. Device-verified (emery).
- **`runtime/card` — `Card`**, a titled fill-skinned content box (bold title +
  body children). Device-verified on gabbro + emery.
- **`runtime/kvstore` — `useKVStorage<T>(key, initial)`**, a reactive
  JSON-persisted store for structured values (the object sibling of
  `useLocalStorage`); corrupt/legacy values fall back to `initial`.
  Device-verified.
- **`runtime/draw` gains `arc`** — a rasterized ring segment (clockwise degrees,
  wraps the 0 seam) for gauges/dials. Draw primitive set: line, rect,
  rounded-rect, circle (fill+stroke), arc, text.
- **`runtime/badge` — a reactive count `Badge` (opt-in, composes `Canvas`).**
  A filled disc with a centered number that repaints for free when its `count`
  thunk changes. Device-verified on gabbro + emery
  (`screenshots/badge-{gabbro,emery}.png`).
- **`runtime/localstorage` — `useLocalStorage(key, initial)`**, a
  `useState`-shaped reactive string cell persisted to the host `localStorage`
  (webstorage over `device.keyValue`); degrades to an in-memory signal on a
  host without webstorage. Device-verified (`screenshots/localstore-*.png`).
- **`runtime/draw` gains `line` / `fillRoundRect` / `strokeRect`** — the draw
  primitive set is now line, rect, rounded-rect, circle (fill + stroke), text,
  all JS-rasterized `fillColor` spans on ONE Port.
- **`runtime/draw` — reactive immediate-mode drawing on ONE Piu Port
  (opt-in, zero-cost).** A `Canvas` component takes a `paint(g)` callback and
  gives it a `DrawContext` with `fillRect` / `fillCircle` / `strokeCircle` /
  `text`. Shapes are JS-rasterized into horizontal `fillColor` scanline spans:
  the P1 gating probe (`drawprobe`, gabbro — `screenshots/drawprobe-gabbro.png`)
  MEASURED that the Piu Port `onDraw` context exposes only `fillColor` +
  `draw{String,Texture,Skin,Content}` — there is NO native
  `drawCircle`/`drawLine`/`drawRoundRect`, so rasterization is the only path
  (Rule 2). Reactivity mirrors the `Move` idiom: `paint`'s signal reads are
  auto-tracked (it reruns in a non-drawing pass to subscribe) and the canvas
  repaints via one owner-scoped `effect` + `port.invalidate()` — no jsx bind
  path. An app that never imports `runtime/draw` never ships it (verified: the
  `list` app's pruned manifest omits it). Device receipts on both watch
  shapes: `screenshots/draw-gabbro.png`, `screenshots/draw-emery.png` (+ their
  `-grown` reactive-change frames). Example: `src/tsx/examples/draw.tsx`.

### Fixed
- **`Navigator` boots deep-nav apps again — the initial screen build is
  DEFERRED to `onDisplaying` (review-findings D1).** The initial `swap()` used
  to run during construction, inside `render()`'s build, stacking the whole
  screen tree on the firmware's fixed 384-slot value stack — `navmany` and
  `navreactive` both `fxAbort`ed at boot. It now runs when the host joins the
  display tree (the Piu run loop, shallow stack); both canaries + `multilazy`
  are device-verified live on gabbro. *Upgrading:* a Navigator's root screen
  now builds at DISPLAY time, not construction time — code that inspected the
  host's children (or relied on root-builder side effects) synchronously after
  `Navigator(...)` returns must wait for display; the Node test stub models
  this with `host.display()`.
- **A lazy computed's pull now runs under the computed's OWN identity and
  boundary (review-findings S9).** `S.get`'s recompute path drained the
  computed's prior-run cleanups BEFORE switching `current`/`owner` to the
  computed and never restored its captured ErrorBoundary — so a computed
  primed under boundary A but re-read from under boundary B routed a throwing
  cleanup to B (the reader's boundary) and attached cleanup-created trackables
  to the reader's subtree. The pull now mirrors `run()` (identity + boundary
  set before the drain, restored in `finally`); pinned by a conformance test
  that fails on the old code, and the S.get frame growth is boot-verified on
  gabbro (navmany + navreactive, the depth-audit gate).
- **`VirtualList` rich mode re-measured: `rows>1` is an arena BUDGET, not a
  firmware hang (review-findings D3).** A rich single-Label row renders at
  `rows=2` on gabbro; the ceiling is the row subtree's arena weight (~2 lean
  rich rows), and the failure is an exit-to-launcher OOM, not a wedge. VLRich
  docs and `SectionList`'s gate note corrected.
- **Documentation-accuracy sweep — stale `.md` claims corrected against source
  (four-agent audit; 99/99 screenshot refs and 1432/1432 internal links resolve).**
  (a) `docs/postmortem-navreactive-stack.md` and `docs/device-smokes.md` presented
  the `navmany`/`navreactive` boot canaries as green; on HEAD **both `fxAbort
  JavaScript stack overflow` at boot** after the round-twelve `flow.ts` batch
  (see review-findings D1) — added the explicit overturn banners Rule 2 requires,
  cross-referencing D1, and the device-smoke catalog table now lists all 14 runner
  apps. (b) `docs/faq.md` no longer claims a live `fetch()` round-trip "works" — the
  mechanism is designed but unverified in the sandbox (README gotcha 18). (c) tutorial
  fixes: `Bitham 30` → the fontcheck-valid `18/34/42`, Gothic sizes written discretely
  (`14/18/24/28/36`), and the byte store named by its real export `createStore` (not
  the module-private `Store`). (d) `docs/xs-heap-playbook.md` archive-limit "bisect
  pending" corrected to the SOLVED ~116.8KB moving edge the same section later records.
  (e) regenerated `docs/api/textflow` for the shipped `wrapCircle` / `shape="circle"`.
- **`Scrollable`'s `indicator` no longer wedges the firmware** (a
  build-passes/device-hangs bug the device retry caught, gotcha 24). The old
  `ContentIndicator` was a transparent `runtime/draw` Canvas Port OVERLAPPING the
  scrolled Column; on gabbro that hangs the Piu run loop (the screenshot /
  watch-info transport times out — not the emulator "rotting", as first assumed,
  but the app). Bisected across ~10 clean-reset installs: the clip, the measured
  `.height` read, `moveBy`, and arena weight all render fine; a Canvas Port that
  overlaps the `moveBy`'d Column — OR a second chevron Canvas beside it — is what
  wedges it. Rebuilt the indicator as `"^"`/`"v"` `Label`s in reserved,
  non-overlapping gutters (the down chevron takes an optional `max`; falls back to
  the measured `column.height`). Device-verified on gabbro across the full scroll
  (top → both-chevron mid-scroll → bottom). ASCII `"^"`/`"v"` because Pebble Gothic
  renders no `▲`/`▼`/`↑`/`↓` (MEASURED: tofu).
- **`SectionList` reclassified device-gated — it HANGS on gabbro** (honest
  correction of a false "runs on the device-verified VirtualList" claim; the same
  device retry that fixed Scrollable caught it). SectionList needs per-row styling
  (bold headers, highlight fill), so it drives `VirtualList` in RICH mode
  (`renderRow`) with `rows>1` — and that combination wedges the firmware. Bisected
  on a clean emulator (dots/richlist render as controls, proving the transport is
  healthy): `richlist` (rich, `rows=1`) renders, `forbind5vl` (simple `format`,
  `rows=5`) renders, but a rich list with `rows>1` hangs even NON-scrolling and even
  string-only — so it is the rich multi-row layout itself, not the content, styling,
  or scroll. Node suite passes (stub Piu never hangs) — the exact build-passes/
  device-hangs class. Strengthened the `VLRich` API warning with the measurement;
  banner'd `runtime/sectionlist` and its components.md entry. Fix (a VirtualList
  rich-multi-row change or a SectionList redesign to simple mode) is tracked
  separately — do not ship SectionList to a device until then.
- **`fontcheck` now rejects `bold 30px Bitham`** — a build-passes/device-fails
  gap the device retry caught: the vibration example crashed on gabbro with
  `URIError: font not found: Bitham-Bold-30.fnt`. The 30px Bitham face is
  Black-only (unlike 42px, which has a real Bitham-Bold-42), so the shorthand's
  `bold 30px Bitham` requests a font that does not exist. fontcheck had a
  special-case accepting it; removed (both weights of 30px Bitham now rejected).
  Fixed the vibration example to `bold 28px Gothic` and re-verified it renders on
  gabbro (a 6th batch-7 device receipt).
- **Per-app treeshake now follows runtime→runtime imports** (derived from
  source, not a hardcoded edge table). An app that imported only a composed
  catalog module (e.g. `Badge`, which imports `Canvas`) had its transitive
  `runtime/draw` pruned out of the manifest — a mod-load death that booted
  BLANK on device while the build passed. The unmapped-import tripwire now
  also scans shipped runtime modules so any future prune blind spot fails
  loud at build time instead of on the watch.
- **`Canvas` paints its first frame at mount** (an `onDisplaying` invalidate).
  A static canvas — or one whose signals hadn't changed yet — previously never
  painted, because the mount-time invalidate ran before the port was attached
  and was dropped.
- **`DrawContext.text` calls `drawString` with 5 args** (the device-proven
  shape); a 6th `width` sent the firmware down a field-alignment path that
  threw inside `onDraw` and blanked the whole frame.

### Changed
- **Children on a non-container Piu host now throw at build.**
  `<Label>…</Label>` (or any leaf — Piu `Content` has no `add()`) used to
  either render nothing silently or die later inside appendChild with an
  unactionable `add: not a function`; the element now fails loud by name:
  `jsx: <Label> cannot take children (not a container)`. Children that
  render nothing (null/booleans from a dead conditional like
  `{debug && <X/>}`) remain legal on any host. Part of the 1.0 contract so
  the tightening never lands as a post-release surprise.
- **`Show` (default mode) no longer rebuilds on a same-truthiness predicate
  re-eval.** `when: () => count() > 0` used to dispose+rebuild the shown
  subtree on EVERY `count` change; now it swaps only when truthiness flips,
  so the subtree's state/effects/timers survive (mirrors `keepAlive`'s
  same-side guard). Observable change for any app that relied on
  rebuild-per-re-eval — flip the predicate (or key the subtree off the
  value) if you need a rebuild.
- **`useMemo` now returns the computed itself — read `total.value`, not
  `total()`.** The runtime used to hand back a getter thunk while the packed
  lowering and auto-thunk both treated `useMemo` as `computed` (`.value`
  contract) — each style silently broke in the other's configuration. One
  contract now; a leftover call-style read fails loud in lint-reads
  (`ReadonlySignal` is not callable). No shipped example used `useMemo`.
- **`For`/`VirtualList` rows must be a single element — array/null rows now
  throw** `"row must be a single element"` instead of landing a raw array in
  the piu tree (garbage) or dying later in reconcile with an unactionable
  `TypeError`. A PORT constraint (one row = one mounted node), not Solid
  parity. Primitive rows still auto-wrap into a Label.

### Fixed
- **Round eighteen (codex review of the round-17 fixes).** Four more. (1) a
  barrel entry `import App from "./App"; export default App` now shims: the
  root-component detection resolves an imported default one level and shims if
  THAT module's default is component-shaped (was: only in-file declarations
  counted, so main.js exported the component without ever calling render() →
  blank boot; build A/B probe confirms the shim). (2) `--no-minify` builds now
  substitute the `__SP_CRASH_UI__` flag textually — the esbuild define pass only
  ran under `--minify`, so `CRASH_UI=0` was ineffective in debug builds and
  render() kept the crash screen (A/B probe: the shipped runtime-min now has
  the flag folded). (3) `useState`/signal equal-write skip uses `Object.is`, not
  `===`: re-setting `NaN` to `NaN` used to notify+repaint forever (NaN !== NaN)
  — fixed in both `set` and the raw `put`. (4) the app scaffold declares
  `@moddable/pebbleproxy` as a direct dependency so the phone-side
  `require("@moddable/pebbleproxy")` resolves under pnpm/non-hoisting installs.
- **Round seventeen (part 3, build pipeline).** (1) split-brain accounting now
  counts a lazy root as an owner of ITSELF: `app/a` importing `./b` while the
  entry also ships `importNow("app/b")` used to pass (b looked like a private
  single-copy helper) even though b's module-scope state exists twice — once in
  app/a's bundle, once in the standalone app/b module (A/B build probe: the
  fix fails loud, baseline misses it). (2) a manifest.base.json-honored `app/*`
  module's SOURCE now joins the scan sets, so its own `runtime/*` imports
  survive treeshake and its Texture/pdc ship (was: the escape hatch only
  suppressed the error, silently pruning the module's deps); an out-of-tree
  mapping warns loud instead. (3) every naive comment-strip in `build.mts`
  (lazy-import scan, self-render, JSX-runtime scan, lazy-helper walk) is now the
  string-aware `stripComments` — a `//` inside `"https://host"` on the same
  line as `importNow("app/s1")` used to eat the lazy target off the line and
  drop it from the manifest (A/B probe confirms app/s1 now ships).
- **Round seventeen (part 2).** Three more. (1) `lint-reads` now collects the
  getter from a read-only `const [count] = useState(0)` (setter omitted) so a
  getter on a static host prop (`<Container width={count}>`) is caught at build
  instead of throwing in `createHost` at render — but a read-only getter that
  merely escapes as a plain VALUE stays clean (it is never lowered, so nothing
  is lost). (2) `lint-reads` resolves one-level host ALIASES
  (`const C = Container; <C width={count}>`) the way auto-thunk does, so the
  static-prop check fires on the alias too. (3) `Navigator` now routes a pushed
  screen whose builder throws SYNCHRONOUSLY to its construction-time
  ErrorBoundary (was: the throw escaped `createRoot`/`push` to the button
  dispatcher, bypassing the local fallback). The catch is on the shallow
  push/pop path only — the deep initial build stays frame-free (Round-7 wall).
- **Round seventeen (codex review of 9fb63c4, part 1).** Two silent-failure
  edges. (1) the self-render helper resolver now strips an ESM-style runtime
  extension (`./boot.js` → `boot.ts(x)`) before probing, so a delegated-mount
  entry importing its helper as `./boot.js` no longer keeps the shim and
  double-mounts (a build A/B probe confirms the shim is suppressed). (2)
  `gen-manifest`'s comment stripper is now string-aware: a naive line-comment
  regex ate the `//` in `"https://api"` and dropped a same-line
  `new Texture("x.png")`, so the asset never shipped and the device failed to
  resolve it. A `stripComments` quote-state walk (with escapes) replaces the
  three naive strips; real comments are still removed.
- **Round sixteen (codex review of c3fc710).** Four fixes; a fifth
  (computed-ownership on the `S.get` hot path) is deferred pending on-device
  value-stack measurement. (1) `build.mts` self-render detection no longer
  false-positives round fifteen's own closure scan: a helper that merely
  DEFINES a render-using function the entry never calls used to suppress the
  shim → blank boot. It now requires the entry to ACTUALLY INVOKE a relative
  helper that renders (or render directly itself); a build A/B probe confirms
  the delegate-and-invoke case suppresses the shim while import-but-never-call
  generates it. (2) `Navigator` marks its handle dead in the disposal cleanup:
  a global `NAV` outliving its owner used to `swap()` on the unmounted host and
  leak the pushed screen's effects on a late `push()`/`pop()`; stale calls now
  no-op. (3) `lint-reads` resolves its script path with `fileURLToPath` instead
  of `new URL(...).pathname`, so a repo/consumer path with spaces (`%20`) no
  longer aborts the default build. (4) the `--preload-pure` v1 nested-import
  guard matches BOTH quote styles — a single-quoted `export { x } from './state'`
  slipped the double-quote-only check and ran its state in the preload/ROM
  compartment.
- **Round fifteen (codex review of 0af46bb).** Three "build passes, device
  silently wrong" auto-thunk/shim gaps. (1) `useReducer` getters now auto-thunk:
  `const [c, d] = useReducer(...)` with the bare form `string={c()}` was left
  unwrapped (the factory set only knew useState/signal/computed/useMemo), so the
  prop evaluated ONCE and never re-ran on `dispatch()`; useReducer returns
  `[getter, dispatch]` and is now collected like useState (named + namespace
  imports). (2) a read-only destructure `const [count] = useState(0)` (setter
  intentionally dropped) now thunks too — the collector required exactly two
  binding elements, so a one-element read-only binding stayed a one-time eval
  while `const [count, _]` worked. (3) `build.mts` self-render detection scans
  the whole entry CLOSURE, not just the entry file: an app that `export
  default`s a component yet delegates mounting to a relative helper (`boot(App)`
  where `./boot` calls `render`) used to get a generated shim ON TOP of the
  helper's mount — double mount; the closure scan now suppresses the shim
  (A/B build probe confirmed on gabbro: shim generated before, suppressed after).
- **Round fourteen (codex review of b1f1db0).** (1) `pnpm run verify` no longer
  bundles `test:xs` — it was documented (README, getting-started, device-smokes)
  as the SDK-free one-command gate, yet running it demanded the `xst` binary the
  docs themselves say to install separately. `verify` is now typecheck +
  coverage + consumer smoke (runnable with no SDK); the XS conformance laws move
  to a distinct `verify:full` (`verify` + `test:xs`), and device-smokes.md's
  gate list matches. (2) the npm quick-start build command
  (`node node_modules/signal-piu/build.mjs`) pointed at a non-existent path with
  no `--app` — it now says `npm run build`, the scaffold script that expands to
  `node node_modules/signal-piu/dist/build.mjs --app main`.
- **Round thirteen (codex review of c25d9c0).** (1) the lazy split-brain walk
  and owner-count now follow literal relative DYNAMIC imports
  (`import("./state")`) too — relativeClosure follows them, so esbuild
  inlines the helper and a stateful copy shared with another bundle
  split-brains just like a static import (the walk only matched `from`/bare
  imports); (2) a COMPUTED `importNow("app/screens/" + n)` inside a lazy
  module is now ALLOWED — the folder convention ships every `screens/*`
  file, so it resolves; round twelve's computed-app guard wrongly failed it
  even though its own error pointed users at the screens convention; (3)
  `gen-manifest` ships literal `new Resource("strings.dat")` data files —
  only `.pdc` was scanned, so a documented static-data file was omitted and
  the device lookup failed (a build/runtime gap like the Texture one); (4)
  lint-reads flags a `useState` getter on a HOST's NON-reactive prop
  (`<Container width={count}>`) — `createHost` throws `bindErr` at render
  (only string/state/variant/skin/style/active may be function-valued), so
  the lint gate now catches it instead of letting it die on device;
  component props and reactive host props stay exempt (no false positives —
  every shipped example still lints clean).
- **Round twelve (codex review of 9db32a2).** (1) `new Texture("x")` without
  the `.png` suffix now FAILS the build — it shipped the asset but threw
  `Texture x not found!` on device (README gotcha 19, measured); a
  fontcheck-style loud catch (`badTextures`) closes the silent build/runtime
  gap; (2) a COMPUTED `importNow("app/" + n)` issued from INSIDE a lazy
  module now fails loud like the entry-side guard — it ships no module and
  the nested navigation dies on device (the literal-only nested check missed
  it); (3) the lazy split-brain guard now fails ONLY when a stateful helper
  is SHARED — also in the entry's main.js bundle, or pulled by ≥2 lazy
  modules; a helper PRIVATE to one lazy screen is a single copy, so its live
  reactive state is legal (the guard wrongly made modular lazy screens
  unbuildable); (4) a `Navigator` inside an `ErrorBoundary` now restores its
  construction-time boundary when building screens pushed OUTSIDE render (a
  button/timer `push()` runs with no boundary in scope), so a pushed
  screen's throw hits the LOCAL fallback, not the top-level crash sink —
  frame-free on the deep initial-render path (Round-7 value-stack wall
  respected). Verified by a flow.test.mts case against the real compiled
  runtime plus a multilazy boot canary on gabbro (a combined
  ErrorBoundary+Navigator demo can't be device-screenshotted — the two
  together exceed the 32KB arena, an orthogonal memory limit).
- **Round eleven (codex review of b813133).** (1) `Navigator` screens get
  the same per-axis wrapper sizing as Show/ErrorBoundary — an anchored
  (l/r/t/b) navigator used to wrap every screen at concrete FULL-SCREEN
  dimensions, overflowing/ignoring the host's box; explicit width/height
  and the unconstrained full-screen fallback keep their measured-safe
  concrete shapes (device receipt: screenshots/navlrtb-gabbro.png, a
  two-label column inside an anchored navigator); (2) classify treats
  class HERITAGE (`extends makeBase()`) and COMPUTED member names
  (`[key()]`) as load-time effects — both execute at class definition, so
  preloading ran them in the build compartment; (3) treeshake's prune
  keeps NON-runtime base-manifest modules — the hand-written `app/…`
  mapping build.mts honors as the unresolved-importNow escape hatch was
  dropped by the prune (build passed, navigation died on device); its
  preload entry survives too.
- **Round ten (codex review of 47eaf83).** (1) `ErrorBoundary` sides get the
  same per-axis wrapper sizing as `Show` — a l/r/t/b-sized boundary handed
  its protected/fallback subtree an unconstrained wrapper that ignored the
  host's box; (2) an `importNow("app/…")` target the build cannot resolve
  to a shipped module (computed non-`screens/` name, missing file, path
  outside the conventions) is now a BUILD error instead of a silent
  treeshake-disable — the target never shipped and the navigation died on
  device; a hand-written `manifest.base.json` mapping the id is the
  documented escape; (3) a lazy ROOT that is ALSO statically imported by
  the entry is classified like its helpers: module-scope state fails loud
  (the two bundled copies' state silently diverged), pure duplication
  warns; (4) auto-thunk resolves NAMESPACE signal imports
  (`import * as sig` + `sig.useState(...)`) — a namespace user's bare
  reactive JSX read was left unwrapped, evaluated once and dead to
  updates; (5) preload-pure ALWAYS bundles a promoted module (mangling
  still follows `MINIFY`) and fails loud on bundle errors — a MINIFY=0
  build shipped bare package specifiers that died at preload. Also
  corrects round nine's `Show` wrapper claim (see the entry below) after
  an A/B on gabbro.
- **Round nine (codex review of 7c9828e).** (1) a throwing RE-RUN cleanup
  now reports to the effect's OWN ErrorBoundary — run() establishes the
  boundary before unsubscribe() drains the previous run's cleanups, where
  draining first escalated a boundary-owned effect's cleanup error past its
  local fallback; (2) a `Show` sized via left/right/top/bottom hands its
  side a FILLED wrapper (0/0 coordinates on any axis width/height doesn't
  pin). CORRECTION (round-ten A/B on gabbro): the old unconstrained
  wrapper did NOT render blank as first written here — it ignored the
  host's box, drawing the side content-measured at the host's origin
  instead of filling the sized region. A layout defect, not invisible
  content (receipts: screenshots/showlrtb-gabbro.png fills the box vs
  showlrtb-oldwrap-gabbro.png top-stuck). Size-less Shows keep the
  content-measured wrapper; (3) ALL-inline-type clauses
  (`import { type Theme } from "./x"`) erase at emit like `import type` —
  treeshake no longer follows them as closure edges or keep-set seeds
  (a types-only helper's literals failed fontcheck / shipped phantom
  resources for code that never bundles); (4) custom-font face matching is
  CASE-SENSITIVE like deriveFonts' TTF path match — `font: "20px fam"`
  against `Fam-Regular.ttf` used to pass fontcheck while deriveFonts
  shipped nothing (silent blank); (5) preload-pure retargets IMPORT
  SPECIFIERS only (`from "./x"`) — the bare replaceAll also rewrote
  same-text data strings in the entry; (6) `pack-table` writes the blob
  under the INVOKING project's `assets/` (cwd), not the installed
  package's — from a scaffolded app the blob landed in node_modules where
  the manifest's `../../assets/<name>` entry never looks.
- **Round eight (codex review of b8ce47d).** (1) bare side-effect imports
  (`import "./x"` / `import "runtime/flow"`) now count everywhere `from`
  clauses did: the treeshake keep-set (pruning a bare-imported runtime
  module failed valid builds at the tripwire), the lazy split-brain walk
  (a stateful helper reached only via `import "./state"` escaped the
  fail-loud guard), and preload-pure's no-nested-import check (esbuild
  would inline the helper's load-time work into a ROM module); (2) a
  nested `importNow("app/x")` issued from INSIDE a lazy module now fails
  the build loud — discovery only scans the entry closure (#27 v1), so
  the nested target never shipped and died on first navigation; (3)
  classify treats initializer-embedded ASSIGNMENTS
  (`export const ok = (globalThis.ready = true)`, `counter++`, `delete`)
  as load-time effects — preloaded, the mutation ran in the build
  compartment instead of at app load; (4) `runtime/jsx-runtime` is seeded
  whenever a shipped `.tsx` looks JSX-bearing — tsc injects the automatic
  JSX import only AFTER the source-level treeshake scan, so a JSX lazy
  screen under a hand-Piu entry pruned the module and failed a valid
  build; (5) font KEY grammar covers equivalent JS spellings — `"font":`
  and `font :` are the same Piu dictionary key, but deriveFonts shipped no
  TTF and fontcheck never validated the literal (silent blank render),
  while `myfont:` no longer matches at all.
- **Round seven (codex review of e7a0b65).** (1) a child effect whose FIRST
  run throws now unparks its id from the owner list — the freed id could be
  recycled and the owner's teardown then disposed an innocent unrelated
  effect; (2) squash bails on a SELF-REFERENTIAL arrow table
  (`const H = [() => H[1](), …]`) — overlapping edits corrupted the
  generated lazy module; (3) the lazy split-brain guard walks the
  TRANSITIVE compiled closure (`./view` → `./state` with a module-scope
  signal no longer escapes as "pure ./view"); (4) an ASYNC root default
  fails the build (`render()` is synchronous — the shim would mount a
  Promise); (5) fontcheck strips comments before scanning (a commented-out
  `font:` example no longer blocks builds); (6) symbol diet treats
  `export * as ns from "runtime/…"` as a rename blocker like `import * as`
  (renamed wires broke `ns.effect` on device); (7) `.mise.toml` pins
  pnpm 11.10.0 matching `packageManager` (was 10).
- **Font + scaffold round (codex review of 9aabdbf).** (1) fontcheck's
  system table now carries the FULL documented firmware set — rejecting
  `"36px Gothic"` (README gotcha 7 lists Gothic 9–36, Bitham Light/Medium,
  Leco) failed builds for valid built-ins; (2) custom fonts are validated
  by FACE, not family: `font: "italic 20px Fam"` with only
  `Fam-Regular.ttf` shipped used to pass while deriveFonts emitted nothing
  — blank on device (the audit's deferred face-matching gap, now closed);
  (3) the app scaffold's package.json ships `signal-piu` +
  `typescript`/`esbuild` dependencies — a scaffolded project's
  `npm install` installed nothing and `npm run build` failed on a missing
  package; (4) the lazy split-brain guard is classify-gated: duplicating a
  PURE helper stays a warning, but a helper with MODULE-SCOPE STATE (a
  shared signal store) now fails the build loud — the lazy copy's state
  silently diverged from main's.
- **Parity round two (codex review of 2f8cff6).** (1) symbol diet rewrites
  `export { For } from "runtime/flow"` re-exports in shipped modules — the
  wire side only, the exported name stays stable — a renamed wire used to
  leave the re-export requesting a missing export (load death); (2)
  auto-thunk recognizes a one-level HOST alias (`const L = Label`) — its
  reactive props were evaluated once and dead to updates; (3) backtick
  `font:` literals count in fontcheck AND deriveFonts; (4) classify treats
  tagged templates (`makeStyle\`…\``) as load-time calls; (5)
  relativeClosure skips type-only relative edges (`import type { Theme }
  from "./types"`) — a types-only helper's string literals no longer fail
  fontcheck or ship phantom resources for code that never bundles; (6)
  `./tools/*` package exports resolve to compiled `dist/tools/*` (the
  source `.mts` mapping could never run under node_modules) and the README
  quickstart uses the scaffolded `npm run build`.
- **Scan-grammar parity round (codex review of b848555).** Six blind spots
  where shipped code and the pre-build scans disagreed: (1) the closure
  reader is now file-only — `import "./setup"` beside a `setup/` directory
  used to die with EISDIR before the index candidates were tried; (2)
  ESM-style `./art.js` specifiers resolve to their TS twins; (3) backtick
  no-substitution literals count everywhere quotes did — relative dynamic
  imports, `new Texture(...)`, `.pdc`, `romTable(...)` — while substitution
  templates never match (and a substitution dynamic import correctly
  self-disables treeshake); (4) `export { X } from "runtime/..."`
  re-exports feed the prune keep-set like imports (a demoted re-exported
  name failed the module at load); (5) fontcheck sees digit-bearing
  families (`"20px B612"` used to skip the literal entirely and render
  blank); (6) classify treats class STATIC initializers/blocks as load-time
  effects, so `static skin = new Skin(...)` can no longer be promoted into
  a preloaded ROM module.
- **treeshake ignores type-only runtime imports.** `import type { ForProps }
  from "runtime/flow"` erases at emit, but the raw seed scan kept the whole
  flow/jsx/signals stack preloaded against the boot floor. Type-only
  clauses (and commented-out imports) no longer seed; inline `{ type X, y }`
  mixes still do. A form the scan misses now fails LOUD at build time via
  the unmapped-import tripwire instead of dying on device.
- **Literal relative dynamic imports join the source closure.**
  `import("./art")` is inlined into the bundle by esbuild, so its
  Texture/pdc/romTable refs SHIP — but the closure scan never followed it
  (assets silently missing from the PBW). relativeClosure now follows
  literal relative `import(...)` specifiers, and the build treats them as
  statically resolved (they no longer self-disable treeshake); computed
  specifiers still do.
- **For's duplicate late sweeper removed.** The cleanup-ordering fix
  registered For's row sweeper before the effect but left the old
  post-effect registration in place — owner drain is LIFO, so the LATE copy
  ran first and rows disposed while the reconcile effect was still
  subscribed (a row cleanup writing an `each()` dependency could re-enter a
  half-dead pass). Single pre-effect registration is the contract, pinned.
- **Flow cleanups register with the owner BEFORE the first build.** In
  For/Show/Navigator the owner-cleanup (`track`) call sat after the initial
  effect/swap — a row or side that threw during the FIRST pass aborted the
  component before the cleanup ever registered, so subtrees built earlier
  in that same pass leaked past the caller's dispose (their bindings kept
  re-running; refuter probe). Registration now precedes the build in all
  three.
- **Root disposal is idempotent and re-entrancy-safe.** A cleanup that
  called its own root's disposer (or a plain double dispose) re-drained the
  still-attached disposables list — siblings ran twice and the re-entrant
  path recursed without bound. The disposer now detaches the list before
  draining.
- **A throwing initial effect run no longer leaks a zombie subscriber.**
  `effect()` whose first run throws never returns an id, so an unowned
  effect stayed allocated and subscribed to whatever it read before the
  throw — re-running (and re-throwing) on every later write with no handle
  to dispose it. The runtime now disposes the effect eagerly and rethrows.
- **Navigator drops a same-builder redirect's orphan.** A screen that
  redirected by pushing the SAME builder function object passed the
  stack-top identity guard (top === build), double-mounting the screen and
  clobbering the real mount's disposer. A nested swap installing
  `disposeTop` is now a second bail signal.
- **Root shim: self-render detection resolves the actual runtime import.**
  A raw `render(` text test suppressed the shim for any unrelated
  occurrence (`view.render()`, a local helper named render) — the default
  component then shipped without a mount and booted blank. Self-rendering
  now means the `runtime/jsx-runtime` render is imported (named, aliased,
  or namespaced) AND called.
- **`Show` self-heals after a contained throwing side.** The truthiness memo
  latched BEFORE the build, so a side whose builder threw (contained by the
  runtime) left the host empty while `Show` believed the side was mounted —
  suppressing every retry at that truthiness. The memo now resets to
  "unbuilt" when a build throws; any next re-run rebuilds (same self-heal
  contract as For's mid-reconcile-throw pin). The latch itself stays BEFORE
  the build: a builder that writes a `when` dependency during its own build
  re-enters the effect, and the early-return guard must catch it (an
  unlatched memo double-mounted the side and leaked a root — adversarial
  refuter probe).
- **`createResource` drops a superseded fetcher's SYNCHRONOUS throw.** The
  loading write notifies, a subscriber may re-entrantly `refetch()` during
  it, and the superseded frame's fetcher then runs after the newer one — its
  sync throw now checks the generation like the rejection handler instead of
  clobbering the newer request's loading state (codex review).
- **`asRow` also refuses FUNCTION rows.** `asNode` unwraps exactly one thunk
  level, so a double-thunk row mounted a raw function into the piu tree —
  the same silent-garbage class the row guard exists to kill (refuter probe).
- **Build: lazy-module closures scanned; lazy bundling must succeed; an
  aliased `render` call blocks the root shim** (codex review). A lazy root's
  `./helper` now joins the scan set via its relative closure (its
  Texture/pdc/romTable assets ship and its runtime imports count toward the
  keep-set); a failed lazy esbuild bundle fails the build instead of
  shipping dead `./x` specifiers; `import { render as mount }` + `mount(...)`
  counts as self-rendering (a shim on top would mount twice).

### Added (lint)
- **lint-reads `child-signal`:** a bare signal/computed/`useMemo` OBJECT as a
  JSX child (`<Column>{total}</Column>`) fails the build. appendChild only
  rejects function children, so the object landed in the piu tree as silent
  garbage — and the `useMemo` `.value` unification turned the once-loud
  function-child shape into exactly this silent one (refuter probe).
- **Computed core hardening.** A computed's reader now subscribes BEFORE the
  recompute (a mid-recompute disposal can no longer drop the reader's
  subscription), and `dispose()` clears EVERY forward id it finds — a
  disposed-then-reused effect id no longer resurrects a frozen computed or
  wipes the reusing effect's subscriptions.
- **Byte store hardening.** `load()` validates the whole blob (tag widths,
  reserved tags 6/7, header bounds, overrun) BEFORE committing bytes — a
  rejected load is now a true no-op instead of clobbering live records;
  `o(i)` rejects negative/fractional/out-of-range indices (a fractional
  index used to hang the record walk); `def(tag)` requires an integer
  8..255; `romTable` wraps negative/huge indices exactly.
- **`animate` ticker survives a same-tick restart cascade.** A completion
  write that stopped the last other tween and started a replacement used to
  orphan the replacement's timer (double `clearInterval` state); the ticker
  now only releases the global when it is still the one this tick captured.
- **`createResource` routes a synchronous fetcher throw to `error()`** —
  previously it escaped at module init (or left the resource stuck loading);
  refetch after a sync throw recovers.
- **`For`/`VirtualList` primitive rows wrap into Labels** (a raw
  string/number handed to piu add/insert crashes the port).
- **fontcheck: full-closure scan, italic rejection, token order.** Every
  app-closure file is scanned (a helper's/lazy screen's bad `font:` literal
  ships and renders blank the same way); `italic` on a system font is
  rejected (no italic face exists); style tokens now match in EITHER order —
  `"bold italic 42px Bitham"` used to escape the scan entirely.
  `deriveFonts` gained the same order tolerance (both orders name the same
  `-BoldItalic.ttf` face).
- **gen-manifest sees lazy modules and keeps sibling `data` keys.** The
  resource scan now runs AFTER lazy-module discovery over the same source
  set as treeshake (a lazy screen's `Texture`/`.pdc`/`romTable` refs ship);
  the derived `data["*"]` merge no longer clobbers platform-qualified keys a
  hand-written `manifest.base` carries (same union rule resources already
  had).
- **`MINIFY=0` no longer ships lazy modules unbundled.** An unbundled lazy
  module kept `./x` relative specifiers the manifest never maps — dead on
  first `importNow`. Lazy modules now always bundle; only the identifier
  mangling follows the minify flag.
- **Root-component shim: narrowed trigger + treeshake seed (fetchtest was
  boot-dead).** `export default <ident>` only generates the render() shim
  when the default is statically a function (declaration/arrow/in-file
  binding) — an `Application`-instance default (fetchtest) is a BARE app
  again, not a shim call on a non-component. The shim decision moved BEFORE
  the treeshake run and seeds `runtime/jsx-runtime`, so a root-component app
  with no explicit runtime import no longer gets the shim's own import
  pruned into a mod-load death. Device receipt:
  `screenshots/fetchtest-boot-gabbro.png` (the previously boot-dead app
  rendering "SELECT to fetch" on gabbro).
- **Lowering miscompile on invisible value-escapes.** A `useState` pair (or
  `signal`/`computed` binding) referenced through a shorthand property
  (`{ setName }`) or an export specifier (`export { setA }`) still lowered —
  the declaration was removed while the reference survived, leaving a
  dangling identifier that died on device (`TypeError: call: not a
  function`; the pulse incident). The reference scan now resolves those
  shapes (`valueSymbol()`), so every escape correctly BAILS the binding to
  the heap object API. Measured: 3 of 6 escape shapes miscompiled before,
  0 after; all 6 selftest-pinned.

### Added
- **lint-reads rule 5** (`setter-as-value` / `getter-as-value`): a `useState`
  getter/setter escaping as a VALUE now fails the build with the wrap fix in
  the message (`(v) => setName(v)` / `() => name()`) — an escaped pair
  silently loses the packed lowering, and the shorthand shape used to be
  device-fatal. Type-position references (`typeof setN`) are exempt, and a
  site already flagged by a sharper rule is not double-reported.
- **Build tripwire: unmapped runtime imports fail the build.** After all
  passes, every `runtime/*` module a shipped artifact (main.js, lazy, pure)
  still imports must be mapped in the manifest — an unmapped import is a
  guaranteed mod-load death on device while the old build exited 0 (how
  fetchtest shipped boot-dead). Catches any future scan blind spot, e.g. a
  tsc-injected JSX import in a lazy module whose source never names a
  runtime module.

## [1.0.0] - 2026-07-16

First cut. Everything below accumulated as Unreleased during the build-out;
device receipts for each claim live in `screenshots/` and the docs.

### Upgrading
First release — nothing to upgrade from. New projects:
`npx create-signal-piu` (or see docs/packaging.md).

### Added
- **`romTable(name)`** — typed read-only access to packed string tables in
  the flash resource area (zero boot RAM; one transient string per read).
  Pack with `tools/pack-table.mts <name> <strings.json>`; the manifest
  ships any `romTable("<name>")` literal's blob automatically. Example:
  `romtable` (200 entries live from flash, device-verified).
- **Symbol diet** (`tools/symbol-rename.mts`, default ON, `--no-symdiet`/
  `SYMDIET=0`): an end-of-build pass renames each surviving runtime EXPORT
  wire name (`jsx`/`jsxs`/`render`/`S`/`createStore`/`effect`/…) — and every
  matching import, including lazy-module imports — to a host-known symbol id
  from a curated obscure-constant pool, so `fxMapArchive` adds no new id and
  the export costs no boot slot. Touches only import/export specifier
  clauses (local code byte-identical); monotonic + collision-checked.
  Device-verified: list 47→41 new-to-host, lazyscreen 43→34, both boot and
  render.
- Automated **SQUASH pass** (`tools/squash.mts`, default ON for lazy
  modules, `--no-squash`/`SQUASH=0`): a module-level array-of-arrows used
  only as `H[i](args)`/`H.length` packs into ONE dispatch function — the
  device-proven lazymany→lazypack fix, applied mechanically (bail-safe on
  any other shape). lazymany (70 thin arrows, previously fatal at runtime
  load) now boots with zero source changes.
- Build **squash advisory**: lazy modules creating >16 function objects at
  load (that the pass could not pack) get a warning pointing at the
  switch-pack pattern.
- **Folder-convention screen splitting**: every
  `src/tsx/examples/<app>/screens/*.tsx|ts` auto-ships as a lazy module
  `app/screens/<name>` — the imported name may be COMPUTED
  (`importNow("app/screens/" + n)`) without disabling treeshake/prune,
  because the whole folder ships and feeds both keep-sets. Example:
  `autoscreens` (device-verified).
- `createResource(fetcher)` async primitive; typed `ByteStore`; generic public
  API (`signal<T>`, `ReadonlySignal<T>`, flow prop contracts).
- Per-app **export pruning** (`--no-prune` to disable) — unused runtime exports
  are dropped from the shipped mod (clock: 15613 → 9988 bytes, boots again).
- `create-signal-piu` scaffold CLI; compiled `dist/` for consumers
  (`dist/build.mjs`); `npm run dev` (build+install+logs, `--watch`).
- `npm run test:xs` — conformance laws on the real XS engine.
- Examples: consumer (npm-package proof), watchface, worker, migration
  (before/after), navreactive, navmany, `textinput` (keyboard-less
  button-driven char picker → reactive todo list).
- Boot-floor measurement kit: `tools/gen-boot-probe.mts` (one-variable boot
  probes: data bytes / extra modules / fresh symbol interning / `--res`
  data-to-Resource variant) and `tools/xsa-symbols.py` (count the symbols a
  mod archive interns at boot).
- `tools/host-symbols.py`: extract the firmware host's full interned key
  list from the SDK debug ELF — with xsa-symbols this shows exactly which
  build symbols are new-to-host (the ones that cost boot slots).
- **`lazyauto` — the watchface pattern (owner's idea), device-proven at 0ms with a LIVE CLOCK inside the lazy module** (ticking verified across screenshots on the real-watchface build):
  a 10ms setTimeout importNow auto-loads 40KB after boot with no buttons;
  the same app packaged as a TRUE watchface (watchapp.watchface=true)
  installs and renders identically.
- **`lazymany`/`lazypack` cells — the many-components answer**: 70 thin
  fns die even at runtime load; the same bodies switch-packed into ONE
  function work — compiler squash pass validated. `lazyone` scaled:
  104KB source works, 208KB dies at launch (archive limit 71-131KB).
- **`lazyone` example — ONE 40KB module, device-proven**: a single lazy
  module of ~40KB (5 fat fns) importNow-loads at runtime and renders; the
  16-24KB ceiling is a BOOT-load limit, not a module-size limit.
- **`lazyfat` example — 40KB total code, device-proven**: five ~8KB lazy
  screen modules; all load on demand (instruments: modules 4→9, slot use
  +~64B) and render. Mechanism pinned: mods have NO real preload (mcrun
  ignores the list) — bytecode is XIP flash, module OBJECTS build at
  load; so few-fat-functions per module + lazy importNow is THE pattern.
- **Code-in-ROM campaign (owner's smart-split goal)**: per-FUNCTION boot
  cost discovered (4KB dies as 46 fns, boots as 8 fat fns); **16KB of
  frozen code boots** (archive 29KB); `romscreens` example — screen
  builders frozen into ROM via `--preload-pure` (instruments-verified);
  `gen-boot-probe` gains `--code/--diet/--fat/--klass`; every build now
  prints its archive `symbols:` count.
- **Lean-preload measured (v1 mechanism vindicated with headroom)**: a
  4KB/8KB pure data module under `--preload-pure` boots + reads on a lean
  app class with IDENTICAL slot usage at both sizes — frozen structure is
  truly ROM; only the module's fixed cost gates it (fatal at zero margin).
  PRELOAD_PURE stays opt-in; decision table in the playbook.
- **v2 data-to-Resource, device-proven**: big static tables ship as ONE
  resource blob and live-decode from flash (ranged `resource.slice` +
  `String.fromArrayBuffer`); the same 4KB that dies in main.js renders
  live. See playbook "v2: data-to-Resource — DEVICE-PROVEN".
- `coexist` example (device-verified): hand-written imperative Piu and
  signal-piu JSX in one Application, updating independently — the
  region-at-a-time migration pattern (see docs/migration.md "Coexistence").
- Lazy app modules (#27): a literal `importNow("app/<x>")` in the entry ships
  `src/tsx/examples/<app>/<x>.tsx` as a NON-preloaded manifest module —
  bytecode loads from flash on first call; treeshake/prune stay ON (the
  build resolves the literal). Example: `lazyscreen` (device-verified).

### Fixed (knowledge)
- The "~15.9KB mod archive boot ceiling" model is **overturned** (README
  gotcha 15 correction; playbook "The boot floor"): boot deaths are a slot
  floor (interned symbols, module records, top-level bindings) plus a chunk
  budget (bytecode/data) — one new-to-host symbol can be fatal where +1KB of
  inert data boots. `PRELOAD_PURE` stays OFF: extra modules ADD boot cost.

### Changed
- **Core-reactivity round (glitch-free + running-owner, one pass).**
  Computeds are now LAZY: `fn` runs on READ (first read included), validated
  against a global write version, pulling sources first — a diamond sink runs
  once, straight to the correct value (conformance law 12 = MATCH, verified
  on real XS). All notifies coalesce into turns (batch semantics on every
  write). Effects auto-register with the innermost owner (running effect or
  root); nested effects are disposed before the parent re-runs (law 18 =
  MATCH). Measured on gabbro: −2 archive symbols vs the old core, +767 B
  bytecode; navmany/clock/coexist re-verified.
  *Upgrading:* `track(effect(...))` is redundant — call `effect()` bare (the
  explicit form still works but double-registers). `computed(fn)`/`useMemo`
  no longer run `fn` at creation — the first `.value` read does; code that
  relied on creation-time side effects of a computed must read it once.
  Disposing a computed's owner now freezes it (reads return the last value,
  `fn` never re-runs) — same observable value as before.
- **JSXNode type split** (was `Node = any`): children/build thunks are typed
  `Content | string | number | boolean | null | undefined | JSXNode[]`.
  *Upgrading:* code that passed arbitrary placeholder objects as children now
  fails typecheck (it was never renderable at runtime); return real elements
  or primitives.
- Consumers run `node_modules/signal-piu/dist/build.mjs` (NOT `build.mts` —
  Node refuses type-stripping under node_modules).

### Fixed (knowledge, round 3)
- Archive size limit SOLVED (corrects "112-131KB band / suspect mod
  AREA"): on QEMU the mod archive is malloc'd into the APP HEAP
  (`ArchivePebbleResource.c` → `applib_resource_mmap_or_load` fallback),
  so the ceiling is `archive + app-heap runtime needs ≤ free heap`
  (130,768B on gabbro's 128K class) and moves with the app. Lean-cell
  edge: 116,816B works (App bytes free = 3,088 at rest), 117,042B dies
  at launch. Probe generator: `tools/gen-lazyone.py`.

### Fixed
- romscreens white screen: the runtime-min prune keep-set never scanned
  preload-pure module files, so `jsxs` (imported only by the frozen
  screens module) was demoted out of jsx-runtime and render failed
  silently. build.mts now importScans pureFiles like lazyFiles;
  device-verified (screens 1/2/3 render + select/back nav).
- #29 boot regression (arena floor vs runtime size) via export pruning;
  the "swapped-screen reactive crash" was the same pressure — overturned.
