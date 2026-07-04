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
- **Node/Content type split (from the 2026-07 any/unknown audit).** The audit
  (51 occurrences: 33 deliberate, 13 fixed, 5 deferred) proved `type Node = any`
  cannot become the vendored `Content` as a straight swap: (a) `For`'s children
  may legally return primitives (`children: (n, i) => n + i` is a passing type
  test — appendChild special-cases string/number/array/nullish), (b) hosts use
  Container-only members (add/remove/replace/insert/first) that `Content`
  lacks, (c) setProp's dynamic `node[key] =` needs an index signature no Piu
  type has. The real fix is THREE aliases: `JSXNode` (Content | primitive |
  array | nullish — for children/build returns), `Container` (makeHost
  products), `Content` (per-row slots in For's reconcile, where the surface
  matches exactly). Do it in one pass across flow.ts + jsx-runtime.ts with the
  byte-identical-emit gate; until then `Node = any` stays deliberately.
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
- **Minifier byte A/B (esbuild vs oxc-minifier):** 2026-07 research — Rolldown
  1.0 / Vite 8's Oxc minifier is 30-90x faster than terser but compresses
  0.5-2% WORSE; our builds are already ms and the boot-floor budget values
  compression over speed, so esbuild stays. Cheap experiment if ever curious:
  minify runtime-min A/B with oxc-minify and diff byte counts (Rule 2 —
  measure before switching anything).
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
- ~~**#27 importNow lazy screens**~~ ✅ SHIPPED (2026-07): `lazyscreen` example
  device-verified (boot → SELECT `importNow("app/s2")` loads + renders the
  non-preloaded module from flash → BACK returns). build.mts resolves literal
  `importNow("app/<x>")` calls (ships `src/tsx/examples/<app>/<x>.tsx` as a
  non-preloaded manifest module; treeshake/prune stay ON, lazy module's
  runtime imports join both keep-sets). Honest budget applied: the lazy
  module exports `default` only and the entry is leaner than navmany-class —
  archive 11330 / 120 symbols, UNDER the probe baseline despite +1 module,
  because laziness saves arena bytecode but NOT boot ids/symbols. multilazy
  stays as the closure-swap variant (zero extra modules).
- **#29 boot regression: ROOT-CAUSED and FIXED (2026-07).** Bisect on the
  emulator (screenshot-verdict probes, `APP=clock --no-lower` fixed): GOOD at
  03bf022 (mc.xsa 14462) → BAD at the very next runtime commit 3e6be5f
  (14991) → BAD at HEAD (15613). Mechanism: the boot arena floor tracks
  RUNTIME SIZE — every shipped export costs archive bytes + boot slots even if
  the app never imports it (confirmed by ablation: stripping strings +
  createResource at HEAD moved the size but the threshold sits ~14.5-14.9KB);
  the runtime simply outgrew what clock-class apps left free. FIX: per-app
  EXPORT-level pruning (`tools/prune-exports.mts`, default ON in build.mts,
  `--no-prune`/PRUNE=0 escape, self-disables with treeshake on dynamic
  imports): the keep-set is scanned off the POST-lower main.js + shipped
  sibling modules' imports; unused exports are demoted to module-locals and
  esbuild's bundle-mode DCE drops them from runtime-min. Measured: clock mod
  15613 → 9988 (-36%), and clock, counter, list AND richlist (the app that
  named this issue) all boot and render on gabbro. Pay-for-what-you-use:
  createResource/Store/context only cost apps that import them.
  STILL OPEN from the original #29: the swapped-screen reactive crash
  (Navigator/Show device flakiness) — untested by this pass.
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

## Auto pure-module preload — v1 WIRED; measurement OVERTURNED the naive model
- **v1 wiring SHIPPED (2026-07)**: `--preload-pure` / `PRELOAD_PURE=1` in
  build.mts (default OFF). Mechanics verified end-to-end on `navfat`: the
  classifier vets each direct local import of the entry; PURE modules are
  routed to the manifest (`app/<name>` + preload), the entry's import
  specifier is rewritten, esbuild leaves them external, and they ship
  minified in the archive. v1 bails per-module on nested local imports and
  never runs lower/auto-thunk inside pure modules (keep JSX in the entry).
- **MEASURED — the naive "ROM is ~free" model is WRONG on this firmware.**
  A/B with a 4KB pure string table: all-in-main (archive 17802, main 5847)
  boot-dies; table-in-ROM (archive 17926, main 806) ALSO boot-dies. Both
  sit over the ~15.9KB TOTAL-ARCHIVE startup ceiling (gotcha 15) — at this
  scale total archive size dominates, regardless of heap-vs-preload
  placement. And near the floor the margins are razor-thin: small-navfat
  all-in-main (12719) died while lean navmany (12116) boots, and small-B
  (12840, main.js as lean as navmany's) died too — so module COUNT/records
  and archive bytes both eat boot budget, with coefficients we have NOT
  isolated yet.
- **v1.5 matrix RAN (2026-07) — MECHANISM FOUND; see README gotcha 15
  correction + xs-heap-playbook "The boot floor".** One-variable probes off
  a navmany-class skeleton (`tools/gen-boot-probe.mts`, `--app probe`),
  binary screenshot verdicts, boundaries replicated:
  - baseline (xsa 12235 / main 777): BOOTS 4/4;
  - +1057B pure string data in main (13502/1938): BOOTS — chunk-side data
    is CHEAP; +1536B (14177/2531) and up: DIES → ~1.2KB chunk slack here;
  - +1 top-level binding (`g={}` + dead loop, +37B main): DIES 3/3;
  - `"zk0" in bg` (ONE new-to-host symbol, main 799): DIES — while the
    1-byte-different control `"fill" in bg` (host-known symbol, main 800)
    BOOTS. One interned symbol is the whole margin at this class;
  - +1 extra module: DIES in EVERY placement (preloaded, non-preloaded,
    id `app/data`/`pdata`/`runtime/data`, even merged-exports-into-flow) —
    module records + eagerly-interned archive symbols cost boot slots.
  - Firmware receipt (gabbro_sdk_debug.elf, gxPreparation): creation =
    chunk 8192(+1024 incr), heap 512 slots(+64 incr), stack 384 slots,
    keys initial=32 incremental=32. Keys GROW (no hard key cap) — but each
    new key allocates slot-side, and at a saturated app class the slot
    heap cannot grow (arena fully committed), so +1 key = silent fxAbort.
  **VERDICT: PRELOAD_PURE v1 stays OFF and is a dead end as designed** —
  `fxMapArchive` interns EVERY archive symbol at boot and each module
  costs records + 2 ids, so "move data to a preloaded module" ADDS
  boot-slot cost instead of removing it. #42's earlier "both die =
  total-archive ceiling" reading was wrong: A died of main-size (chunk),
  B died of module+symbol slots. Two separate budgets, not one ceiling.
- **v2 REDIRECTED: the real levers are the SYMBOL DIET and the slot
  floor** — fewer new-to-host symbols (export pruning already does this;
  the true reason the #29 fix worked), fewer top-level bindings, fewer
  modules, data as strings/bytes (chunk) not structure (slots).
  `importNow` lazy screens (#27) save chunk-side bytecode but NOT boot
  slots (symbols intern at map time regardless) — design that example on
  an app class with slot headroom, and say so in it.

## Product ideas (RN-parity, evaluated in api-parity.md)
- react-compat shim (cosmetic — decided against; we stay honestly Solid-flavored),
  gesture/scroll polish, BUNDLE=preload for pure shared submodules (measure).

## Web IDE / CloudPebble — DECIDED 2026-07: tiers 1+2 committed, tier 3 evaluate
- coredevices/cloudpebble (the revived web IDE) runs builds AND the QEMU
  emulator SERVER-side, streaming the screen to the browser — so "React-style
  Pebble apps in the browser" does NOT require QEMU-in-browser. Three tiers to
  explore, cheapest first:
  1. **PR a project type into cloudpebble** — its build servers learn our
     toolchain (node + the signal-piu npm package); editor + emulator streaming
     come for free. Best effort/benefit if upstream is receptive.
  2. **Browser-only preview** — typecheck/lower run fine in a browser (plain
     TS); our vm-sandbox Piu stubs could back a canvas "layout preview" for
     instant feedback (not device-accurate — QEMU stays the truth).
  3. **QEMU-in-WASM** — evaluate after 1+2 (research-grade; adopt only if
     someone else has done the heavy lifting).
  Owner decision: tiers 1 and 2 WILL be built; scope tier 1 by deep-diving
  coredevices/cloudpebble (build-server plugin surface, project-type registry).


## Machine restart from C (owner idea, 2026-07 — research)
The XS module registry can't unload modules and the machine is created once
per app. The owner's angle: `mdbl.c` OWNS the machine — so kill it from C and
create a FRESH one (a JS "process restart"): frees every JS allocation at
once, resets all module state, and re-runs main. Potential uses: hard mode
switches (utility app <-> watchface half), leak/OOM recovery, phased apps too
big for one arena lifetime. To research (in order):
1. Does the applib expose deletion (`moddable_deleteMachine`/equivalent in
   coredevices/PebbleOS `moddable.c`)? XS itself has `xsDeleteMachine`.
2. Can the same mod archive re-attach to a second machine in one app run?
3. Cost: machine creation is ~boot (measured boot is fast); UI must be
   rebuilt from scratch after — acceptable for mode switches.
4. Trigger path: JS asks C to restart (AppMessage-to-self? a persist flag +
   exit? an FFI hook?) — the FFI gotcha (#17, slot budget) applies.

## Piu native node halves — measure the SECOND ledger (owner ask, tracked late)
Every Piu node costs TWICE: XS arena slots for the JS half AND native app-heap
bytes (~122-130KB pool) for the C half (layout box, draw state). We budget the
arena carefully but have never measured per-node NATIVE cost — if a big app
ever exhausts the native pool, symptoms would blame the wrong ledger. Do a
Rule-2 pass: Heap Usage log deltas (`process_manager` prints Total/Used on
exit) across N-label apps -> bytes/node native. Low urgency (native pool is
~4x the arena and nodes are few) but the number belongs in the playbook table.

## ~~Hand-Piu + JSX coexistence example~~ ✅ SHIPPED (owner ask 2026-07)

`coexist` example, device-verified: JSX reactive label (signal tick) and a
hand-built imperative Piu label (timer assigns `.string`) live in the same
Application and update independently — screenshots show both lines counting
in lockstep. Pattern: `render()` returns the Piu Application; `app.add(...)`
mounts classic content next to the JSX tree. Original ask below.
migration.md CLAIMS one-screen-at-a-time migration works because signal-piu
nodes ARE Piu nodes. Prove it with an example: one app where a hand-built
`new Column/Label` subtree and a JSX subtree live under the same Application,
sharing a Skin/Style — the migration story's load-bearing demo.
