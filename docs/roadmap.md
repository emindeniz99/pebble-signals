# Roadmap — what's left

Shipped work lives in git history + the README/playbook. This tracks the OPEN
items. **Emulator status: HEALTHY** (recovered via `tools/reset-emulator.sh`;
counter device-verified 0→1). The old "needs a stable emulator" wall is down —
device work is unblocked again.

## Big in-flight tracks

- **Runtime → strict TypeScript — LARGELY DONE.** `signals/jsx-runtime/flow` are
  strict `.ts`; tsc emits the shipped `.js` (verified byte-identical, gotcha-13
  alias budget intact). Tests migrated to `.mts` on **node:test** (built-in
  runner + isolate-wide V8 coverage that SEES the vm sandbox — vitest-v8 reports
  0% for vm code, so node:test won over vitest; c8 dropped). Tools are `.mts`
  (manifest gen / fontcheck / treeshake / lower / classify), strict-typechecked
  via `tsconfig.tools.json`. Toolchain on TS 6 + target/lib es2025. `build.sh` is
  now `build.mts` (C14 done — verified byte-identical artifacts + successful
  `pebble build`). REMAINING: auto-generate the `globals.d.ts` runtime-API half
  (`tsc --declaration`) instead of hand-maintaining it (B6).
- **Core-reactivity round (DECIDED 2026-07 — do it): glitch-free + running-owner
  together.** Two core changes the owner wants shipped as ONE careful pass —
  full test + byte-emit measurement + on-device verify (emulator is healthy) —
  because both touch the reactive hot path and pairing them means one
  device-verification cycle, not two.
  - **Glitch-free reactivity (YES).** A library claiming Solid parity needs
    glitch-freedom as a real correctness guarantee, not a documented DIVERGE.
    Today push notify re-runs a diamond sink twice through a transient glitch
    (conformance law 12 = DIVERGE). Scope is limited to computed + notify; the
    prototype (`tools/glitch-prototype.mts`) proved the diamond runs the sink
    ONCE. Full design in `docs/xs-heap-playbook.md` "Glitch-free reactivity" —
    lazy pull-based computeds + per-node `Uint32 version` + shared `dirtySet`
    bitmask (~+4 B/node, no per-edge objects), drops onto our masks. On landing,
    flip conformance law 12 → MATCH. Measure the slot delta on-device first
    (Rule 2 — eager core is correct-on-converge and cheaper).
  - **Running-owner effect ownership (B9 — FULL, no half-measure).** RECONSIDERED
    and the half-solution is REJECTED: binding an effect to the owner only at
    CREATE time rescues build-time effects but still leaks effects a running
    effect spawns on RE-RUN (the law-18 footgun — nested effects get owner=null).
    The correct fix is Solid's running-owner: while an effect runs, `owner =
    that effect`, so nested effects register with it and are disposed on the
    parent's re-run/dispose. Cost is lazy (most effects spawn no nested effects).
    Ship EITHER full running-owner OR keep today's explicit `track(effect(...))`
    — never the half-measure. Closes the footgun; pairs with glitch-free above.

## Node / compile-time — ready to do
- ~~**createResource**~~ ✅ SHIPPED: `createResource(fetcher)` in signals.ts —
  reactive `{loading,error,data,refetch}` over TWO Signal objects (tagged state
  slot), stale settlements dropped by generation counter. 19 node tests, 100%
  coverage held. Device fetch path = pkjs/pebbleproxy (gotcha 18); a live
  round-trip still wants steadier emulator networking. pkjs is TypeScript now
  (index.ts + pkjs.d.ts + tsconfig.pkjs.json; build.mts emits the .js).
- **Conformance suite expansion:** add laws for same-value-no-notify, nested
  effect ownership, effect-in-effect disposal, memo-of-memo, error isolation
  (`__spError`), batch nesting, untrack-in-effect. Flip law 12 to MATCH once
  glitch-free lands.
- **#30 type-directed storage:** analyzed net-negative; revisit only behind
  `NUMERIC_STORAGE=1` if a float-heavy app appears.
- ~~**Higher-fidelity tests on real XS**~~ ✅ SHIPPED: `npm run test:xs` runs the
  19 pure-signal conformance laws on the real XS engine (verified on XS 17.9.1).
  `tests/xs/laws.js` + `tools/xstest.mts` (binary auto-detect: XS_BIN → jsvu →
  PATH); install is a one-liner (`npx jsvu --engines=xs --os=linux64`), fully
  documented in `docs/xst-setup.md` including WHY the Piu suites deliberately
  stay Node-only. node:test remains the primary fast suite.

## Phone side — PebbleKit JS (`src/pkjs/`)
`src/pkjs/index.js` is 4 lines wiring `@moddable/pebbleproxy` to the phone's
`ready`/`appmessage` events. PebbleKit JS runs in the **Pebble mobile app**
(iOS/Android) sandbox — NOT on the watch, and NOT UI (the watch UI is our XS/Piu
runtime). It's the phone-side bridge: `XMLHttpRequest` (network), `navigator.
geolocation`, `localStorage`, AppMessage to/from the watch, config pages,
notifications, device info.
- **This is where network lands.** The watch can't do HTTP; `createResource`
  (async `fetch → {loading,error,data}`, roadmap above) must go THROUGH pkjs:
  phone fetches via XMLHttpRequest and bridges results over AppMessage. So pkjs
  becomes real code the moment we ship data-driven apps.
- **pkjs → TS when that happens.** Convert `index.js` to `.ts` with a BROWSER-ish
  lib (it has XMLHttpRequest/localStorage/geolocation, a different engine than
  XS — its own tsconfig + lib, NOT es2025/no-DOM), and type the AppMessage
  key contract (keys must be declared in package.json up-front or they're
  dropped). Not now — 4 lines of glue, no logic to type yet.

## Device work — NOW UNBLOCKED (emulator healthy)
- **Verify JSX auto-thunk on-device:** build the `autothunk` example, install,
  confirm the bare `string={"c"+count()}` binding updates live.
- **#27 importNow lazy screens:** screens as separate non-preloaded modules,
  loaded from flash on first push; measure heap before/after. Keep multilazy as
  the closure-swap variant.
- **#29 swapped-screen reactive crash + richlist boot regression:** UNCONFIRMED —
  settle with a single clean reactive-Navigator test on the now-healthy emulator.
- **text-input example:** key-based char picker (Pebble has no keyboard) + a todo
  whose items are entered that way.
- **Reactive position via Piu moveBy.** Position/size props are construction-time
  static (bind-time rejected today, shipped). The dynamic path: a `<Move>` helper
  or `animate()`+`content.moveBy(dx,dy)` / Piu Transition binding that repositions
  a mounted node imperatively inside an effect (NOT via a reactive dict prop).
  Needs on-device timing/repaint verification.

## Toolchain — RESOLVED (2026-07 research)
- ~~Real Piu/Moddable `.d.ts`~~ FOUND: **`@moddable/typings`** (npm, v8.2.3,
  official — phoddie/patrick-soquet). Piu host globals in `piu/MC.d.ts`,
  interfaces in `piu/MC-types.d.ts`; Pebble extras in `pebble/piu.d.ts`.
  Constructor shape is `(behaviorData?, dictionary?)` (our `new T(null, dict)` is
  correct — null = behaviorData). Use these to type the Piu globals in the TS
  conversion. Source: Moddable-OpenSource/moddable `public` branch `typings/`.
- ~~Pebble's upstream `.clang-format`~~ DONE: copied verbatim from
  `coredevices/PebbleOS main` into `src/c/.clang-format` (Google base, 2-space,
  PointerAlignment Right, 100 col, SortIncludes Never).
- ~~`kModdableCreationFlag*` enum~~ FOUND (`coredevices/PebbleOS`
  `src/fw/applib/moddable/moddable.h`): only TWO flags — `LogInstrumentation`
  (1<<0), `Debug` (1<<1), both no-ops without a BT log listener. Plus
  `.fxBuildFFI` for custom native bindings.

## Heap-sizing retest (Rule 2 — potential unlock)
- **Re-measure whether stack/slot/chunk are honored on newer firmware.** Our
  4.17 measurement showed them IGNORED, but upstream PebbleOS `main`
  (moddable.c) maps them onto `xsCreation` (all-or-nothing) — a >32 KB arena may
  be requestable on a newer firmware. Blocked twice: (a) our emulator is 4.17,
  (b) the 4.17 instrumentation stream isn't currently attaching (memtest reports
  "no instrumentation received" even post-relaunch). Fix the instrumentation
  pipeline first, then retest sizing; if a newer SDK/emulator appears, retest
  there. See mdbl.c + xs-heap-playbook "Firmware heap ceiling".

## Auto pure-module preload (classifier SHIPPED; wiring pending device measure)
- ~~**PURE/IMPURE classifier**~~ ✅ `tools/classify-module.mts` — AST-classifies an
  app submodule as PURE (only declarations / pure const initializers → preload-
  eligible, frozen into ROM ~free) or IMPURE (module-scope host construction
  `new Skin()`, reactive state `signal()`/`useState()`, or any top-level call/
  side effect → must stay in `main`, the 32KB heap). Unit-tested (6 cases). Also
  a diagnostic: it flags that even `hint.tsx` is impure ONLY because of a module-
  scope `new Style` — the "smart module splitting" hint.
- **v1 wiring (TODO, behind `PRELOAD_PURE=1`, default off until measured):**
  build.mts runs the classifier over each app submodule; PURE ones get added to
  the manifest `modules` + `preload` (ROM) instead of being bundled into main;
  IMPURE ones bundle into main as today. Measure the heap delta on a healthy
  emulator before flipping the default (Rule 2) — a watchface with a big static
  string table is the win case; a pure-reactive counter has nothing to move.
- **v2 "smart module splitting" (your idea — advanced, risky):** auto-split a
  MIXED module into a pure half (the const tables/formatters → preloaded) and an
  impure half (UI/reactive → main). Needs dependency analysis + import rewrite;
  ship only if v1 measurements show mixed modules carry significant pure weight.
  The safe interim is developer-assisted: put constants in `foo.const.ts`, and
  the v1 classifier auto-preloads it.

## Product ideas (RN-parity, evaluated in api-parity.md)
- react-compat shim (cosmetic — decided against; we stay honestly Solid-flavored),
  gesture/scroll polish, BUNDLE=preload for pure shared submodules (measure).
