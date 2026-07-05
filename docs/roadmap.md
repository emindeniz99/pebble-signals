# Roadmap — what's left

Shipped work lives in git history + the README/playbook. This tracks the OPEN
items. **Emulator status: HEALTHY** (recovered via `tools/reset-emulator.sh`;
counter device-verified 0→1). The old "needs a stable emulator" wall is down —
device work is unblocked again. **Device status: owner has NO physical watch
yet** (Round-2 pre-order, not yet shipped) — so all "device work" means the
QEMU emulator; real-hardware-only checks stay parked until a watch arrives.

New readers: `docs/field-notes.md` is the lab notebook (how each memory
finding was made, the source files, the tools, the wrong turns, the flag
model). Start there for the "why".

## Owner-queued next batch (2026-07, do in order)
Priority order the owner set; each is expanded in its own section below.
1. **Symbol diet** ✅ DONE (shipped `tools/symbol-rename.mts`).
2. **Piu native node ledger** ✅ DONE (measured: no second ledger).
3. **text-input example** ✅ DONE (`textinput`) — but do a SOTA/prior-art
   pass on watch text-entry (Pebble dictation, T9-style, scanning keyboards)
   and fold the best idea in.
4. **load-time ms instrumentation** — time an `importNow` and quote the lazy
   load latency in ms (one of the two genuinely-open playbook items).
5. **Conformance suite expansion** — new laws (same-value-no-notify,
   nested-effect ownership, effect-in-effect disposal, memo-of-memo, error
   isolation, batch nesting, untrack-in-effect).
6. **autothunk on-device (EMULATOR)** — build `autothunk`, install on gabbro,
   confirm the bare `string={"c"+count()}` binding updates live.
7. **moveBy reactive position** — `<Move>`/`animate()` imperative reposition
   inside an effect; emulator repaint/timing check.
8. **Machine restart from C (research)** — can `mdbl.c` kill + recreate the XS
   machine for a JS "process restart" (mode switch / OOM recovery)? Read
   PebbleOS `moddable.c` for `deleteMachine`; see the dedicated section below.
9. **Heap-sizing retest (source-verify)** — read PebbleOS `main` `moddable.c`
   to see if newer firmware honors stack/slot/chunk (our 4.17 ignores them);
   can't run it, but can confirm from source.
10. **CloudPebble tiers 1→2→3** — see the CloudPebble section; tier 2
    (browser layout preview) is the one we can build ourselves.

### Real findings from the watchface tutorial (2026-07)
- **RETRACTED "computed bug".** An earlier commit claimed a module-scope
  `computed` in a Label thunk renders blank. That was MY error, not a library
  bug: I *called* the computed (`greeting()`) but `computed` returns a
  `ReadonlySignal` = `{ readonly value }`, read with `greeting.value`. The
  `hooks` example (module-scope `computed`, read via `.value`) has always
  worked, and the watchface now derives `greeting` with `computed` and is
  device-verified (renders "good morning / 09:21", seconds tick 54→58). No
  library bug — corrected everywhere it was written.
- **REAL footgun it exposed: silent swallow.** Calling a computed (or any
  wrong-typed read) inside a binding throws at runtime, and `notify()`'s error
  guard routes subscriber exceptions to `globalThis.__spError` (so the machine
  survives) — with no `__spError` set, the symptom is a **blank Label**, not a
  crash or a log line. That is a genuine dev-experience hazard: a typo yields
  a silent blank. FIX OPTIONS: (a) install a default `__spError` that logs to
  the instruments/console in non-minified builds (loud failure in dev);
  (b) a build-time lint that flags calling a `computed`/`signal` binding.
- **Read-syntax unification (ergonomics).** Three read syntaxes today:
  `useState`→`hh()`, `signal`→`.value`, `computed`→`.value`. This is the
  source of the footgun above. Consider making computed/signal also callable
  (a `()` that returns `.value`) so ONE syntax works everywhere, or the
  reverse. Design + measure the slot cost (a callable adds a function object
  per signal — may not be worth it on the 32KB arena; a lint may be the
  cheaper fix). Tracked, not yet decided.

### Bigger tutorial + docs push (owner, 2026-07)
- **A second, COMPREHENSIVE watchface tutorial (0→published).** The existing
  `tutorials/build-a-watchface/` stays (a focused 3-part intro). Add a longer
  original series covering the full arc the official Alloy tutorial covers, in
  OUR words / OUR code (we do NOT copy or re-word their copyrighted text — we
  write original signal-piu content on the same topics): project setup,
  drawing time/text, **custom fonts** (`.ttf` → resource → `Style`), images,
  **config pages** (see Clay below), persistence via `device.keyValue`, and
  publishing. Each part device-verified. This is the "port their tutorial
  outline to signal-piu, originally written" the owner asked for.
- **Clay config pages — does it work with us?** Alloy tutorial part 6 uses
  [pebble-dev/clay](https://github.com/pebble-dev/clay) for settings pages.
  Clay runs PKJS-side (config webview + AppMessage), so it is orthogonal to
  our XS/Piu runtime — likely works unchanged through `src/pkjs/`. RESEARCH:
  wire Clay into the pkjs bridge, expose settings to the watchface as signals,
  device-verify a color/toggle setting round-trips. Great tutorial payoff.
- **XS docs survey for optimization lessons.** Read the rest of Moddable's
  `documentation/xs/*` the way we read `mods.md`/`preload.md`. `preload.md`
  already paid off (READ 2026-07): its guidance — "separate pure logic from
  device ops, export init FUNCTIONS instead of running setup at load, freeze
  const data, pre-compute lookup tables at build" — is exactly what our
  pure-module classifier + `romTable` already do, just via lazy modules
  because mods can't preload. Worth a field-notes cross-ref and a scan of
  `XS in C`, `XS Differences`, `handle`/`profile` docs for more.
- **Vendor the rest of the Pebble typings.** We now vendor `pebble/device.d.ts`
  (2026-07). Audit `@moddable/typings/pebble/*` for other useful ambient decls
  (sensors, button, message) and the `embedded:*` module typings, and add the
  ones our examples touch to `sync-moddable-typings.sh`.

### Test/verification infrastructure (owner ask, 2026-07)
- **Smoke catalog + runner.** Today's automated gate is `npm run verify`
  (SDK-free: typecheck + 100% coverage + XS conformance laws + consumer
  tarball smoke) plus `npm run smoke:flags-off` (SDK). What we LACK is a
  cataloged, repeatable set of on-device (emulator) smokes — "install app X,
  press these buttons, assert this renders" — that we currently do by hand
  each time. PLAN: (1) write down the manual device-smoke steps per example in
  one file (a checklist), (2) then automate with a `tools/device-smoke.mts`
  that drives `reset → install → drive.py → screenshot brightness/OCR assert`
  for a list of apps. Start manual (document), automate incrementally. This is
  the "list of smoke tests, run in sequence, prove we didn't break anything"
  the owner wants.

### Genuinely NEW ideas (owner, 2026-07)
- **Speech-to-text for todo entry.** The watch has a mic; PebbleOS/Pebble had
  a *Dictation* API (`DictationSession`) in the classic SDK. FEASIBILITY
  UNKNOWN on the Moddable/Alloy mod surface — research whether Alloy exposes
  dictation (or PKJS can bridge phone speech recognition) before promising it.
  If reachable, it pairs perfectly with the `textinput` todo example. Do a
  research pass first (Rule 2 — don't claim it works until measured).
- **Tighten `JSX.Element` from `any` → `JSXNode`.** `globals.d.ts` currently
  declares `JSX.Element = any` (the loosest legal JSX contract). React uses
  `ReactElement`, Solid a big renderable union; our principled type is the
  `JSXNode` we already define (Content | primitive | array | nullish). Swapping
  it gives real typechecking of JSX expressions but can ripple through
  inference — do it behind the typecheck gate, one pass, verify `npm run
  typecheck` stays green. Low risk, nice-to-have.
- **Vendor `modules.d.ts`** (Moddable's `Modules.importNow`/`has`/`host`/
  `archive`) into `types/moddable/` via `sync-moddable-typings.sh`, so the
  mod API is typed from the real source instead of our hand-declared global.
- **`tutorials/` folder — "Build a watchface in signal-piu".** Mirror the
  shape of coredevices/alloy-watchface-tutorial (working example source +
  step-by-step MD guides), but original signal-piu content. Structure:
  `tutorials/build-a-watchface/{README.md, part1…3.md, src/watchface.tsx}`.
  Part 1 a reactive ticking clock, Part 2 date + layout/styles, Part 3 a
  live complication (fine-grained update — only the changed Label repaints).
  Device-verified on gabbro + emery. STARTED 2026-07.
- **`deviceinfo` example — show everything the Pebble host injects.** A screen
  that surfaces `device.info` (serialNumber, language), `device.sensor`,
  `device.keyValue` round-trip, and platform (gabbro/emery) — both a demo and
  a probe of what the emulator actually returns vs. real hardware. `keyValue`
  is the proper persist path (vs. localStorage); worth adopting in examples.
- ~~**Flags-OFF smoke test**~~ ✅ DONE (2026-07): `npm run smoke:flags-off`
  (`tools/flags-off-smoke.mts`) rebuilds `counter` with EACH flag off in turn
  and asserts a valid mod archive. Finding (measured, device): each flag off
  INDIVIDUALLY still boots (arena rebalances — counter boots with `--no-prune`
  alone or `--no-lower` alone, 0 aborts), but ALL off at once **dies**
  (`fxAbort memory full`, slot heap pinned at 8176) — so `prune`+`lower` are
  load-bearing for the 32KB fit, not cosmetic. Corrected the field-notes §4
  overstatement accordingly. (Requires the SDK, so it's separate from the
  SDK-free `npm run verify`.)
- **SDK currency note (2026-07):** we build on Pebble SDK 4.17 (Moddable
  tools 8.2.3). Upstream Moddable shipped 7.1 (ES2026) + 8.0 (ESP-IDF v6) in
  early 2026; coredevices/moddable trails upstream public by ~49 commits. Not
  our lever — we use whatever `pebble` installs — but track it: a Pebble SDK
  bump could move the arena story (see the heap-sizing retest).

## Big in-flight tracks

- **Runtime → strict TypeScript — LARGELY DONE.** `signals/jsx-runtime/flow` are
  strict `.ts`; tsc emits the shipped `.js` (verified byte-identical, gotcha-13
  alias budget intact). Tests migrated to `.mts` on **node:test** (built-in
  runner + isolate-wide V8 coverage that SEES the vm sandbox — vitest-v8 reports
  0% for vm code, so node:test won over vitest; c8 dropped). Tools are `.mts`
  (manifest gen / fontcheck / treeshake / lower / classify), strict-typechecked
  via `tsconfig.tools.json`. Toolchain on TS 6 + target/lib es2025. `build.sh` is
  now `build.mts` (C14 done — verified byte-identical artifacts + successful
  `pebble build`). B6 FULLY DONE: EVERYTHING is auto — runtime-API `.d.ts`
  via `npm run build:types` (`tsc --declaration` → `runtime-types/*.d.ts`),
  Piu host globals from the vendored `@moddable/typings` (types/moddable/,
  `tools/sync-moddable-typings.sh`), and `runtime/*` resolves straight to
  the `.ts` sources via tsconfig `paths`. `src/tsx/globals.d.ts` is now just
  5 lines of IRREDUCIBLE glue — the `JSX` protocol shim (a TS language
  contract, not generatable from any source) + the `importNow` host-global
  declaration (Pebble-loader-injected, absent from @moddable/typings).
- ~~**Core-reactivity round: glitch-free + running-owner together**~~
  ✅ SHIPPED (2026-07), one pass as decided. What landed:
  - **Glitch-free**: computeds are LAZY (recompute on read, validated against
    a global write version in `G.y`, pulling sources first — the read
    recursion is the topo order; the naive dirty-flag design was rejected
    because a sink that ALSO reads the source directly could observe a stale
    computed under adversarial notify order) + every notify coalesces into
    `settle()` turns (union-of-masks per turn — the old batch machinery,
    now on every write). Law 12 = MATCH on V8 AND real XS.
  - **Running-owner (B9 FULL)**: while an effect runs, `owner` = its numeric
    id; `effect()` auto-registers with the innermost context, nested
    trackables live in `G.w[e]` and are disposed before every re-run and at
    disposal. Law 18 = MATCH. `track(effect(...))` is now redundant (runtime
    call sites cleaned); useEffect's cleanup is just a tracked closure — the
    dedicated `cln` array is DELETED.
  - **Boot-floor discipline** (the v1.5 finding applied to our own change):
    first attempt cost +3 interned symbols and navmany DIED on-device;
    compensated by single-letter Graph props (`y`/`x`/`w` — letters already
    in every build's SYMB), deleting `cln`, and deriving row capacity from
    `sub.length` (dropped `cap`). Net vs the old core: −2 archive symbols
    (navmany 125 → 123), +767 B chunk-side bytecode. Verified on gabbro:
    navmany boots + push/pop live, clock ticks, coexist dual-updates;
    267 node tests, 100% line/branch/func coverage, 19 XS laws green.
  Original decision text below for the record.
- **(original decision)** Two core changes the owner wants shipped as ONE
  careful pass — full test + byte-emit measurement + on-device verify —
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
- ~~**Node/Content type split**~~ ✅ SHIPPED (2026-07): the THREE aliases below
  landed as designed (`JSXNode`/`Container`/`Content` across flow.ts +
  jsx-runtime.ts; consumer placeholders fixed; `npm run verify` bundles all
  gates so the consumer smoke can't be skipped again). Original analysis:
- **(original analysis)** The audit
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
  RESOLVED from the original #29 (2026-07, task #39): the swapped-screen
  reactive crash was the SAME boot-pressure, not a separate Navigator/Show
  bug — export pruning overturned it (CHANGELOG "Fixed"). No open item here.
- ~~**text-input example**~~ ✅ SHIPPED (2026-07): `textinput` — a button-driven
  character picker (Up/Down cycle a-z + ␣, Select appends, Back commits the word
  to a reactive todo list, empty-buffer Back falls through so the app can exit).
  Four `useState` signals (candidate/buffer/count/last), all on-screen state is
  reactive `<Label>` bindings — proves text entry needs no special widget on a
  keyboard-less device. Device-verified on gabbro (typed "ab" → todo: 1).
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
- **CORRECTION (owner pushback, measured): PRELOAD (v1's mechanism) is NOT
  dead — it works WITH HEADROOM, and frozen data costs ZERO slots.** The
  owner asked "kesin çalışmayacak mı?" and the missing experiment answered:
  a LEAN skeleton + 4KB pure data module built with --preload-pure BOOTS,
  READS (screenshot: pick(3) renders "station 0003 …"), and Navigator still
  pushes; 8KB frozen data ALSO boots. Instruments receipt: slot used is
  IDENTICAL at 4KB and 8KB (17104/18416) — the frozen array structure lives
  in flash, exactly the original v1 dream; chunk grows ~0.32×payload
  (partial materialization, 6528→7824 for +4KB). What v1 actually got wrong
  was shipping this as a default-on free lunch: the module's FIXED cost
  (2 ids + record + new export symbols) kills at zero-margin classes (the
  same 4KB module dies on the ticker skeleton — PRE4K, fxAbort memory
  full). VERDICT: PRELOAD_PURE stays OPT-IN; use it for big STRUCTURED
  data on apps with slot margin (check with host-symbols/xsa-symbols);
  use data-to-Resource when margin is tight or data exceeds ~8KB scale.
- **CODE-in-ROM curve (owner's real goal — smart splitting for CODE) —
  FIRST CELLS MEASURED (2026-07), campaign continues.** `gen-boot-probe
  --code N` generates N bytes of distinct pure const-arrow helpers + a
  dispatch table (DCE-proof); lean skeleton; `--preload-pure` freezes.
  Measured on gabbro (screenshot verdicts, fresh-emulator installs):
  - 2KB code ALL-IN-MAIN: **boots** (xsa 13584 / main 1714 / 125 syms) —
    code in main is cheaper than data in main (bytecode is XIP; only
    function objects + the dispatch array materialize).
  - 4KB code all-in-main: dies (memory full; main 2740 / 140 syms).
  - 4KB code PRELOADED: **died in the first cell** (xsa 15591 / 133 syms;
    manual launch re-verified) — while 4KB frozen DATA at the same class
    boots. Working hypothesis: CODE brings ~1 new-to-host SYMBOL per
    helper (name survives even minified: 119→133 syms vs the data module)
    plus per-function frozen-object costs the data table doesn't pay.
  CAMPAIGN RAN (2026-07, owner mandate) — see playbook "Code in ROM" for
  the full table. Headlines: per-FUNCTION cost (not per-byte) is the law —
  4KB dies as 46 fns, boots as 8 fat fns; **16KB of code boots from ROM**
  (xsa 29KB); ceiling 16-24KB in that form; name-symbol diet alone did NOT
  save thin functions; classes are poor ROM tenants; `romscreens` example
  ships (screens frozen via --preload-pure, instruments-verified).
  MECHANISM PINNED (mcrun source): mods have NO preload — "preloaded"
  modules execute at boot (objects in RAM, bytecode XIP). 40KB+ TOTAL code
  = lazy importNow modules (only the active screen's objects in RAM); true
  mod freeze = upstream ask (upstream-issue.md #5). Compiler direction
  updated: split screens into LAZY modules (not merge into one frozen lib).
  #48 SHIPPED (2026-07): romTable() + pack-table.mts + manifest
  auto-ship + romtable example (200 entries live from flash) + squash
  advisory in build.mts; archive limit SOLVED (round 3, corrects the
  "112-131KB band / mod AREA" guess): the archive is malloc'd INTO the
  app heap on QEMU (ArchivePebbleResource.c mmap_or_load fallback), so
  ceiling = free app heap (~130,768 on gabbro) minus runtime needs;
  lean-cell edge measured at 116,816✓/117,042✗ with App bytes free =
  3,088 at rest (playbook "Limit bisect round 3"); lazyklass cell corrected the class verdict (fine when lazy; cost
  = method-name symbols). Automated squash pass SHIPPED (2026-07):
  tools/squash.mts packs array-of-arrows into one dispatch fn on lazy
  modules (default ON, --no-squash escape) — lazymany now BOOTS with
  zero source changes (device receipt). Folder-convention auto screen
  splitting SHIPPED (2026-07): <app>/screens/*.tsx auto-ship as lazy
  modules app/screens/<name>; computed importNow("app/screens/" + n)
  stays treeshake/prune-safe; autoscreens example device-verified.
  The convenience campaign is COMPLETE — no remaining items.
  romscreens white-screen quirk SOLVED (2026-07): the prune keep-set
  missed preload-pure module files, so `jsxs` was pruned out of
  jsx-runtime; build.mts now scans pureFiles like lazyFiles —
  screens 1/2/3 device-verified rendering + nav.
  ROUND 2 (owner Q&A, device-proven): lazymany (70 thin fns, runtime
  load) DIES -> lazypack (same bodies, ONE switch-packed fn) WORKS — now
  an automated build pass (tools/squash.mts). CAMPAIGN CLOSED (2026-07):
  everything the "next cells / still open" notes below listed is DONE —
  romTable() (#48), true-WATCHFACE lazy test (lazyauto: watchapp.watchface
  + 0ms/10ms timer importNow + live clock inside the lazy module),
  class-pure cell (lazyklass), romscreens foreground shot (screens 1/2/3
  device-verified after the prune fix), and the 71-131KB archive bisect
  (round 3: it's the app heap, 116,816✓/117,042✗). The "merge many pure
  files into ONE frozen module" idea is ABANDONED by design — mods have no
  preload, so the direction is LAZY per-screen modules, not one frozen lib
  (see mcrun mechanism above). REMAINING (only two, both minor):
  - **load-time ms instrumentation** — time an importNow to quote the lazy
    load cost in ms (today we only know it boots; no latency number).
  - **symbol diet / export-rename** — see "data-to-Resource productize (b)"
    below; this is the one real library-wide lever left.
- **v2 MECHANISM PROVEN (2026-07 deep dive): data-to-Resource.** The 4KB
  table that dies all-in-main at +1.5KB boots and live-renders from the
  flash resource area (playbook "v2: data-to-Resource — DEVICE-PROVEN";
  `gen-boot-probe --res` regenerates). Two port gotchas earned on the way:
  whole-blob `new Uint8Array(resource)` = memory-full abort; per-char
  `fromCharCode.apply` at render depth = stack-overflow abort — use ranged
  `resource.slice()` + `String.fromArrayBuffer`. Productize status:
  (a) DONE — `romTable()` (#48) is the `defineTable()` helper (blob packer
  `tools/pack-table.mts` + typed accessor + manifest auto-ship);
  (b) DONE (2026-07) — the SYMBOL DIET shipped as `tools/symbol-rename.mts`
  (default ON, `--no-symdiet`/`SYMDIET=0`): an end-of-build pass renames
  each runtime EXPORT wire name (`jsx`/`jsxs`/`render`/`S`/`createStore`/
  `effect`/…) AND every matching import — including lazy-module imports — to
  a HOST-KNOWN id from a curated obscure-constant pool (`BGRA32`/`CLUT16`/
  `LOG2E`/…), so `fxMapArchive` finds the id already interned. Touches only
  import/export specifier clauses (local code byte-identical); monotonic +
  collision-checked, so it can only lower the boot-slot count. DEVICE-
  VERIFIED: list 47→41 new-to-host (boots + reactive), lazyscreen 43→34
  (lazy screen still loads + renders). Property names (`.sig`/`.get`/graph
  props) are NOT freed by this — a source-level prop rename is a possible
  follow-up; (c) `importNow` caveat stands (saves bytecode, not boot slots).

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

## ~~Piu native node halves — measure the SECOND ledger~~ MEASURED 2026-07: no second ledger
We assumed each Piu node cost TWICE — XS arena slots AND native app-heap bytes
for the C half. MEASURED and OVERTURNED (`tools/gen-native-probe.mts`, N Labels
in a Column, instruments at idle, fresh emulator per N): **App bytes free is
FLAT vs node count** (byte-identical 114,664 at 40 and 80 labels) while the XS
arena chunk+slot grows (~80 B chunk + ~30 slot-units per Label). The Piu content
struct is an XS host chunk (`xsSetHostChunk`) — it lives in the 32KB arena, not
the ~122-130KB native pool, which holds only the mod archive + Poco framebuffer.
So there is ONE node ledger (the arena we already guard), not two. Full table +
mechanism in playbook "Piu nodes live in the ARENA, not a second native ledger".

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
