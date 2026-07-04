# Changelog

All notable changes to signal-piu. Format: [Keep a Changelog](https://keepachangelog.com);
each release carries an **Upgrading** subsection — the scaffold files a project
OWNS (wscript, src/c, tsconfigs, manifest — see docs/packaging.md "Upgrades")
are never auto-touched, so any change they need is listed there explicitly.
No registry releases yet; entries accumulate under Unreleased until the first
`npm publish`.

## [Unreleased]

### Added
- `createResource(fetcher)` async primitive; typed `ByteStore`; generic public
  API (`signal<T>`, `ReadonlySignal<T>`, flow prop contracts).
- Per-app **export pruning** (`--no-prune` to disable) — unused runtime exports
  are dropped from the shipped mod (clock: 15613 → 9988 bytes, boots again).
- `create-signal-piu` scaffold CLI; compiled `dist/` for consumers
  (`dist/build.mjs`); `npm run dev` (build+install+logs, `--watch`).
- `npm run test:xs` — conformance laws on the real XS engine.
- Examples: consumer (npm-package proof), watchface, worker, migration
  (before/after), navreactive, navmany.
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

### Fixed
- #29 boot regression (arena floor vs runtime size) via export pruning;
  the "swapped-screen reactive crash" was the same pressure — overturned.
