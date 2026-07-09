# Roadmap — what's left

Shipped work lives in git history + the README/playbook. This tracks the OPEN
items. **Emulator status: intermittently WEDGED** — `pebble logs`/`drive.py`
went dead mid-session (0 lines incl. the always-present instruments key)
through hard resets; recovers on a fresh session. **Device status: owner has
NO physical watch yet** (Round-2 pre-order) — so all "device work" means the
QEMU emulator; real-hardware-only checks stay parked until a watch arrives.

New readers: `docs/field-notes.md` is the lab notebook (how each memory
finding was made, the source files, the tools, the wrong turns, the flag
model). Start there for the "why".

## Open — quick checklist
The at-a-glance view (GitHub renders these as checkboxes). Each item is
detailed in its section below; check it here when it ships. Grouped, not
strictly ordered except the "next batch".

**Next batch (owner order):**
- [x] load-time ms instrumentation ✅ (2026-07, `loadms` example): SELECT
      times a cold `importNow("app/heavy")` of a ~2KB lazy module on gabbro —
      **2ms** ("load 2ms acc=247700", screenshots/loadms-gabbro.png). Lazy
      screen-module load cost is negligible next to render/GC.
- [x] conformance suite expansion — 19→23 laws (2026-07): write-in-untrack,
      untrack return value, nested-effect dispose on parent RE-RUN (all MATCH),
      + memo-equality (DIVERGE, documented). Most roadmap-listed laws already
      existed (13-18). Found the memo-equality DIVERGE — candidate opt-in
      eager-memo later. 295 tests, 100% cov, XS green.
- [x] autothunk bare-binding on-device verify ✅ (2026-07): gabbro boots,
      "Count: 0" -> 2x UP -> "Count: 2" — the lowered bare `string={"Count: "+count()}`
      binding updates LIVE (screenshots/autothunk-live-gabbro.png)
- [x] `moveBy` reactive position ✅ SHIPPED (2026-07): `<Move x={thunk}
      y={thunk}>` in flow.ts — one effect applies rounded offset DELTAS via
      the probe-proven `content.moveBy`. 8 unit tests (delta math, rounding/
      no-drift, dispose, both axes), device-verified via `movebox` (UP/DOWN
      ±20px signal steps + SELECT animate() tween 60px down; receipts
      screenshots/movebox-steps-gabbro.png / movebox-tween-gabbro.png).
      Canaries re-verified: navmany + navreactive boot & render, symbols
      unchanged at 140 (unused Move export prunes out).
- [x] machine-restart from C — RESEARCHED, NOT POSSIBLE (2026-07, receipts):
      `moddable_createMachine` is the ONLY Alloy API exported to apps —
      `pebble.h` (4.17, gabbro) declares exactly one function in the Alloy
      group and `libpebble.a` contains exactly one `moddable_*` symbol (nm
      receipt); no delete/stop/restart exists, and createMachine BLOCKS for
      the app's lifetime (mdbl.c's main falls off the end while the app
      keeps running), so C can't loop it either. The `.fxBuildFFI` hook can
      add native functions but has nothing to call for teardown. Only reset:
      exit to launcher + relaunch (user-visible). Filed as upstream ask §13
      (docs/upstream-issue.md) — expose deleteMachine/restartMachine; the
      firmware already owns the teardown path at app exit. Bonus finding:
      pebble.h documents that instrumentation logs only flow "when a
      Bluetooth log listener is connected" — the source-side confirmation of
      the log-capture recipe (docs/device-smokes.md).
- [ ] heap-sizing source-verify (does newer firmware honor stack/slot/chunk?)
- [ ] CloudPebble tier 1 → 2 → 3

**DX:**
- [x] `defineApp` / `root.tsx` typesafe entry ✅ SHIPPED (2026-07) as the
      ROOT-COMPONENT convention: `export default` a `Component` (+ optional
      `export const app: AppDict` / `opts: RenderOptions`) and build.mts
      generates the render() shim. `Component<P>`/`AppDict` types are
      compile-time only — rootapp ships 124 symbols, same as hand-rendered
      counter. `sprafce`/`sprc` editor snippets in .vscode/. Device-verified
      via the smoke runner ("root 2", screenshots/rootapp-gabbro.png);
      rootapp added to the smoke catalog. The `defineApp({...})` HELPER shape
      was deliberately not built: it would cost a runtime export + a boot
      symbol for pure sugar the sibling-export convention gives for free.
- [ ] tighten `JSX.Element` `any` → precise — TRIED 2026-07, harder than it
      looked. `= object` typechecks OUR repo clean but BREAKS the consumer
      smoke (a JSX element as `object` is not assignable to a `JSXNode` slot:
      `object ⊄ Content | primitives | array`). The correct type is the
      runtime's `Content`/`JSXNode`, but those live in a MODULE — referencing
      them from `globals.d.ts` needs an `import`, which turns the ambient file
      into a module and drops the `JSX`/`importNow` GLOBALS. So it's a
      restructure (e.g. a triple-slash `/// <reference>` or a global re-export
      of `Content`), not a one-liner. Deferred; `any` stays for now.
- [x] tutorial: teach BOTH state placements ✅ (2026-07): "Where does state
      go?" section in tutorial part 3 — module-scope vs in-component (typed
      with `Component<P>`), why both cost the same (no re-render), and when
      each is the right call (reusable components need in-component state).

**Tutorial + docs:**
- [x] comprehensive watchface tutorial ✅ (2026-07):
      `tutorials/complete-watchface/` — 6 parts (setup/time, custom fonts,
      images, settings page, persistence, package/install), each backed by
      a device-proven example + screenshot receipt; original content, the
      official tutorial's arc in our words/code. Honest boundaries stated
      in-text: device.keyValue not yet repo-verified (part 5 teaches the
      proven localStorage/byte-store path), store publishing not performed
      (part 6 stops at the .pbw + Rebble pointer). All mechanics were
      device-proven first: fonts (`fontface`), images (imgwatch/slothvec),
      config (config + config-drive), persistence (list), watchface flag
      (lazyauto).
- [x] Clay config-page research (PKJS-side) ✅ (2026-07): full mechanic
      mapped AND device-verified — `config` example + pkjs listeners +
      headless tools/config-drive.py; "hi from config" black-on-white
      receipt (screenshots/config-roundtrip-gabbro.png). Clay = a page
      generator on this exact flow; details in the Clay section below.
- [ ] XS docs survey for more optimization lessons
- [x] `deviceinfo` example ✅ (2026-07): screen size/round/color + clock +
      live uptime on-watch; gabbro receipt (260x260/round/color) at
      screenshots/deviceinfo-gabbro.png. First-boot sanity app for new hardware.

**Test infra:**
- [x] device-smoke catalog → `tools/device-smoke.mts` runner ✅ (2026-07):
      `npm run smoke:device` — 7-app catalog (both stack canaries first, then
      counter/autothunk/movebox/loadms/deviceinfo with cataloged button
      drives). Per app: build → Rule-3 log-capture install (≥3 heartbeats, no
      fxAbort) → drive.py buttons → screendump → non-blank pixel assert → PNG
      receipt; reset+retry once on dead transport; exit 1 on any fail. First
      full run: 7/7 PASS on gabbro. Catalog + manual recipe:
      docs/device-smokes.md. Found while building it (measured): a fresh
      direct-qemu client's AppLogShippingControl is NOT reliably honored —
      heartbeats must come from the `pebble logs`-around-install recipe.

**Must-do first thing when the log transport is healthy:**
- [x] ~~device-verify the visible-error log~~ **SOLVED 2026-07 (deep dive).**
      The wedge is beaten and errors ARE visible on device. Full story:
      **(1) Why captures were empty:** pebble-tool spawns pypkjs with
      stdout/stderr → devnull (`_get_output()` returns `black_hole` unless
      the logger is at DEBUG), so its crashes were invisible; AND captures
      run across separate shell invocations died with their processes.
      **(2) The working recipe (device-proven, 17-line + 22-line captures):**
      run everything in ONE shell invocation — `pebble logs > f 2>&1 &`,
      `sleep 3`, `pebble install` (FOREGROUND), `sleep 10+`, `kill %1` —
      instruments heartbeats, pkjs proxy lines, heap reports all flow.
      **(3) The receipt:** a broken binding produced, live in `pebble logs`:
      `fxAbort unhandled exception: TypeError: call: not a function (in q)`
      + `at q () at A ()` — error WITH stack trace, on device. That line
      also exposed a real bug: the visible-error fix itself called
      `console.error`, but the Pebble host console is `Object.freeze({log})`
      — NO `.error` — so the logger threw inside the catch and fxAbort'ed.
      FIXED: `(c.error || c.log).call(c, …)`, logger can never throw;
      Pebble-shaped-console test added (297 tests, 100% cov, XS green).
      **Remaining receipt (2-min job, fresh session):** install the
      throwing demo on a fresh emulator and grep the now-well-formed
      `[signal-piu] uncaught in reactive update (effect #N)` line — this
      session's emulator stopped booting after ~15 boot-cycles (resource
      exhaustion), so the final screenshot is queued.
      ALSO FOUND: **creation-time (first-run) exceptions bypass the notify()
      guard** — an effect whose FIRST run throws propagates out of effect()
      (module-load context) unguarded; only RE-runs go through notify(). By
      Solid convention creation-time throws SHOULD propagate synchronously —
      but the jsx-runtime binding path may want its own guard. Decide +
      document (new item below).
      pypkjs version note: we run 2.0.7 from PyPI (coredevices' package,
      latest release) — the instability is environmental, not a stale version.
- [x] ~~decide: creation-time binding guard~~ **DECIDED + SHIPPED (2026-07),
      then REVISED same month (owner design review): the frozen-label
      containment default was overturned by the top-level error boundary.**
      Round 1 (guard): jsx-runtime wraps every reactive binding in try/catch
      and reports with context via `report(err, ctx)` — first render
      included. Round 2 (boundary, the shipped contract): `render()` installs
      a default sink — an escaped binding/build error DISPOSES the whole
      tree, empties the app and paints a crash screen ("APP CRASHED" + the
      real error + `[any button: exit]`; the press rethrows → fxAbort → host
      exits the mod). `render(build, dict, {boundary: false})` = log then
      propagate (strict); `__spError` outranks everything; bare core (no
      render) keeps the contained floor. Laws 24-25 pin it; DEVICE RECEIPTS:
      crashdemo paints the screen at n=3 with 13-15 heartbeats / 0 fxAbort
      and stays stable for minutes (`screenshots/crash-boundary-gabbro.png`);
      watchface re-verified no-regression. 329 tests, 100% cov, 25 laws.
- [x] ~~error boundary residual (a): exit-button press~~ **VERIFIED in QEMU
      (2026-07, correction of "can't inject buttons"):** `tools/drive.py`
      (kill pypkjs, own the qemu port, QemuButton + AppLogMessage) drove the
      FULL loop — crash screen → select RETRIES (face reborn at n=0,
      `screenshots/crash-retry-gabbro.png`) → crashes again → back EXITS
      ("Install an app to continue", `crash-exit-gabbro.png`) with the
      kill's fxAbort + stack on the log channel. Retry itself (Solid
      `reset` parity), `" ~ "` screen packing, and `screen.round/color`
      shipped in the same round. Optional: repeat once on real hardware
      when the watch arrives.
- [x] ~~error boundary residual (b): per-subtree `<ErrorBoundary>`~~ **SHIPPED
      (2026-07):** Solid's opt-in component in `flow.ts` —
      `<ErrorBoundary fallback={(err, reset) => …}>{() => <App/>}</ErrorBoundary>`.
      Catches BUILD-time AND reactive-update throws in its subtree, swaps in the
      fallback, keeps the rest of the app alive; `reset` re-runs children under a
      fresh root; inner boundaries catch before the default crash screen; a
      throwing fallback escalates to the enclosing boundary (Solid nesting).
      Core mechanism: `Graph.z[e]` tags each effect with its owning boundary at
      creation (lazy, null until the first boundary — zero cost otherwise) and
      `Graph.c` is the boundary in scope; `report()` routes `__spError` >
      boundary > terminal sink. Names are SINGLE LETTERS (`c`/`z`) on purpose —
      a `cb`/`bnd` pair cost +2 boot symbols and helped tip a saturated app
      (gotcha 13/boot-floor lesson, re-learned). 364 tests, 100% cov, 26 laws
      (Law 26 MATCH Solid). DEVICE: watchface (exercises the new core paths on
      every tick) boots clean and RELIABLY across hard-wipes — core changes
      don't regress non-EB apps. The `boundary` example (147 sym / 16.1KB) does
      NOT boot here ("Install an app"): CONSISTENT across clean wipes while
      watchface@144 is rock-solid, so this is a real ~145-symbol boot floor
      this session, NOT the intermittent wedge (corrected in field-notes §5b).
      Pulling flow's ErrorBoundary costs ~2 boot symbols + ~2KB — inherent,
      like any flow component. (c) `defineApp` boundary-default toggle: future.
- [x] ~~error boundary residual (c-cont): live catch/reset receipt~~ **DONE
      (2026-07): `<ErrorBoundary>` LIVE on gabbro.** Three moves landed it:
      (1) A/B EXONERATION — navreactive rebuilt with the PRE-EB runtime
      (149 sym / 14.9KB) also fails to boot this session, so EB never caused
      the floor. ~~the session floor itself is <149 (environmental)~~
      **CORRECTED same day (Round 6): the floor never moved — the RUNTIME
      grew.** navreactive with its Jul-4 verification-era runtime (126
      tool-count / 39 new-to-host / 12.0KB) BOOTS today; the Jul-5
      error-handling rounds (crash screen/retry/strict/EB) grew it to 43
      new-to-host / 15.2KB and the three-module flow apps crossed the FIXED
      floor. (2) the MOVE: ErrorBoundary now lives in jsx-runtime (no flow
      module record for EB-only apps). First cut REGRESSED watchface
      144→153: DCE deleted the EB code but esbuild kept the now-dead import
      specifiers, and the export prune — which read keep-sets from the
      PRE-DCE builds — kept withBoundary/getBoundary/track/untrack alive in
      signals for every app. (3) the FIX, a new build pass:
      `tools/import-prune-min.mts` drops import specifiers whose local has
      zero AST references post-DCE, and build.mts now emits runtime-min in
      REVERSE-topological order (flow → jsx-runtime → signals), computing
      each module's keep-set from the already-pruned MIN siblings —
      post-DCE truth, not source claims. Watchface back to EXACTLY
      144/13970B; the pass even cleans flow's pre-existing dead imports for
      every flow app. RECEIPTS (gabbro, tools/drive.py): boundary example
      (149 tool-count incl. 4 free symdiet pool names, 15.3KB) boots —
      ok0 → up×3 → fallback "X: n3" with the OUTSIDE sibling still
      updating → fallback holds until reset → select remounts healed
      children "ok2" → re-breaks on cue (`screenshots/eb-live-gabbro.png`,
      `eb-caught-gabbro.png`, `eb-reset-gabbro.png`).
- [x] prune FIXPOINT rounds (owner ask, 2026-07): build.mts re-runs the
      runtime-min emission and requires byte-identical output — converges
      silently (measured: round 2 == round 1), iterates to 3 rounds seeding
      keep-sets from the previous round's min files (a future runtime-module
      cycle converges to a safe keep-set), and FAILS the build loudly if
      still unstable.
- [x] log-on-catch (owner decision, 2026-07): report() logs the FULL error
      even when an `<ErrorBoundary>` catches it (was a deliberate skip);
      `__spError` still owns its own logging. Pinned in signals.test;
      device re-verified (boundary catches at n=3 unchanged).
- [x] ~~**render-path DEPTH diet — the ACTUAL cure for navreactive (Round 7).**~~
      **DONE & device-verified (Round 7).** navreactive died of the mod's fixed
      JS VALUE-STACK depth (`fxAbort JavaScript stack overflow`), NOT the
      boot-slot floor — proven by mix-and-match runtime builds (659c47c boots;
      new-jsx-alone AND new-signals/flow-alone each overflow → marginal depth).
      Fix: `Navigator.swap()` built its screen via `asNode(() => build(nav))`;
      inlining asNode's auto-thunk unwrap (call `build(nav)` directly from the
      `createRoot` body — behaviour-identical) removed TWO stack frames, which
      was the entire margin. navreactive now BOOTS on gabbro (Round 2) AND
      emery (Time 2); push/pop navigation verified; 372 tests green. The
      `effect → run → fn` leaf trim is unnecessary for navreactive — left for a
      future deeper app. Lesson: an extra wrapper fn in the render path is not
      free on a mod (a control-flow-node design constraint now, not a bug).
- [~] **SYMBOL diet — for the boot floor (NOT navreactive). Round 8; property
      floor reached.** DONE & measured (navmany 44 → 34 true new-to-host, −10
      boot slots): Graph field rename to host-known letters (−9) +
      `__SP_CRASH_UI__` define fix (−1). See field-notes Round 8.
      Two more levers ATTEMPTED & REJECTED (measured, Round 8b):
      - `Signal.v` (+ `Context.v`) → free letter: **0 gain, reverted.** The `v`
        in the archive is esbuild's minified module-scope IDENTIFIER, not the
        `.v` property — renaming the only two source-level `.v` left `v` in the
        symbol table (confirmed: no `.v` in the shipped runtime-min). Not a
        source property, so not renameable this way.
      - flow helpers (makeHost/wrapSide/asNode) → component-local: **net-negative.**
        All are SHARED (5/4/4 call-sites), so delocalizing means 4-5 duplicated
        copies + that many extra function objects at load. The EB round's −5 only
        worked because ebHost/ebWrap were SINGLE-use (zero duplication).
      The remaining ~34 are dominated by esbuild's minified module-scope
      identifiers (`A B C D G I…`/`a d g j k…` — not host-interned). The ONLY
      lever left is **(d) an AST charset-remap pass**: after minify, rename those
      top-level identifiers to the free host-known set (`E b c e f h i m r s t w
      x y z` — same atoms as Graph's props, so free to reuse; identifiers and
      properties share the symbol table). Potential −15…−20, but needs a
      scope-aware TS-compiler-API pass (can't string-replace `a`→`b`) with real
      test coverage — a proper tool, its own task, real bug risk. Removes
      symbols/bytes, not stack frames — does NOT win navreactive back (Round 7
      depth).
- [x] ~~sink → root-boundary merge (single error mechanism)~~ **ANALYZED &
      REJECTED (2026-07).** Folding render()'s terminal sink into the
      `Graph.c` boundary chain looks cleaner but re-creates the sink under
      another name: (a) effects created OUTSIDE any build/run (timer
      callbacks) carry no boundary tag — routing their errors to the crash
      screen requires a GLOBAL fallback field, which is the sink; (b) the
      handler signatures differ (the sink receives the formatted message,
      boundary handlers the raw error). Two tiers are structurally real
      (React splits the same way: per-subtree boundaries vs createRoot's
      onUncaughtError). Keeping the shipped, device-verified design. (The
      original third reason — inner boundaries don't log while the terminal
      must — was retired by the log-on-catch decision; the two above stand
      on their own.)
- [ ] **Visible dev-log bridge (design):** on RELEASE firmware JS `trace` is
      a no-op (xsHost.c: visible lines are C-side `modLog_transmit`/APP_LOG;
      probes confirmed console.log/trace never reach `pebble logs` from a
      mod). The channels that DO show: fxAbort (fatal), instruments (C),
      and `pkjs>` lines (PKJS-side console). So build an opt-in dev bridge:
      watch `report()` → AppMessage → our src/pkjs proxy `console.log` →
      visible as `pkjs>`. Needs appKeys + size cap; lazy/dev-only module so
      release apps pay nothing. Note: "log fully then CRASH" already exists
      today with zero code — a rethrowing `__spError` handler (dev strict
      mode, pinned by tests; field-notes §5b has the matrix) — the bridge is
      only needed for live release-firmware log LINES.
- [x] ~~build-time lint: flag *calling* a `computed`/`signal` binding~~ ✅
      SHIPPED as `tools/lint-reads.mts` (2026-07): type-aware gate, 4 rules
      (call-signal / stringify-signal / prop-signal / stringify-fn), default ON
      in every build, zero false positives across all 45 examples

**New ideas:**
- [ ] speech-to-text via `pebble/dictation` (todo entry) — typing exists

## Owner-queued next batch (2026-07, do in order)
Priority order the owner set; each is expanded in its own section below.
1. **Symbol diet** ✅ DONE (shipped `tools/symbol-rename.mts`).
2. **Piu native node ledger** ✅ DONE (measured: no second ledger).
3. **text-input example** ✅ DONE (`textinput`) — but do a SOTA/prior-art
   pass on watch text-entry (Pebble dictation, T9-style, scanning keyboards)
   and fold the best idea in.
4. **load-time ms instrumentation** ✅ DONE (2026-07, `loadms` example) —
   cold `importNow` of a ~2KB lazy module measured at **2ms** on gabbro
   (receipt screenshots/loadms-gabbro.png). Closes one of the two
   genuinely-open playbook items.
5. **Conformance suite expansion** ✅ DONE (2026-07). Inventory showed the
   listed laws were already covered by the core-reactivity round; the three
   genuinely missing were added as laws 27-29 (self-write converges, throwing
   computed surfaces-at-read-then-heals, effect-in-untrack tracks) — 29 laws,
   24 MATCH / 5 DIVERGE.
6. **autothunk on-device (EMULATOR)** ✅ DONE (2026-07): boots on gabbro;
   UP/DOWN presses drive the lowered bare binding live ("Count: 0" -> "Count: 2");
   receipt screenshots/autothunk-live-gabbro.png.
7. **moveBy reactive position** ✅ DONE (2026-07) — `<Move>` shipped in
   flow.ts (delta-applied, rounded offsets; pairs with `animate()`);
   device-verified via `movebox` on gabbro.
8. **Machine restart from C (research)** — can `mdbl.c` kill + recreate the XS
   machine for a JS "process restart" (mode switch / OOM recovery)? Read
   PebbleOS `moddable.c` for `deleteMachine`; see the dedicated section below.
9. **Heap-sizing retest (source-verify)** ✅ DONE (2026-07). Read
   `coredevices/PebbleOS` `moddable.c` (main + v4.17.0): the SOURCE honors
   stack/slot/chunk and can `staticSize=0`-malloc a >32KB machine. BUT our
   emulator (v4.17.0 string, "patched 4.3 SDK core") measurably ignores it —
   different firmware lineage, partly-unresolved version tangle. See
   field-notes Round 10 (with the honest correction). Live behavior on current
   firmware remains untested (no QEMU-bootable newer image obtainable).
10. **Fork + rebuild PebbleOS to test bigger machine defaults (owner ask:
    "roadmape ekleyelim, deneyelim").** PebbleOS + Moddable are open source now
    (coredevices/pebbleos, coredevices/moddable). The experiment: bump the
    fixed machine defaults in `moddable_createMachine` (heap 512 +64, keys
    32 +32, **JS stack** — the Round 7 navreactive killer) and/or stop `mcrun`
    nulling `creation`/`preload`, build the firmware, run in QEMU, and re-test
    navreactive + a saturated app. Two payoffs: proves whether a larger stack
    boots navreactive (validates the Round 7 depth diagnosis end-to-end) and
    whether honoring `keys`/`static` lifts the boot-slot floor (§1/§11 of the
    upstream issue). NOT 5 minutes: needs the firmware toolchain + a QEMU image
    build. Sequence per repo etiquette: file the issue FIRST (our draft is
    ready), then fork/PR with the QEMU-measured before/after as evidence.
    **ATTEMPTED 2026-07 — BLOCKED, no clean path from here.** The classic emery/
    gabbro emulator runs the OLD waf-based firmware (NOT Zephyr); `coredevices/
    PebbleOS` main targets the NEW boards (asterix/getafix/obelix), so building
    it may not even produce an emery image; PebbleOS releases ship only
    real-hardware firmware (no QEMU image); `coredevices/qemu` is the CPU
    emulator, not firmware; pebble-tool offers no SDK newer than 4.17. So a
    live bigger-machine test on our emulator has no obtainable firmware. Parked
    until a QEMU-bootable newer classic image exists (or the owner provides one).
11. **CloudPebble tiers 1→2→3** — see the CloudPebble section; tier 2
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
- ~~**REAL footgun it exposed: silent swallow**~~ ✅ FIXED (2026-07, d4beddb).
  A throw inside a binding/effect with no `__spError` handler used to be
  rethrown-and-swallowed → silent blank Label, nothing in the logs. Now
  `notify()` logs it via `console.error` ("[signal-piu] uncaught in reactive
  update: …") — visible in `pebble logs`, ZERO boot-slot cost (console/error
  are host-interned), machine still survives, still overridable via
  `globalThis.__spError`. Now dumps the FULL error (type, message, stack,
  effect id — bcf7359). Unit-tested (291 tests, 100% cov).
  **MUST DO next session (device-verify the log):** install a deliberately
  broken app (a computed read as `g()` instead of `g.value`) and screenshot/
  grep `pebble logs` for `[signal-piu] uncaught in reactive update`. Tried
  this session but the emulator's `pebble logs` transport was WEDGED (0 lines
  incl. the always-present instruments key; drive.py + screenshots also dead)
  through hard resets + qemu/pypkjs kills. Behavior is deterministic + unit-
  tested, but the owner wants the on-device receipt — do it first thing when
  the log transport is healthy again.
  STILL WANTED (cheaper-still): a build-time lint that flags *calling* a
  `computed`/`signal` binding so the typo is caught before device.
- **Read-syntax unification (ergonomics).** Three read syntaxes today:
  `useState`→`hh()`, `signal`→`.value`, `computed`→`.value`. This is the
  source of the footgun above. Consider making computed/signal also callable
  (a `()` that returns `.value`) so ONE syntax works everywhere, or the
  reverse. Design + measure the slot cost (a callable adds a function object
  per signal — may not be worth it on the 32KB arena; a lint may be the
  cheaper fix). Tracked, not yet decided.

### DX: typesafe component entry + component patterns (owner, 2026-07)
- **Auto-render entry (`root.tsx` convention) — typesafe, `tsrafce`-style.**
  ✅ SHIPPED (2026-07). An app `export default`s a root component and
  build.mts generates the shim entry (`render(M.default, M.app, M.opts)`)
  when the source has a default export and no render() call of its own.
  Typesafe via `Component<P = void>` (`(props: P) => JSXNode` — generic
  props like React FC, no re-render model; the void default makes a
  prop-less root callable exactly the way the shim mounts it) and
  `AppDict` (the Application dictionary sibling export). Editor snippets:
  `sprafce` (root entry) + `sprc` (typed component) in
  `.vscode/signal-piu.code-snippets`. Measured: zero cost — the types
  erase and rootapp ships 124 symbols, identical to hand-rendered counter.
  Device-verified through the smoke runner; `rootapp` is now a catalog
  entry. Chose the sibling-export convention over a `defineApp({...})`
  runtime helper: the helper would cost a real export + boot symbol for
  the same ergonomics.
- **Component patterns: teach BOTH state placements.** ✅ DONE (2026-07):
  "Where does state go?" section added to tutorial part 3 — module-scope
  (single-screen idiom) vs in-component (React-familiar, required for
  reusable components), a `Component<P>`-typed Blink example, and the "no
  hooks-order rule" point. Both placements cost the same RAM (no re-render
  → state created once wherever declared).

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
- **Clay config pages — does it work with us?** RESEARCHED 2026-07 (sources
  read end-to-end; implementation next). The full mechanic is available and
  headless-drivable:
  - **Watch side:** the Alloy HOST manifest (`build/devices/pebble/host/
    manifest.json`) preloads `pebble/message` — a mod can `importNow
    ("pebble/message")` at ~zero shipping cost. The `Message` class
    (pebble-appmessage.js) takes `{keys: [...]}`, maps key NAMES to codes
    **10000+index**, `read()` returns a Map (names restored), `write(map)`
    sends. Moddable-IO callback convention (`onReadable`) for inbound.
  - **pkjs side:** pypkjs 2.0.7 implements the full config flow:
    `showConfiguration` event (fired by phonesim opcode `0x0a 0x01`),
    `Pebble.openURL` routes to `open_config_page`, and the response comes
    back as `webviewclosed` (opcode `0x0a 0x02 <len:be32> <query>`;
    `0x03` = cancelled). pkjs then `sendAppMessage` with NUMERIC keys
    (10000+i) to match the watch-side map.
  - **Headless driving:** no browser needed — speak the phonesim websocket
    protocol directly (the port is in /tmp/pb-emulator.json under
    `[platform]["4.17"]["pypkjs"]["port"]`): send `0x0a 0x01`, catch the
    broadcast URL, reply `0x0a 0x02` with the settings query. `pebble
    emu-app-config --file` also exists but opens a browser.
  - **Clay itself** is just a webview page generator on top of this exact
    flow — orthogonal as predicted; our tutorial can use a plain HTML page
    or Clay unchanged.
  - ✅ BUILT & DEVICE-VERIFIED same day: `config` example (watch signals <-
    Message onReadable; text + invert flip skin/style reactively), pkjs
    showConfiguration/webviewclosed listeners forwarding the raw settings
    JSON under key 10000, and `tools/config-drive.py` speaking the 0x0a
    protocol. Full headless round-trip on gabbro: driver sends
    `{"text":"hi from config","invert":1}` → watch renders "hi from
    config" BLACK-ON-WHITE (both settings applied) — receipt
    screenshots/config-roundtrip-gabbro.png. build.mts scan extended so
    host-module importNow literals (pebble/*, embedded:*) don't defeat
    treeshake (config ships 133 symbols, flow dropped). VERDICT: Clay
    works with us — it's a page generator on exactly this flow.
  - **Bonus host-manifest findings (recorded):** the host also preloads
    `pebble/dictation` (the speech-to-text roadmap item has its module),
    `pebble/wakeup`, `pebble/vibes`, fetch/WebSocket/webstorage; and it
    STRIPS `Proxy, Reflect, Atomics, WeakMap, WeakSet, BigInt, eval,
    Function, Generator` — those primordials DO NOT EXIST in mods (playbook
    note added). The device manifest's creation block is the source of the
    measured numbers: static 32768, chunk initial 8192, slot heap initial
    512 slots, **stack 384 slots** — the 384 wall, in source.
- **XS docs survey for optimization lessons.** Read the rest of Moddable's
  `documentation/xs/*` the way we read `mods.md`/`preload.md`. `preload.md`
  already paid off (READ 2026-07): its guidance — "separate pure logic from
  device ops, export init FUNCTIONS instead of running setup at load, freeze
  const data, pre-compute lookup tables at build" — is exactly what our
  pure-module classifier + `romTable` already do, just via lazy modules
  because mods can't preload. Worth a field-notes cross-ref and a scan of
  `XS in C`, `XS Differences`, `handle`/`profile` docs for more.
- **Vendor the rest of the Pebble typings.** We now vendor `pebble/device.d.ts`
  (2026-07). Full list of what `@moddable/typings@8.2.3` has that we do NOT yet
  vendor, add per example need:
  - `pebble/`: `dictation` (speech-to-text!), `battery`, `accelerometer`,
    `compass`, `location`, `vibes`, `button`, `message`, `wakeup`.
  - `embedded/`: `storage/key-value` (types `device.keyValue`), `storage/files`,
    `storage/flash`, `RTC`, `display`, `update`.
  - `piu/`: `QRCode`, `Sound`, `Timeline`, `CombTransition`, `WipeTransition`,
    `shape`, `index`.
  - `commodetto/`: `outline`, `parseBMF`, `readJPEG`, `ReadPNG`, … (font/image
    decode — relevant to the custom-fonts tutorial part).

### Test/verification infrastructure (owner ask, 2026-07)
- **Smoke catalog + runner.** ✅ SHIPPED (2026-07). `npm run smoke:device`
  (`tools/device-smoke.mts`) runs the cataloged on-device smokes in sequence:
  build → log-capture install (heartbeats + no fxAbort) → drive.py buttons →
  screendump → non-blank assert → PNG receipt, with the Rule-3 reset+retry
  baked in. 7-app catalog (canaries first), 7/7 PASS on first full gabbro
  run; checklist + what-a-PASS-means caveats in docs/device-smokes.md. The
  original plan's OCR assert was deliberately NOT done: the pixel assert
  proves "painted", heartbeats prove "alive", and the receipt is for human
  eyes — OCR on 18px Gothic over QEMU dumps is fragile machinery for little
  added proof (revisit only if a smoke ever passes wrongly).

### Genuinely NEW ideas (owner, 2026-07)
- **Speech-to-text for todo entry — LIKELY REACHABLE.** `@moddable/typings`
  ships `pebble/dictation.d.ts` (2026-07 finding), so Alloy exposes a
  dictation API on the mod surface — not just the classic-SDK
  `DictationSession`. NEXT: vendor `pebble/dictation.d.ts`, read its shape,
  wire a minimal "hold to dictate → append to todo" onto the `textinput`
  example, device-verify on the emulator (mic may be stubbed there — may need
  the real watch). Pairs perfectly with the todo example. Still Rule 2: don't
  claim it works until measured, but the typing existing is a strong signal.
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
- **Reactive position via Piu moveBy.** ✅ SHIPPED (2026-07). Position/size
  props stay construction-time static (bind-time rejected, unchanged); the
  dynamic path is the `<Move>` helper — an effect repositions the mounted
  host imperatively via `content.moveBy(dx,dy)` deltas (rounded before
  diffing, so `animate()` float tweens don't drift). On-device verified
  (`movebox` on gabbro): signal steps repaint instantly, a 1.2s eased tween
  runs on the shared 30fps ticker with stack peak 210/6144 during ticks.

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
  (see mcrun mechanism above). REMAINING (only one, minor):
  - ~~load-time ms instrumentation~~ ✅ DONE (2026-07, `loadms`): cold
    importNow of a ~2KB lazy module = **2ms** on gabbro
    (screenshots/loadms-gabbro.png). Lazy-load latency is a non-issue.
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
