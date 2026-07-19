# Changelog

All notable changes to signal-piu. Format: [Keep a Changelog](https://keepachangelog.com);
each release carries an **Upgrading** subsection — the scaffold files a project
OWNS (wscript, src/c, tsconfigs, manifest — see docs/packaging.md "Upgrades")
are never auto-touched, so any change they need is listed there explicitly.
No registry releases yet; entries accumulate under Unreleased until the first
`npm publish`.

## [Unreleased]

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
