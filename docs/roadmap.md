# Roadmap — what's left

Shipped work lives in git history + the README/playbook. This tracks the
OPEN items so nothing is lost. Grouped by whether it needs the (currently
flaky) QEMU emulator.

## Node / compile-time (no emulator) — ready to do
- **Multi-file apps.** Today the build maps only `main` in the manifest, so an
  app that imports a sibling module (`./screen1`) fails at runtime. Extend
  build.sh to derive app submodules from imports + add them to the manifest;
  add a 3-file example. (Real gap — currently every example is single-file.)
- **Missing hooks (treeshakeable):** `useReducer` (trivial over useState),
  `createContext`/`useContext` (module-level tree state), `onMount` (= useEffect
  no-dep). Add behind module-level tree-shaking (#25) so unused ones cost
  nothing.
- **animate() helper** (Reanimated-style): `animate(from, to, ms, easing)` →
  signal, driven by one shared timer. Put it in flow.js (module-cost rule).
- ~~**TSDoc + TypeDoc → markdown**~~ ✅ SHIPPED. TSDoc on every export in
  `src/tsx/globals.d.ts`; `npm run docs` (typedoc + typedoc-plugin-markdown, via
  npx — no committed dep) generates `docs/api/`. Regenerate after API changes.
- ~~**Conformance suite:**~~ ✅ SHIPPED. `tests/conformance.test.mjs` — 12
  fine-grained-reactivity laws run against our runtime, each annotated with the
  Solid/Preact/React contract. 10 MATCH Solid, 2 intentional DIVERGE (components
  run once; push notify is not glitch-free). See docs/api-parity.md.
- ~~**JSX auto-thunk lowering:**~~ ✅ SHIPPED. `lower.mjs` `autoThunk()` wraps a
  reactive read written bare in a JSX prop — `string={count()}` → `string={() =>
  count()}` — before the read-lowering, so it lands as `() => __sp.get(count)`.
  Symbol-resolved (getter call or `sig.value`), skips already-thunks / `children`
  / static props, idempotent. Bare `{count}` (no call) is deliberately NOT
  supported — the call is the reactivity signal, same rule as Solid's `{count()}`.
- **lower.mjs coverage:** currently ~93% branch; close to 100% like the runtime.
- **#30 type-directed storage:** analyzed net-negative; only revisit behind a
  `NUMERIC_STORAGE=1` flag if a float-heavy app appears (float signals are rare;
  integers are already inline in XS slots).

## Needs a stable emulator
- **#27 importNow lazy screens:** screens as separate non-preloaded modules,
  loaded from flash on first push; measure heap before/after. Keep multilazy as
  the closure-swap variant.
- **#29 swapped-screen reactive crash + richlist boot regression:** UNCONFIRMED
  — may be emulator flakiness. Settle with a single clean reactive-Navigator
  test on a healthy emulator (see xs-heap-playbook "Emulator stability note").
- **text-input example:** key-based char picker (Pebble has no keyboard) +
  a todo whose items are entered that way.

## Product ideas (RN-parity, evaluated in api-parity.md)
- createResource (async data for VirtualList), a react-compat shim (cosmetic),
  gesture/scroll polish.
