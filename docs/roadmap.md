# Roadmap — what's left

Shipped work lives in git history + the README/playbook. This tracks the OPEN
items. **Emulator status: HEALTHY** (recovered via `tools/reset-emulator.sh`;
counter device-verified 0→1). The old "needs a stable emulator" wall is down —
device work is unblocked again.

## Big in-flight tracks

- **Runtime → strict TypeScript.** Convert `src/embeddedjs/runtime/*.js` to
  `.ts` (strict, `noImplicitAny`), replacing the `any` Piu globals in
  `globals.d.ts` with the real Moddable/Piu typings. tsc EMITS the shipped `.js`
  (types erase — zero runtime cost); the only real risk is that the emit must
  preserve the gotcha-13 alias budget (top-level function/class count) — verify
  by diffing the emit AND device-installing. `globals.d.ts` runtime-API half
  becomes auto-generated (`tsc --declaration`); Piu host globals stay hand-typed.
  Also move `build.sh`'s Python blocks (manifest gen / fontcheck / treeshake)
  into `tools/*.ts`, and migrate tests to `.ts` + **vitest** (test+coverage+watch
  in one tool; today it's plain-node + c8).
- **Glitch-free reactivity.** Our push notify re-runs a diamond sink twice
  through a transient glitch (conformance law 12). Full design spec'd in
  `docs/xs-heap-playbook.md` "Glitch-free reactivity" — lazy pull-based computeds
  + per-node `Uint32 version` + shared `dirtySet` bitmask (~+4 B/node, no
  per-edge objects). Cheapest known scheme, drops onto our masks. Measure the
  slot delta on-device before committing (eager core is correct-on-converge and
  cheaper). DESIGN READY, decision pending.

## Node / compile-time — ready to do
- **lower.mjs coverage:** currently ~93% branch; close to 100% like the runtime.
- **createResource:** the one real hook gap — async `fetch → {loading,error,data}`
  paired with VirtualList. Everything else in api-parity.md is covered or N/A.
- **Conformance suite expansion:** add laws for same-value-no-notify, nested
  effect ownership, effect-in-effect disposal, memo-of-memo, error isolation
  (`__spError`), batch nesting, untrack-in-effect. Flip law 12 to MATCH once
  glitch-free lands.
- **#30 type-directed storage:** analyzed net-negative; revisit only behind
  `NUMERIC_STORAGE=1` if a float-heavy app appears.

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

## Product ideas (RN-parity, evaluated in api-parity.md)
- react-compat shim (cosmetic — decided against; we stay honestly Solid-flavored),
  gesture/scroll polish, BUNDLE=preload for pure shared submodules (measure).
