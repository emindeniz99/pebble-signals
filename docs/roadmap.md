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

## Toolchain fetches (need web; roadmap in case scope blocks)
- **Real Piu/Moddable `.d.ts`** for the TS conversion (Moddable typings repo).
- **Pebble's upstream `.clang-format`** — our `src/c/.clang-format` is a
  Google-derived match to mdbl.c's style; swap for the real one if fetched.
- **Full `kModdableCreationFlag*` enum** from the Pebble Moddable fork — document
  every machine-creation flag (size fields are ignored; `.flags` is what works).

## Product ideas (RN-parity, evaluated in api-parity.md)
- react-compat shim (cosmetic — decided against; we stay honestly Solid-flavored),
  gesture/scroll polish, BUNDLE=preload for pure shared submodules (measure).
