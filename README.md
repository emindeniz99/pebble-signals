# signal-piu

**Runtime fine-grained reactive UI for Pebble (Alloy / Piu / Moddable XS).**

Write Pebble watchfaces and watchapps in **TypeScript + JSX**, React-style —
components, `useState`, live bindings — and they run ON the watch, inside its
32KB JavaScript heap. Fine-grained signals (the Solid model) are what makes
that fit: the UI tree is built **once**, there is no virtual DOM and no
re-render, and every update is a single Piu property assignment driven by
the one signal that changed.

> **Coming from React?** Three differences carry the whole model:
> ① components run ONCE (no re-render — state works anywhere);
> ② read state by CALLING the getter — `count()`, not `count`;
> ③ reactive props are thunks — `string={() => "c" + count()}` (the build
> auto-wraps bare reactive reads). Full story: [Core concepts](docs/concepts.md)
> · [API parity](docs/api-parity.md).

**Start here:** [Getting started](docs/getting-started.md) (SDK setup → first
face) · [Tutorials](#tutorials) · [Use it in your project](#use-it-in-your-own-project-npm)
· [Examples gallery](docs/examples.md) · [All docs](docs/README.md) ·
[Troubleshooting](docs/debugging.md).

This is (as far as we know) the first **runtime**-reactive UI running on this
hardware. The existing React-like option, [react-pebble], resolves all
reactivity at compile time in Node and emits static Piu code; signal-piu keeps
a live reactive graph on the watch itself, so runtime-dynamic UIs (lists that
change shape, data-driven trees) work without a compile step.

All milestones below were verified on the **gabbro** (Pebble Round 2,
260×260) emulator, SDK 4.17, and the combined demo additionally runs its
full interaction set on **emery** (Pebble Time 2 — `m7-emery.png`). Every
number in this README is measured from XS instrumentation logs or
on-device bisection — none are estimates.

![combined demo](screenshots/m7-show-odd.png)

## Quick start

Prerequisites (pebble tool v5 + SDK 4.17 with the QEMU emulators, Node ≥ 24,
pnpm): install steps in [Getting started](docs/getting-started.md).

```sh
git clone <this-repo> && cd playground/projects/signal-piu
pnpm install
pnpm run dev -- --app watchface     # build + install + live logs, one command
```

**Success looks like:** the gabbro emulator shows a black face with a big
HH:MM, a ticking seconds line and the date, while the terminal streams
`instruments:` heartbeats about once a second. (Zero heartbeats = dead
transport, not a quiet app — [troubleshooting](docs/debugging.md).) Any
other example works the same way: `pnpm run dev -- --app pulse` runs the
[flagship face](docs/examples.md).

The default `./build.mts` + `pebble install --emulator gabbro` builds the
`list` demo — a dynamic mixed-type list in a byte pool with a 3-row window
(**up** pushes a record, **down** removes; buttons because of an emulator
touch bug, gotcha 2) — 40+ records with a flat arena.

### Tutorials

- **[Build a watchface](tutorials/build-a-watchface/README.md)** — the
  reactive core in 3 short parts (signal → binding → computed complication).
- **[The complete watchface](tutorials/complete-watchface/README.md)** — the
  full shipping arc in 6 parts: custom fonts, images, a settings page,
  persistence, the installable `.pbw`. Every part backed by a device-verified
  example.

### Use it in your own project (npm)

```sh
npx -p signal-piu create-signal-piu my-watch
cd my-watch && npm install && node node_modules/signal-piu/build.mjs
```

The package ships the runtime sources, the whole compile pipeline and typed
host globals — [packaging & consuming](docs/packaging.md) has the exports
map, upgrade rules and the worked [consumer project](examples/consumer/).

### Development & testing (this repo)

```sh
pnpm run verify      # SDK-free gates: typecheck + tests @100% cov + consumer smoke
pnpm run smoke:device  # the 14-app on-emulator verification matrix
pnpm run test:mem    # on-device memory audit (needs the app installed on the
                    # gabbro emulator and pypkjs killed: pkill -9 -f '[p]ypkjs' —
                    # the [p] stops -f matching YOUR OWN shell's command line)
pnpm run test:limit  # limit finder / regression canary: adds todo rows until
                    # the arena dies and reports the exact item count
python3 tools/drive.py gabbro b:select s:1 d:shot   # deterministic emu driver
pnpm run preview -- counter   # browser layout preview (no emulator; approximate)
```

## Examples — one app per example (react-pebble style)

Several prebuilt reactive screens in one mod exceed the 32KB arena at
boot (see the multi-screen section), so examples ship as STANDALONE
apps, selected at build time:

```sh
APP=clock ./build.mts && pebble install --emulator gabbro
```

### Build flags

All optimizations are **default-on and self-disabling** — the safe, lean
build needs no flags; each flag exists to turn an optimization *off* (for
debugging) or *force* it past its self-disable.

| Flag | Default | What it does |
|------|:---:|--------------|
| `APP=<name>` | `list` | which `src/tsx/examples/<name>.tsx` to build |
| `MINIFY` | `1` | esbuild minify (DCE + identifier mangling) on the runtime and the bundled app. `MINIFY=0` ships **readable** modules for debugging — correctness is identical. Self-disables to a verbatim copy if esbuild is missing. |
| `TREESHAKE` | `1` | prune the manifest to the runtime modules the app actually imports (a pure-signal watchface drops `runtime/flow` from preload). **Self-disables** when the app uses a dynamic `import()`/`importNow()` the static scan can't follow — pruning could drop a module reached at runtime. A LITERAL `importNow("app/<x>")` does NOT self-disable: build.mts resolves it to `src/tsx/examples/<app>/<x>.tsx`, ships it as a non-preloaded manifest module, and counts its runtime imports in the keep-set (`lazyscreen` example). `TREESHAKE=0` forces the full runtime; `TREESHAKE_FORCE=1` prunes anyway. |
| `BUNDLE` | `all` | app-submodule strategy. `all` inlines the app's own `./`-imports into `main.js` (loaded into the 32KB heap). `preload` targets a large static shared submodule frozen into ROM — its device-verified realization is the lazy-import path in `multilazy.tsx` (build.mts points there rather than ship an unmeasured eager-preload path, Rule 2). `runtime/*` is always left external/preloaded in both. |
| `SKIP_FONTCHECK` | `0` | skip the compile-time Pebble system-font validation (gotcha 20). Set to `1` for custom/new fonts. |
| `LINT_READS` | `1` | fail the build on reactive-read bugs — calling a `.value` signal, stringifying a getter, passing a `useState` getter/setter as a VALUE (rule 5; the pulse `{ setName }` death shape, gotcha 23). Each finding names its fix (e.g. wrap: `(v) => setName(v)`). `LINT_READS=0` bypasses — prefer the wrap. |

Every app below is verified on BOTH watches — **gabbro** (Round 2, round
260×260) and **emery** (Time 2, square 200×228) — from the SAME source,
with no per-platform code. Layout is fill-based (`left/right/top/bottom
={0}`) plus a centering `Column`, so **Piu's layout engine positions
everything at runtime from the actual screen size** — the round and
square screenshots below come from identical `.tsx`.

| APP | UI | Proves | gabbro (round) | emery (square) |
|-----|----|--------|:---:|:---:|
| `list` (default) | dynamic mixed-type list, 3-row window, PERSISTED | store + windowing + buttons + localStorage | ✅ `ex-list-persisted.png` | ✅ `em-list.png` |
| `clock` | ticking HH:MM:SS watchface + date | `Date`, `setInterval`, Bitham + Gothic styles | ✅ `ex-clock.png` | ✅ `em-clock.png` |
| `watchface` | greeting + HH:MM + seconds/date face | fine-grained: same-value writes skip repaint (tutorial) | ✅ gabbro-verified | (same source) |
| `counter` | classic up/down counter | `useState` + button handlers | ✅ `ex-counter.png` | ✅ `em-counter.png` |
| `toggle` | ON/OFF with live skin+style flip | reactive `skin`/`style` setProp path | ✅ `ex-toggle-on.png` | ✅ `em-toggle-on.png` |
| `forbind` | 3 reactive `For` rows (gotcha-16 testbed) | reactive bindings INSIDE For rows | ✅ `ex-forbind-boot.png` / `ex-forbind-updated.png` | ✅ `em-forbind.png` |
| `forbind5vl` | **5 LIVE reactive rows** via recycled `VirtualList` cells | recycling beats keyed `For` at the ceiling: raw `For` over 5 rows fxAborts, these 5 update live | — | ✅ `forbind5vl-emery.png` |
| `scroll` | **virtualized infinite scroll** via `VirtualList` | windowing + cell recycling + scroll offset | ✅ `scroll-gabbro-*.png` | ✅ `scroll-emery-*.png` |
| `richlist` | **rich recycled rows** (`renderRow`): 2-column row, 1 visible, scrollable | multi-element rows, not just text | ✅ `richlist-gabbro-*.png` | ✅ `richlist-emery-*.png` |
| `slothface` | **animated sloth watchface** 🦥 (text-frame animation + clock) | timer-driven frame animation via signals | ✅ `slothface-*.png` (awake/blink/sleepy) | — |
| `imgwatch` | **animated COLOR bitmap watchface** + HH:MM:SS | bundled bitmaps (png2bmp), `Texture`, frame-swap animation | ✅ `imgwatch-red.png` / `imgwatch-blue.png` | — |
| `sloth` | **polished animated sloth watchface** 🦥 (soft-shaded 140px emoji, sprite-sheet blink, big one-line HH:MM:SS + date) | one `Texture` sheet, reactive `variant` sprite animation | ✅ `sloth-gabbro-open.png` / `sloth-gabbro-blink.png` | ✅ `sloth-emery-open.png` / `sloth-emery-blink.png` |
| `slothvec` | **VECTOR sloth watchface** 🦥 (2.8KB PDCS, drawn 2×/120px, SWINGS from the branch AND BLINKS) + one-line HH:MM:SS + date | `SVGImage` + PDC: free scaling, transform animation + native frame sequence, zero pixel RAM | ✅ `slothvec-gabbro.png` / `slothvec-gabbro-blink.png` | ✅ `slothvec-emery.png` / `slothvec-emery-blink.png` |
| `multilazy` | **lazy multiscreen**: 3 screens, SELECT cycles, ONE built at a time (dispose + on-demand rebuild) | arena holds O(1 screen) — survives repeated full cycles with live bindings | — | ✅ verified (screens cycle, tick binding live after each rebuild) |
| `multiscreen` | 4 PREBUILT screens in one mod | does NOT boot — kept as the arena-OOM artifact that motivated `multilazy` | ❌ by design | ❌ |
| `lazyscreen` | **TRUE lazy screen** (#27): SELECT `importNow`s a NON-preloaded module from flash, BACK returns | screen 2's bytecode is not in main.js and loads on first push; module exports `default` only (symbol diet — the module still costs 2 ids + its symbols AT BOOT, gotcha 15 correction) | ✅ verified (boot → lazy s2 renders → back) | — |
| `coexist` | **hand-Piu + JSX in ONE app**: reactive JSX label on top, classic imperative `new Label` mutated by a timer below | migration is not all-or-nothing — `render()` returns a plain Piu Application; hand-built content `add()`s next to the JSX tree and both update independently | ✅ verified (both lines tick in lockstep) | — |

The 32KB arena is firmware-fixed and screen-independent: audit floor
83% on gabbro, 84% on emery; the 40-record ramp stays flat on both.
(A `port` example — the immediate-mode escape hatch — also exists but is
not part of the standard set.)

Sources live in `src/tsx/examples/`; `src/tsx/main.tsx` is generated by
build.mts (gitignored). Screen adaptation is Piu's job, not ours: we
never read or hardcode the width/height. Static pixel coordinates (as in
the `port` example) would NOT adapt — that is the cost of leaving Piu's
layout engine.

## What a component looks like

```tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Show, For } from "runtime/flow";

const [count, setCount] = useState(0);
const [todos, setTodos] = useState([1, 2]);

render(() => (
  <Container left={0} right={0} top={0} bottom={0} focus={true}
    onPressSelect={() => setCount(c => c + 1)}>
    <Column>
      <Label string={() => "c" + count()} />           {/* live binding */}
      <Show keepAlive={true} when={() => count() % 2 === 1}
        width={120} height={30}
        fallback={() => <Label string="even" />}>   {/* sides auto-wrapped */}
        {() => <Label string="odd!" />}
      </Show>
      <For each={() => todos()} key={id => id} width={120}>
        {id => <Label string={"t" + id} />}            {/* per-row component */}
      </For>
    </Column>
  </Container>
), { skin: new Skin({ fill: "black" }), style: new Style({ font: "24px Gothic", color: "white" }) });
```

The example above puts state at **module scope** — that works because
components run ONCE, so root-level and in-component state behave identically.
You can also factor UI into components; state lives in whichever component
owns it and passes down as props (a getter thunk + setter). Arrow
(`const C = () => …`) and named (`function C() {…}`) components are equivalent
in an app file — purely stylistic (in a *preloaded* `runtime/*` module,
top-level `function` is banned, gotcha 13, so `const C = () =>` there). See
`examples/component.tsx` for both forms.

### Root component entry — skip render() entirely (typesafe)

Instead of hand-writing `render(() => <App/>, { skin, style })`, an app can
`export default` a root component and the build generates the render() shim
(device-verified, `examples/rootapp.tsx`; the `sprafce` editor snippet in
`.vscode/signal-piu.code-snippets` scaffolds it):

```tsx
import type { AppDict, Component } from "runtime/jsx-runtime";

export const app: AppDict = { skin: bg, style: st };  // optional Application dict

const App: Component = () => (
  <Container left={0} right={0} top={0} bottom={0} focus={true}>…</Container>
);
export default App;
```

`Component<P>` types component props generically (React-FC-style, without
the re-render model); the prop-less `Component` default is exactly the shape
the shim mounts. An optional `export const opts` (RenderOptions) covers the
error-boundary opt-out. The types erase at compile time and the shim is two
lines — a rootapp build ships the same symbol count as its hand-rendered
twin (124, measured). An app that calls `render()` itself is left untouched
(no shim), so both styles coexist.

## Solid-flavored, NOT a React drop-in

> Wondering *why not just use React / a VDOM / Solid directly*, and how we got
> here? The full evaluation — every approach we weighed and why the 32KB heap
> forced each decision — is in [`docs/design-journey.md`](docs/design-journey.md).

This is fine-grained reactivity in the **Solid** model, not React. `useState`
returns `[getter, setter]` (Solid semantics), components don't re-render, and
reactive values are thunks — so React code does not port unchanged. Three
concrete differences:

1. **Components run once.** There is no re-render. A component function
   executes a single time to build real Piu nodes; updates flow through
   signals into individual property writes.
2. **Read state by calling the getter**: `count()`, not `count`. `useState`
   returns `[getter, setter]`.
3. **Reactive values are thunks — but the build auto-wraps them.** A binding is
   `string={() => "c" + count()}`. As of JSX auto-thunk, you can also write it
   BARE — `string={"c" + count()}` — and `lower.mts` wraps the reactive read
   into a thunk at compile time (Solid-compiler style). The reactivity signal is
   the CALL (`count()`) or `sig.value`; a truly static value (no reactive read)
   stays static. Bare `{count}` (no call) is deliberately NOT reactive.

Full hook/primitive parity table (what we have, what we skip, and why) is in
[`docs/api-parity.md`](docs/api-parity.md); the generated API reference
(`pnpm run docs`) is in [`docs/api/`](docs/api/).

### What's NOT supported (know the edges up front)

| Not here | Why / what to do instead |
|---|---|
| React re-render model | Components run **once**. State updates flow through bindings, not re-invocation. `useState` returns `[getter, setter]` — read with `count()`. |
| `createResource` (async data) | SHIPPED — `createResource(fetcher)` → reactive `{loading, error, data, refetch}` thunks (two Signal objects total; stale responses dropped). On-device, `fetch()` proxies through the phone (gotcha 18) — keep fetch-using apps lean. |
| `Suspense` | No async render. |
| `ErrorBoundary` | SHIPPED — TWO layers (2026-07). **Default top-level:** `render()` installs a boundary automatically — an escaped binding/build error tears the tree down and paints a crash screen with the actual error (stack compacted to `" ~ "`) and `[select: retry · back: exit]`; SELECT re-runs the build under a fresh root (Solid's `reset`), BACK rethrows so the host exits loudly. `render(build, dict, {boundary: false})` = log-then-propagate; a `globalThis.__spError` handler overrides everything. Full loop drive-verified on gabbro (`screenshots/crash-boundary-gabbro.png` → `crash-retry-gabbro.png` → `crash-exit-gabbro.png`). **Opt-in per-subtree:** `<ErrorBoundary fallback={(err, reset) => …}>{() => <App/>}</ErrorBoundary>` (from `runtime/jsx-runtime` — moved out of flow so a lean app pays no extra module record) — Solid's component, catches BUILD-time and reactive-update throws in its subtree, keeps the rest of the app alive, `reset` re-runs the children; inner boundaries catch before the crash screen; a fallback that throws escalates to the enclosing boundary. Like Solid, neither catches event-handler throws. Zero cost when unused (export-pruned + DCE'd, with the dead-import prune closing the loop). LIVE on gabbro: catch with the sibling still updating → fallback holds until reset → select remounts the healed subtree (`screenshots/eb-live-gabbro.png` → `eb-caught-gabbro.png` → `eb-reset-gabbro.png`). Example: `src/tsx/examples/boundary.tsx`. |
| `useCallback` / `useMemo`-for-identity | Pointless — components run once, so closures are already stable. `useMemo` exists only for *value* caching. |
| Glitch-free diamonds | SHIPPED (2026-07 core round) — computeds are LAZY (recompute on read, version-validated, pulling sources first) and every notify coalesces into turns, so a diamond sink runs ONCE, straight to the correct value (conformance law 12 = MATCH, verified on real XS). |
| Reactive position/size props | Piu lays out at construction time — `left/top/width/height` are static. A reactive one is rejected at bind time with guidance; use `<Show>` to swap. |
| Bare `{count}` reactivity | The reactivity signal is the **call** `{count()}` (or `sig.value`); a bare identifier can't be told apart from a static value. |

Conformance is CHECKED, not claimed: `tests/conformance.test.mts` runs 26
fine-grained-reactivity laws against the runtime (21 match Solid — including
the per-subtree `<ErrorBoundary>` — and 5 intentional divergences: run-once
components, per-effect error isolation, no memo equality-short-circuit, and the
default-boundary crash screen — see
[`docs/api-parity.md`](docs/api-parity.md)). Glitch-freedom and nested-effect
ownership flipped to MATCH in the 2026-07 core round.

## Architecture

```
src/tsx/*.tsx            app code (JSX) — transpiled by plain tsc
src/embeddedjs/
  manifest.json          Moddable mod manifest (maps modules, PRELOADS runtime)
  runtime/signals.ts     signals + ownership + hooks   (preloaded to flash)
  runtime/jsx-runtime.ts JSX factory -> real Piu nodes (preloaded to flash)
  runtime/flow.ts        Show / For control flow       (preloaded to flash)
  runtime-build/*.js     tsc-emitted runtime (gitignored) -> minified -> shipped
  app/*.js               generated from src/tsx (gitignored)
types/moddable/          vendored Moddable/Piu .d.ts (tools/sync-moddable-typings.sh)
tools/*.mts              build steps (manifest/treeshake/fontcheck) + lowering
src/c/mdbl.c             machine creation + instrumentation flag
build.mts                 tsc (app + runtime) + pebble build
```

The runtime is **strict TypeScript** (`signals.ts` / `jsx-runtime.ts` /
`flow.ts`); `tsc` emits behavior-identical `.js` (types erase — every file's
minified output is byte/behavior-identical to its old hand-written form, and
`target: es2022` injects no helpers, so the gotcha-13 alias budget is unchanged).
`pnpm run typecheck` runs both the app prop-contracts and the strict runtime emit;
`pnpm test` compiles the runtime first, then runs the suites against the output.

- **`signals.ts`** — `signal/effect/computed/untrack` (auto-tracked,
  class-based so per-instance cost is fields only), `createRoot/onCleanup/
  track` ownership, and the `useState/useEffect/useMemo` hooks layer.
  Three logical units share one file deliberately: each XS module costs
  arena RAM, and two extra module records were the difference between the
  combined demo booting or dying (the ≤5-module budget holds at 3).
- **`jsx-runtime.ts`** — `jsx/jsxs/Fragment` + `render`. Host elements are
  recognized by identity against a lazily-built `Set` of the compartment's
  Piu globals (Hardened JS makes `instanceof` unreliable; laziness is
  required because preloaded module bodies run at build time, before Piu
  globals exist). Static props go into the construction dictionary; function
  props become tracked effects through a `setProp` switch (`string` is
  battle-tested; `state`/`variant`/`skin`/`style`/`active` pass through;
  `visible` is deliberately REJECTED — see gotcha 4); `onTap` maps to
  `active:true` + a shared `HandlerBehavior` whose `onTouchEnded` calls the
  handler with `(content, x, y)`; `onPressSelect/Up/Down/Back` (+`onRelease*`)
  map to Piu button-behavior methods (pair with the `focus` prop — the
  Application self-focuses, so an unfocused container never hears buttons;
  `focus` only takes effect in the initial render() tree, see gotcha 11).
  Coordinates are static-only in v1. `effect()` returns the Effect object
  itself (dispose with `dispose(e)`), not a disposer closure — one closure
  per effect was measurable arena money.
- **`flow.ts`** — `Show` and keyed `For`. Both host a `Column` sized by
  caller props. `For` reconciles with **minimal Piu ops** (remove departed,
  cursor-walk and insert/move only misplaced nodes); each row lives in its
  own root and is disposed on removal. `Show` has two modes: the default
  rebuilds the active side per toggle (Solid semantics, heap returns to the
  floor — verified), and `keepAlive` builds both sides once and swaps them
  by reference via the atomic `replace()` with **zero per-toggle
  allocation** (both stay live; a missing side becomes an empty placeholder
  so every transition still uses replace(); the right default on this
  platform). Both modes wrap each side in a host-sized Container
  automatically — users cannot hit the bare-Label port crash (gotcha 3).

- **`VirtualList`** (in `flow.ts`) — our **FlatList**: a virtualized
  ("windowed") list. It creates a FIXED set of `rows` Labels ONCE and
  rewrites their `.string` as the window moves — **cell recycling**, the
  same core trick as React Native's FlashList/RecyclerListView: nodes are
  never created or destroyed on scroll, so RAM is **O(rows), not
  O(records)**. Any `{ count(), get(i) }` source works — pair it with the
  byte-record store and the item DATA lives outside the arena (bytes)
  while only `rows` Piu nodes exist. Props: `data`, `rows`, `at` (thunk ->
  window start index; read a signal to scroll), `format(value, index)`.
  Overscan is deliberately omitted — this port redraws text instantly with
  no pixel/momentum scroll, so pre-mounting off-screen rows buys nothing.
  We went further than RN's data virtualization (RN keeps every item as a
  JS object; we keep records as bytes). For RICHER rows than a plain
  string, pass `renderRow(indexThunk, data)` instead of `format` — it
  builds a recycled subtree once per slot (a Row of Labels, an icon skin).
  But each extra node per row costs arena, and the measured ceiling is
  brutal: a 2-column rich row (Row + 2 Labels) at **3 rows crashes at
  boot, 2 rows boots but crashes on SCROLL (97% + transients), 1 row
  boots AND scrolls** (the `richlist` example). So on this 32KB firmware
  you get rich rows OR many rows, not both — plain text for scrollable
  multi-row lists (`scroll`), `renderRow` for a small/single rich row.
  Another entry for the upstream issue: a bigger arena unlocks rich
  scrollable lists. See the `scroll` example: 8+
  records, a 3-row window, up/down scroll — the window slides while memory
  stays O(3). NB the demo drops a reactive header on purpose: a 4th bound
  label pushed boot to 97% and scroll transients then crashed it (gotcha
  16 — per-row effects are the arena cost); three bound rows sit at ~85%.

- **`Move`** (in `flow.ts`) — **reactive position**. Coordinate props are
  construction-time statics on this port (bind-time coordinate writes are
  rejected — gotcha), but `content.moveBy(dx,dy)` on a MOUNTED node is
  device-proven safe. `<Move x={thunk} y={thunk}>` wraps its children in a
  host at the base position and one effect applies the DELTA between the
  last applied offset and the new one via `moveBy`. Offsets are rounded to
  whole pixels before diffing, so a float source — an `animate()` tween —
  never accumulates sub-pixel drift. Children build once; only position
  changes. Offsets are RELATIVE to the base coordinates (0 = at rest).
  Device-verified (`movebox`): UP/DOWN step a signal ±20px, SELECT eases
  the box 60px down via `animate()` (receipts
  `screenshots/movebox-steps-gabbro.png`, `movebox-tween-gabbro.png`).

JSX wiring: the Moddable/Alloy build only recognizes `.ts` sources, so the
SDK's own TypeScript integration can't transform `.tsx`. `build.mts` runs
plain `tsc` (`jsx: react-jsx`, `jsxImportSource: "runtime"`, `noCheck`)
into `src/embeddedjs/app/` before `pebble build`. This is the documented
fallback; the `jsxImportSource` route through the SDK doesn't fire.

## Measured memory reality (SDK 4.17)

**The JS arena is 32KB, firmware-fixed, and it is the scarce resource.**

- Every Alloy mod gets an XS machine cloned from the firmware's creation
  config: 32KB static arena → chunk heap 8192B initial, slot heap ~8KB
  growing on demand into the arena (observed growing 8176 → 18416B before
  exhaustion), 6144B stack. Chunk space is whatever the slot heap hasn't
  claimed — long strings and concat garbage compete with your object graph.
- `ModdableCreationRecord` cannot change this **on this emulator** (MEASURED):
  the firmware rejects the record unless `stack`/`slot`/`chunk` are all
  nonzero, then ignores the size fields (16K/16K and 32K/32K → byte-identical
  instrumentation; even the official `words` example's 31744-slot request gets
  the default machine). Only `.flags` takes effect. Nuance (source, untested
  live): `coredevices/PebbleOS`'s `moddable.c` (the codebase for the *new*
  watches) HONORS the record and can `staticSize=0`-malloc a machine bigger
  than 32KB — but that is a DIFFERENT firmware lineage than the classic emery/
  gabbro our QEMU runs (a "patched 4.3 SDK core" per pebble-tool), and no newer
  QEMU-bootable classic image was obtainable to test it. So on our emulator the
  32KB wall is the operative reality; whether current/new-watch firmware lifts
  it live is untested. See docs/field-notes Round 10 for the full (partly
  unresolved) version story.
- **Watch the STACK, not just the heap — it is a third, separate boot-death
  budget.** That `6144B stack` is `384 slots` (16B each) of XS *call frames*,
  and a render that recurses too DEEP aborts with `fxAbort JavaScript stack
  overflow` (≠ `memory full`), silently, at boot. Measured: a `Navigator` over
  a reactive screen peaks at **383/384 slots (99.7%)** at its initial render
  (fixed by shaving two frames off the deep path). Keep the initial render
  tree shallow; every wrapper fn in the render path is a permanent per-screen
  depth tax. Gauge it live via `instruments:` fields 12/13 (`Stack used` /
  `available`). Full write-up: `docs/postmortem-navreactive-stack.md`.
- **Piu nodes are comparatively cheap for the arena** (their weight lands in
  the 122KB native app heap); closures, signals, effects, behavior handlers
  and module records are what exhaust the 32KB. Budget accordingly.
- **Live audit** (`pnpm run test:mem`, M9 demo on gabbro): under button load
  the pre-GC peak hits 24520B = 92% of the 26.6KB heap budget, post-GC
  floor **21840B = 82%**, ~2.7KB transient reclaimed per GC. The test
  fails the build if the post-GC floor crosses 90%. (The M7 combined demo
  — Show + arena-resident For rows — ran at 88% floor / 97% peak.)
- Baselines (slot used, post-GC): empty Piu app ~7.0KB · M3 reactive label
  ~10.9KB · M5 Show demo ~15.3KB · combined M7 demo sits within ~a few
  hundred bytes of the ceiling and only fits with the runtime preloaded.
- Update costs: a ticking reactive label allocates ~464B slots + ~116B chunk
  of transient garbage per update, GC every ~6 ticks, post-GC floor flat
  (90s run). 20 Show toggle cycles: floor oscillates 14.1–16.2KB with no
  upward trend (disposal verified).
- `For` stress (1 row/s ramp): **"fxAbort memory full" at ~10–12 bare-Label
  rows** (~450B slots per row) or ~6–8 skinned Container+Label rows, from a
  baseline app. That is the realistic list ceiling on this firmware.
- **Limit finder** (`pnpm run test:limit` = `memtest.py --ramp`): one record
  added per button press until the machine dies, memory logged per item.
  History of the same test across designs tells the whole story:
  - M7 arena-resident `For` rows (~450B slots/row): died adding row 4
    (v1.0 runtime) → row 5 after the v1.1 slimming (inline signal
    subscribers, flash-preloaded behavior class, stamp reconcile).
  - M9 byte-pool + window (rows cost pool BYTES, not slots): **40 records
    and flat** — usage oscillates 81-93% with GC, no trend, no death; the
    512B pool holds ~85 records before `push` politely refuses.
  `--min 20` keeps it as a regression gate; rerun after any runtime change
  and the curve shows exactly what the change cost.
- **Preload the runtime.** `"preload"` in the mod manifest moves module
  bodies to flash; before preloading, hooks + Show + For could not coexist
  at all. Preloaded modules must not touch Piu globals at module scope
  (they don't exist at build time) — access them lazily. Writable module
  state still works via XS aliasing.

## Hybrid-compile assessment (measured, not enabled)

Could a Solid-style compiler (JSX -> direct Piu calls + binding
registrations at build time, shipping only the signal core) beat the
runtime interpreter on archive size? Measured with synthetic apps (cells
of Row + reactively-bound Label + static Content) at N=4 and N=16:

|                      | per element | fixed base (N=0) |
|----------------------|-------------|-------------------|
| interpreted (this runtime) | 203B  | ~12.0KB           |
| hybrid compiled (signals-only) | 228B | ~5.0KB        |

- Compiled output IS ~12% more expensive per element (explicit
  construction statements vs one generic jsx() call) — but the ~7KB
  fixed win (jsx-runtime + flow leave the archive) dominates: crossover
  at N≈280 elements, ~6x beyond what the 32KB arena can hold anyway.
- Practical ceilings under the boot-floor budget (gotcha 15 correction): interpreted ~19
  bound elements, hybrid ~47.
- "All component types included" is NOT a hybrid worst case: Piu classes
  are host globals (zero archive cost); the interpreter carries its
  dispatch/registry in the fixed cost regardless of use.
- Hybrid's real worst case is many Show/For SITES — inline-emitted
  control flow repeats per site while the runtime version amortizes.
- Conclusion: worth building only when apps outgrow the current budget;
  not enabled — kept here as the measured escalation path.

## Rendering tiers: Piu retained vs Port immediate (measured)

The host exposes more than retained Piu: `Port` (Piu's immediate-mode
canvas) and even the raw `screen`/Poco layer. The same M9 demo was
rebuilt with its header + 3 window rows drawn by ONE `Port` behavior
(`port.drawString` in `onDraw`, one `useEffect` calling
`port.invalidate()` on change) — pixel-identical output, verified on
gabbro with the same 40-record ramp. See `examples/main-port.tsx`.

|                    | retained Labels (shipping) | one Port (immediate) |
|--------------------|---------------------------|----------------------|
| archive            | 12,714B                   | 12,725B (+11B)       |
| arena at 1 record  | 24,008B = 90%             | **21,548B = 81%**    |
| per-press growth   | GC sawtooth, flat         | flat                 |

- **Port wins ~2.5KB of arena** by replacing per-visible-row Piu wrappers
  and binding effects with draw calls — the win scales with visible-row
  count, so it is THE escape hatch for dense text screens.
- Costs: manual coordinates (no Piu layout), coarse invalidation (whole
  Port redraws), and it bypasses the runtime's binding path — buttons,
  behaviors and signals still work unchanged.
- Raw `screen`/Poco is also reachable but abandons Piu input/lifecycle
  for little gain over Port; native C UI driven from JS is blocked by
  the FFI arena reconfiguration (gotcha 17).

## Multi-screen experiment (M11): the arena, not the archive, caps screens

Can one mod hold several of react-pebble's example UIs (list, clock,
counter, toggle) switched at runtime? Archive-wise YES — all four screens
compiled to 13.2KB, under the ceiling. RAM-wise NO for the naive shape:
four PREBUILT reactive screens push the boot floor past the 32KB arena
and the app dies at startup with the silent OOM signature (bisected:
+3 useState alone moved a booting build from 91% to dead). Even two
prebuilt screens with a replace()-switcher died. Working patterns:
build screens lazily (dispose + rebuild on switch — but see gotcha 16
about bindings outside the initial tree), keep helper screens
IMPERATIVE (module-held Label refs, direct .string writes), or spend the
firmware-upstream effort. `examples/main-multiscreen.tsx` preserves the
experiment's final bisect state — it does NOT boot; it is the artifact,
not a working app. The only multi-screen shape expected to fit today is
Port-based screens (one Port, onDraw switching on the screen signal —
per-screen cost ~0, see the rendering-tiers section), which has not been
built yet. Startup arena OOM is SILENT (the log channel
is not up yet), which is why it masquerades as the other silent kills.

## Preloading app logic (measured: works, rarely worth it here)

Moddable's deferred-main pattern was tested end-to-end: a PRELOADED
`app/logic` module whose function objects live in flash, with runtime
state created by an `init()` into aliased module `let`s (objects created
at preload freeze into ROM and become unwritable — state must be born at
runtime). It boots and runs the full 40-record ramp, which also proves a
refinement of gotcha 11: a non-preloaded module calling a preloaded
module's function that writes the CALLEE's aliased state is fine (the
fatal case was preloaded->preloaded). For this demo the trade measured
-52B RAM for +175B archive — reverted; the pattern earns its keep only
when an app carries a LOT of logic code.

## Bitmaps / images (color, animated) — measured

Real bundled bitmaps work, in color, and animate. Pipeline:
1. Put PNGs in `assets/` and list them in the mod manifest:
   `"resources": { "*": ["../../assets/ball0", "../../assets/ball1"] }`.
   The build's `png2bmp` converts each to `<name>-color.bm4` +
   `<name>-alpha.bm4` and bundles them.
2. Load with **`new Texture("ball0.png")`** — the `.png` suffix is
   REQUIRED (the Pebble Texture constructor only looks up the `.bm4`
   files when the path ends in `.png`; `new Texture("ball0")` throws
   `Texture ball0 not found!` — measured). Then a texture `Skin`
   (`{ texture, x, y, width, height }`) on a `Content`.
3. ANIMATE, two ways — both reactive props, no per-frame allocation:
   - **skin-swap** (`imgwatch`): keep one texture per frame and swap the
     Content's `skin` on a timer — `<Content skin={() => frame()%2 ?
     skinB : skinA} />` flips red ball ↔ blue ball at 450ms.
   - **sprite-sheet + `variant`** (`sloth`): ONE wide texture holding N
     frames side by side; a texture `Skin` with `variants: <frameWidth>`
     slices it, and the reactive `variant` prop picks the slice —
     `<Content skin={sheet} variant={() => BLINK[step()]} />`. One decode,
     no skin churn. The `sloth` watchface is a 2-frame (eyes open / closed)
     140px blink sheet over a live one-line HH:MM:SS clock, verified
     animating on **both** Round 2 and Time 2 in color.
   Piu also has a native multi-frame `Image` class (`duration` + start())
   for GIF-style animation.
SCALING a raster is not free: Poco blits a `Texture` 1:1 (no runtime
scale), so a bigger sloth means a bigger sheet and MORE decoded pixels in
the native app heap. Measured ceiling here: 140px frames (2 of them, the
`sloth` size) boot comfortably; much past that the decode risks native
OOM. For a truly resolution-INDEPENDENT icon that scales for free, the
Pebble Piu port also ships **`SVGImage`** — Pebble Draw Commands (PDC/PDCS
vector), with runtime `scale()`/`rotate()`/`opacity()` and no per-scale
pixel cost. Trade-off: PDC is flat vector shapes (no soft gradient
shading), so it suits crisp icons more than a soft-shaded emoji. (Vector
sloth tracked as future work.)
Costs: bitmap PIXELS live in the native app heap (not the 32KB arena),
but the `.bm4` bytes bundle into the mod ARCHIVE — two 64×64 balls took
mc.xsa 14,140 → 24,656B; the 312×104 sloth sheet is 59,420B of the 256KB
resource area. `build.mts` DERIVES the `resources` list from the app's own
`new Texture("x.png")` references (each mapped to `assets/x`), so every
app bundles exactly the bitmaps it names and image-free apps stay small;
the manifest is generated from `manifest.base.json` (gitignored, like
main.tsx). Resources bundle into the archive but do NOT count against
the boot slot floor (imgwatch's 24.6KB archive boots fine —
resources aren't preloaded/executed and add no symbols; gotcha 15
correction).

## Vector images (SVGImage / PDC) — SOLVED, measured

The Pebble Piu port ships a native **`SVGImage`** class backed by **PDC**
(Pebble Draw Commands — a compact vector format; PDCS is the animated
sequence variant). Vector is the proper way to make an icon *bigger* without
the raster native-heap cost: `scale()`/`rotate()`/`translate()` are runtime
transforms on the draw-command coordinates, no per-scale pixels. The
`slothvec` watchface proves it end to end: a **701-byte** PDC authored at
60×60 renders at **2× (120px)** on both gabbro and emery — vs the raster
sloth's 68KB sheet + native-heap decode (~97× less flash, zero pixel RAM).

Pipeline: `tools/gen_pdc.py` emits PDCI bytes directly (output verified
BYTE-IDENTICAL to the official `svg2pdc.py`, ported to py3 and diffed);
`tools/gen_sloth_pdc.py` composes the sloth from flat polygon paths;
`build.mts` bundles any referenced `*.pdc` as a Moddable **`data`** resource
(read on-watch via `new Resource("x.pdc")` — the `SVGImage` `path` route).
The official `svg2pdc.py` (pebble-examples/cards-example) or Rust `pdc_tool`
(HBehrens) work for converting real SVGs.

**The four hard-won rules** (each cost a debugging round; the "invisible
circle" saga is why they're numbered):
1. **Transforms only work AFTER `render()`.** `PiuSVGImageBind` overwrites
   `cx/cy` to `bounds/2` at mount, silently clobbering anything set earlier —
   the docs' examples all transform inside behavior callbacks for this
   reason. Set `center`/`scale` after the tree is mounted.
2. **`center(0,0)` is mandatory for whole-pixel art.** `doTransform`
   subtracts `cx*8` from every point (the port's transform math is in
   1/8-pixel "precise" units), so the default centre displaces a whole-pixel
   command by `-7×cx` pixels — clean off screen. (Precise-path PDCs,
   `svg2pdc -p`, are what the default math is calibrated for.)
3. **An image with NO transform never draws at all.** `DrawAux` renders a
   command list built lazily inside the `if (transforming)` branch, so at
   least one `scale(1,1)` is required even at native size.
4. **`scale()` does not scale circle radii** — only path points and stroke
   widths. Scalable art must be all paths/polygons (ellipses as N-gons);
   a scaled circle keeps its radius and only its centre moves (measured).

Also: give the `SVGImage` dictionary the SCALED `width`/`height` (the content
box otherwise stays at the PDC's authored bounds and the scaled drawing
spills outside it), and `Resource` names keep their `.pdc` extension.

**Vector ANIMATION, two layers, both measured** on `slothvec`:
- **Transforms** — the sloth swings by `rotate()`ing around the branch pivot
  on a timer: no frames, no pixels, the same command list re-rendered.
  Pivoting needs PRECISE paths (type 3, 1/8-px units —
  `gen_pdc.path(..., precise=True)`): the port's transform math (`cx*8`,
  `tx*8`) is calibrated for that unit, so whole-pixel art can only use
  `center(0,0)`. With precise art the recipe is `center(px,py);
  translate(px,py); scale(s,s)` (screen = content + cx + s·(x−cx) + tx),
  then `rotate(a)` swings around the pivot.
- **PDCS frame sequences** — the sloth BLINKS via a 4-frame PDCS
  (open/half/closed/half; per-frame durations baked into the file,
  `gen_pdc.sequence()`). `PiuSVGImageSync` selects the frame from CONTENT
  TIME (`frame_by_elapsed`). The official pattern (behavior `onDisplaying:
  start()`, `onFinished: rewind`) works but paces badly here — the port's
  Bind sums frame 0's duration for EVERY frame (inflating the cycle) and
  elapsed past the real total sticks on the LAST frame. Driving `svg.time`
  manually from a timer (`svg.time = t % cycle`) gives exact pacing and
  sidesteps both quirks. Blink + swing compose: each rotate() re-clones
  from the CURRENT frame.

## Memory playbook

`docs/xs-heap-playbook.md` is the standing inventory of everything that
lives in the 32KB XS heap, what each thing costs, and the measured tricks
for pushing data down the memory ladder (chunk bytes → native heap → flash
resources → the phone). It includes the MEASURED packed-core experiment
(task #15): bitmask/SoA reactive graph = ~2× cheaper per binding
(273 → 144 B/pair, capacity 20 → 32+ pairs; benches `slotbench` /
`slotbenchp`).

[`docs/memory-map.md`](docs/memory-map.md) is the companion map: every
memory space on the watch+phone (arena, mod archive, resources, native
heap, worker pool, persist KV, PKJS), which signal-piu feature uses which,
and a decision table for where a given kind of data belongs.

[`docs/field-notes.md`](docs/field-notes.md) is the lab notebook — *how*
each memory finding was made: the exact firmware/SDK source files we read,
the measurement tools we built, the wrong turns we kept on purpose, the
flag-gated (DX-neutral) optimization model, and a cross-check of our
numbers against Moddable's official `mods.md`. Start here for the "why".

[`docs/perf-battery.md`](docs/perf-battery.md) is the performance & battery
story: what drains a Pebble, the runtime's battery posture (no standing
timers, equal-skip, coalesced turns), the measured allocation-flat receipt
(55 s at 25 writes/s → GC and heap byte-flat), and app-side rules ranked by
impact. [`docs/postmortem-navreactive-stack.md`](docs/postmortem-navreactive-stack.md)
is the JS-value-stack post-mortem (the third fixed budget: 384 slots).

## XS / Piu gotchas actually hit

1. **Every fatal error looks identical**: `fxAbort` (memory full, unhandled
   exception) reboots the whole firmware to "Install an app to continue",
   and the reboot also kills pypkjs's serial session, so `pebble logs`
   dies with it. Attach logs *before* install (the instrumentation flag is
   only honored if a log listener is connected when the machine starts) and
   screendump via the QEMU monitor (`screendump` over the monitor TCP port)
   — it keeps working when everything else is down.
2. **The QEMU gabbro/emery touch peripheral crashes the firmware on any
   real-coordinate touch** — even in a static app with no active contents.
   Degenerate (0,0) touches work, which is what our M4/M5 touch milestones
   exercised (the full Behavior/onTouchEnded machinery is fine). Drive
   emulator UIs with buttons (`pebble emu-button`); `onTap` is for hardware.
3. **Piu-Pebble port: swapping a bare `Label` as a container host's direct
   child crashes the firmware** — rebuilt-fresh on the first swap, or
   re-bound prebuilt on the second. **Container-wrapped subtrees swap and
   re-bind indefinitely.** signal-piu's `Show` wraps both sides
   automatically, so app code never sees this.
4. **Setting `visible` on bound content crashes the port** (first write).
   signal-piu's `Show keepAlive` therefore swaps by add/remove-by-reference
   instead of visibility.
5. `pebble install` intermittently stops auto-launching the app — looks
   exactly like an instant crash. Check the launcher menu before debugging.
6. The Application **self-focuses at creation**; button events bubble from
   the focus. Use the `focus` prop (applied post-mount — `focus()` on an
   unbound node is a no-op) or handlers never fire.
7. Fonts are the system set only, resolved as `"<size>px <Family>"`
   against the firmware's fixed table. Families (from the firmware
   source): Gothic-Regular 9/14/18/24/28/36, Gothic-Bold 14/18/24/28/36,
   Bitham-Black 30, Bitham-Bold 42, Bitham-Light 18/34/42, Bitham-Medium
   34/42 (numbers-only subsets exist), Roboto-Condensed 21, Roboto-Bold
   49, DroidSerif-Bold 28, Leco-Bold 20/26/32/36/38, Leco-Regular 42.
   The working syntax is CSS-like: `"[weight] <size>px <ShortFamily>"` —
   `"24px Gothic"`, `"bold 42px Bitham"` (device-proven in the clock
   example). Writing the table's family name directly (`"42px
   Bitham-Bold"`) THROWS inside render and leaves a black Application
   with no content — a blank-but-black screen usually means a font
   error.
8. `console.log` from the mod does not reach `pebble logs` on release
   builds; only XS instrumentation traces do. Render test verdicts on
   screen (our M1 suite does exactly that).
9. The strip list is real: no `Proxy/Reflect/WeakMap/WeakSet/Atomics/
   BigInt/eval/Function/Generator` anywhere, including dependencies — which
   is why the reactive core is hand-rolled closures, plain arrays and `Map`.
10. **Preloaded classes must initialize every field in the constructor.**
   Adding/reading a field that the constructor never set (our `Effect.cleanup`
   before the fix) kills the app at startup — silently, no fxAbort log, no
   reboot; the app just exits to the launcher. Found by on-device bisection.
11. **A preloaded module must not call another preloaded module's function
   when that function writes the callee module's aliased state.** flow.js
   importing jsx-runtime's `consumePendingFocus` (which writes jsx-runtime's
   module-level `pendingFocus`) killed the firmware at startup; importing
   `appendChild` (which touches no module state) is fine. Consequence: the
   `focus` prop only works in the initial render() tree.
12. The pebble tool's channel (install auto-launch, `emu-button`,
   `pebble logs`) silently degrades after any firmware reboot and DROPS
   button presses — a lost launch keypress looks exactly like a startup
   crash. `tools/drive.py` opens one direct QemuTransport connection for
   buttons + logs + qemu-monitor screendumps and is immune; use it for all
   emulator verification (kill pypkjs first — as `pkill -9 -f '[p]ypkjs'`,
   the [p] stops -f matching the invoking shell itself). After an fxAbort
   storm the emulator's persistent flash can corrupt and every install
   fails; delete `~/.local/share/pebble-sdk/4.17/<platform>/qemu_spi_flash.bin`
   to factory-reset it.
13. **The machine's alias budget is nearly exhausted — do not add top-level
   `function`/`class` declarations (writable bindings) to preloaded
   modules.** Adding two never-called `export function`s to signals.js
   killed the app at startup (same silent signature as gotcha 10); the SAME
   code as `export const` arrow functions boots fine, and a 15859B archive
   boots while a 15777B one dies — so it is the count of aliasable
   bindings, not bytes. Each preloaded writable binding costs an XS alias
   slot from a firmware-fixed budget with almost zero headroom (the
   `ModdableCreationRecord` has no alias field to raise it). This likely
   also explains gotcha 11 — exporting `consumePendingFocus` added an
   alias — but that retest hasn't been done. Also measured: two extra
   const-arrow exports still cost ~290B of runtime slot RAM, so exports
   must EARN their keep.
14. **Piu accepts a plain object as `behavior`** — no `Behavior` subclass
   needed (verified on-device: all button/tap dispatch works). That lets
   the shared handler class live at module scope and preload to flash
   instead of being rebuilt (prototype + 9 methods) inside the arena.
15. **The mod archive has a hard size ceiling around ~15.9KB.** Measured:
   `mc.xsa` at 15669/15776/15806/15839/15859B boots; 15948/16269/16388B
   dies at startup with the same silent signature as the alias kills —
   including KNOWN-GOOD code padded with an inert string constant, so it
   is purely the archive size. Check `ls build/mods/gabbro/mc.xsa` after
   every feature; this budget, not the 32KB arena, is what forced the M9
   demo to drop the M7 Show block.
   Archive anatomy (measured by differential builds): moddable base
   ~0.2KB · runtime (signals+jsx+flow, preloaded) ~10.9KB · M9 demo
   ~2.0KB — and **the `manifest_typings.json` include was embedding
   2,734B of pure build-time junk** (tsconfig doc strings, module maps)
   into the archive. Dropping that include (it only feeds editor
   typings; `pnpm test` and the on-device suite are unaffected) took the
   demo from 15,806B to 13,081B — ~2.8KB of headroom below the cliff.
   Minifying the runtime (build.mts runs esbuild into
   `src/embeddedjs/runtime-min/`, which is what the manifest ships) buys
   another 367B → 12,714B. Note what does and doesn't help: comments and
   whitespace NEVER reach the archive (stripping them saved 40B, all
   from syntax tweaks) — the archive stores bytecode plus a symbol
   table, so the real savings come from mangling module-scope
   identifiers. Property and export names are part of the API and
   survive minification untouched.
   **CORRECTION (2026-07): "archive size" was a CORRELATE, not the
   mechanism — there is no single ~15.9KB ceiling.** The v1.5 boot-cost
   matrix (`tools/gen-boot-probe.mts`, one variable per probe, boundaries
   replicated) plus the firmware's own creation struct (read out of
   `gabbro_sdk_debug.elf`: chunk 8192 +1024 incr · heap 512 slots +64
   incr · stack 384 · keys 32 +32 incr) shows TWO independent budgets:
   (a) a **boot slot floor** — at a saturated app class ONE extra
   interned symbol (`"zk0" in bg` dies; the 1-byte control `"fill" in bg`
   boots), one extra top-level binding, or one extra archive module (any
   placement — `fxMapArchive` interns every archive symbol eagerly and
   each module costs records + 2 ids) is fatal, because the slot heap
   can no longer grow inside the fully-committed arena; and (b) a
   **chunk budget** — inert string/bytecode data is comparatively cheap
   (+1057B booted, +1536B died on the same skeleton). The old 15.9KB
   numbers were real deaths, but of mixed causes; a 24.6KB archive with
   resources boots fine, and richlist boots at 14,641B with 149 archive
   symbols while a 12,304B probe dies. Budget SYMBOLS and top-level
   bindings, not archive kilobytes: `python3 tools/xsa-symbols.py
   build/mods/gabbro/mc.xsa` prints the count; the deadly ones are the
   new-to-host names (export pruning cuts exactly those — the real
   reason the #29 fix worked).
16. **Reactive bindings inside `For` rows WORK — but they are expensive,
   and that expense was originally mis-diagnosed as a fatal rule.** The
   M11-era claim ("a binding inside a For row kills startup") was WRONG:
   re-tested with a clean minimal repro (`examples/forbind.tsx`), three
   `<For>` rows each with `string={() => ...}` boot AND update reactively
   on both the current and the pre-review runtime (screenshots
   `ex-forbind-*.png`). What the single-line delta really hit was arena
   pressure: each For row carries its OWN effect + createRoot owner, so
   the reactive rows ride high — measured 3 rows peak at **94%** of the
   heap budget at boot, and 5 rows crash the firmware ("Install an app to
   continue"). So: use reactive For rows for SMALL bounded lists; use the
   fixed-label windowed store pattern (M9) for large/unbounded lists,
   where per-row effects would tip the boot ceiling. The original gotcha
   was a member of the boot-OOM family (same as "+3 useState killed it"),
   not a distinct firmware rule.
17. **Enabling FFI reconfigures the machine to a memory layout the
   runtime cannot live in.** Passing a non-NULL `fxBuildFFI` makes
   `__moddable_createMachine` re-carve the arena as
   `chunk = (static − stack×16)/2 = 13312B` + a FIXED 832-slot heap
   (13312B) and call `modMachineAllowKernelHeap(0)` — read straight out
   of the 4.17 firmware disassembly. signal-piu needs ~17.5KB of slots,
   so the mod dies silently at load. Also: the FFI binding table caps at
   32 functions (`cmp #31` in `newHostFunction`), and every FFI function
   name becomes a fresh runtime symbol via `XS->id()`. FFI is therefore
   only usable by mods whose slot needs fit ~13KB — the M9 byte-pool
   store is the in-arena substitute (1 byte costs 1 byte in chunk).
18. **`fetch` works through a PHONE PROXY, not direct TCP — set up
   `@moddable/pebbleproxy` in `src/pkjs/index.js`.** (Correction of an
   earlier wrong note that claimed native TCP / "no emulator network".)
   The real mechanism, from the rePebble networking guide and the
   package README: the watch's `fetch()` proxies its request to PKJS
   running on the phone (`@moddable/pebbleproxy`), which performs the
   actual HTTP and relays the response back over AppMessage. PKJS is
   pypkjs in the QEMU emulator, so the package explicitly supports the
   emulator — network IS testable there in principle. Setup:
   `pebble package install @moddable/pebbleproxy`, then
   ```js
   var proxy = require("@moddable/pebbleproxy");
   Pebble.addEventListener("ready", proxy.readyReceived);
   Pebble.addEventListener("appmessage", proxy.appMessageReceived);
   ```
   and on the watch `await fetch(url)` after the proxy signals ready.
   The `fetchtest` example is wired this way. NOTE: this repo's mod XS
   runtime still has ZERO npm deps — pebbleproxy is PHONE-SIDE (pkjs)
   only. Two caveats measured here: (a) fetch from a normal app aborts
   with `fxAbort memory full` — its Response/Headers/URL/promise
   allocations don't fit alongside the runtime in 32KB, so a fetch-using
   mod must stay lean (bare app). (b) A live round-trip could NOT be
   completed in THIS sandbox: the local emulator/pypkjs stack is too
   unstable (pypkjs dies/duplicates on restart, the button+log channel
   is unreliable with pypkjs alive — gotcha 12) and host egress for
   pypkjs is unverified. The mechanism is correct and emulator-supported
   by design; confirming the byte-level round-trip wants a steadier
   emulator or real hardware.
19. **`Texture` names need the `.png` suffix** (`new Texture("sloth.png")`,
   not `"sloth"`) — the constructor only finds the `.bm4` pair when the
   path ends in `.png`; otherwise it throws `Texture … not found!`.
20. **Font strings must name a font that actually exists on the watch, at
   that exact size AND weight — an invalid one renders NOTHING (blank, no
   error).** `"bold 34px Bitham"` silently produces no glyphs: Bitham is
   only *bold* at 42px (`FONT_KEY_BITHAM_42_BOLD`); its 34px cuts are
   medium-numbers / light-subset. The failure is nasty because it does
   NOT abort — the app boots to a black screen with the sloth but no
   text, so a center-pixel "is it black? → booted" check is a false pass.
   Safe, verified strings: `"bold 42px Bitham"`, `"bold 28px Gothic"`,
   `"bold 24px Gothic"`, `"18px Gothic"`. The `sloth` watchface uses
   `"bold 28px Gothic"` for its one-line HH:MM:SS.
21. **On the arena-tight watchfaces, wrapping the time in a `Row` (to
   two-tone the seconds) tips the boot over the ceiling → `fxAbort`.**
   Same family as the M11/arena-pressure findings: the extra container +
   label + signal is enough. The fix that kept the design intent was to
   drop the `Row`, keep HH:MM:SS as ONE white `Label`, and spend the one
   restrained accent colour on the existing date line instead.

22. **Position/size props are STATIC — a reactive one is rejected at bind
   time, not silently ignored.** `<Container left={() => x()}>` throws
   `jsx: position/size prop \`left\` is static …` the moment it builds:
   Piu's retained layout fixes coordinates at construction, so unlike React
   (which re-renders the whole element) you can't animate `left/top/width`
   by writing the property. Reposition by SWAPPING the node via `<Show>`
   (dispose + rebuild at the new coordinates), or use a Piu move/Transition.
   Only `string/state/variant/skin/style/active` accept a reactive binding.
   (This is a Piu limitation, not a signals one — Solid can set `style.left`
   because the DOM allows it; Piu does not.)

23. **A `useState` getter/setter passed as a VALUE (`boot({ setName })`)
   used to MISCOMPILE** — the lowering removed the pair's binding while the
   shorthand reference survived, and the app died at first evaluation with
   `TypeError: call: not a function` (the pulse incident, 2026-07). Two
   guards now stand: the lowering sees shorthand/export escapes and BAILS
   the pair to the object API (all probed escape shapes, selftest-pinned),
   and lint-reads rule 5 fails the build with the fix in the message —
   wrap it: `boot({ setName: (v) => setName(v) })`, which also keeps the
   pair on the cheap packed API. (Exception by design: a getter as a JSX
   prop — `<Readout value={count} />` — IS the documented thunk contract
   and stays clean.) Symptom walkthrough: docs/debugging.md.

## vs react-pebble

|                       | react-pebble                          | signal-piu                                |
|-----------------------|---------------------------------------|-------------------------------------------|
| Reactivity resolved   | compile time (Node, perturbation diff) | **runtime** (signals on the watch)        |
| Runtime-dynamic trees | limited to precompiled variants        | native: `Show`, keyed `For`               |
| Per-update cost       | zero JS on watch                       | one effect run + one Piu property write   |
| Memory ceiling        | generous (static output)               | 32KB JS arena — small trees only          |
| Components            | React semantics                        | run-once, thunk props, getter reads       |
| Best for              | static-layout watchfaces               | data-driven apps within a small footprint |

Honest summary: compile-time resolution buys react-pebble immunity from the
32KB arena; runtime signals buy signal-piu live dynamic structure. On today's
firmware (fixed arena) both are legitimate points on the trade-off curve.

MEASURED head-to-head (see `../react-pebble-bench`, same emulator and
tooling): react-pebble watchface 3,206B archive / 41% arena floor;
counter 1,885B / 46% floor with 144B transient per 8 presses — genuinely
lighter, as expected with no runtime aboard. But its combined
clock+counter+toggle multiview was SILENTLY reduced to one screen by the
perturbation compiler and the generated app reboots the firmware at
launch. Neither framework ships a working multi-screen app on this
firmware: react-pebble loses the screens at compile time, signal-piu
hits boot-time arena OOM.

## Milestones & screenshots

| M  | Proof | Screenshot |
|----|-------|------------|
| M0 | scaffold + instrumentation + static Piu label | `m0-static-label.png` |
| M1 | signal core: 10/10 assertions on XS | `m1-signals-pass.png` |
| M2 | JSX → real Piu nodes, round-safe centering | `m2-static-jsx.png` |
| M3 | live binding, flat post-GC floor over 90s | `m3-reactive-ticks.png` |
| M4 | onTap → Behavior, count via injected touches | `m4-tap-counter.png` |
| M5 | Show swap + disposal flat over 20 cycles | `m5-show-on.png` / `m5-show-fallback.png` |
| M6 | keyed For add/reverse/remove + stress ceiling | `m6-for-*.png` / `m6-stress-ceiling.png` |
| M7 | combined demo, 24 interactions, no degradation | `m7-*.png` |
| M9 | byte-pool windowed list: 40 mixed records, flat arena | `m9-gabbro-window40.png` |

[react-pebble]: https://github.com/eddiemoore/react-pebble
