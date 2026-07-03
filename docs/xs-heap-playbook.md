# XS Heap Playbook — everything that lives in the 32KB, and how to shrink it

The JS machine's heap is firmware-fixed at **32KB** (slot heap + chunk heap +
~6KB stack). RAM is the scarce resource; **CPU is effectively free** (the
watch idles between frames). So the standing trade is always: *recompute,
re-derive, re-decode — never cache in the XS heap what you can rebuild.*
Numbers below are measured on gabbro/SDK 4.17 unless marked est.

## Inventory — what costs what

### Slot heap (16 B per slot — the scarce one)

| Thing | Cost | Optimization / alternative |
|---|---|---|
| Plain object | 1-2 slots header + **1 slot per property** | Structure-of-arrays: replace N objects with indices into typed arrays (see packed core below). Fewer, wider objects beat many small ones. |
| Closure | ~3-4 slots + captured env | Closures are the ONE thing user code can't avoid (reactions/thunks). Minimize captures; capture an index (number) instead of objects. |
| Array | ~2 slots + element block | For graph bookkeeping, replace arrays of refs with **u32 bitmasks** (chunk). `for-of` allocates an iterator — index loops in hot paths (done in signals.js). |
| String (stored) | slot + chunk bytes | Don't STORE strings — store bytes (Store) or derive on read. See "strings" below. |
| `Set`/`Map` | ~10 slots + hash chunk | Banned in this codebase (measured — the original per-signal Set was the single biggest cost). Inline single-value → array-on-demand instead. |
| Signal (current core) | ~4 slots | Packed core: **0 slots** — a signal is an integer index. |
| Effect + dep array (current) | ~8 slots | Packed core: reverse edges derived from forward bitmasks — the dep array is deleted outright. |
| `useState` tuple | 2 closures + array ≈ 10 slots | Index-based API (`get(i)`/`set(i)`) removes the per-state closures. |
| `computed` | Signal + Effect ≈ 12 slots, **caches** | **Invert the instinct: `computed` costs RAM to save CPU — usually the wrong trade here.** A plain function (recompute on every read) costs ~0. Use `computed` ONLY when the derivation itself subscribes to many signals from many places. |
| Module record + each export | slots per module/export | Merged 3 logical modules into signals.js (measured: 2 extra module records = boot death). Prune exports. |
| Piu node JS wrapper | handful of slots + native struct | Recycle nodes (VirtualList) instead of create/destroy; the native struct lives in the NATIVE heap (not XS). |
| Iterator, bound fn, rest args, spread | transient slots | Avoid in per-frame paths; fine at boot. |

### Chunk heap (variable-size, compacted by GC)

| Thing | Notes |
|---|---|
| TypedArray / ArrayBuffer contents | THE escape hatch: 1 byte costs 1 byte. Store, packed-core tables, bitmasks all live here. |
| String character data | Latin-1 strings = 1 B/char in chunk (+ slot header). |
| Array element blocks | contiguous; cheaper than objects but still slot-adjacent. |

### Stack (~6KB, fixed)

Deep recursion (reconcile over deep trees) is the risk; our runtime keeps
recursion shallow (appendChild recurses over children arrays only).

## Where else data can live (the memory ladder)

From scarcest to cheapest — push data DOWN this ladder whenever possible:

1. **XS slot heap (32KB shared)** — live JS objects only.
2. **XS chunk heap (same 32KB)** — bytes in typed arrays (Store records,
   bitmask graphs). ~450 B/row object → ~8 B/row bytes, measured.
3. **Native app heap (~122-130KB)** — decoded bitmap pixels, Piu native
   structs, **`localStorage`** (proven: Store.save/load round-trips through
   it — a string stored there costs XS nothing until read back).
4. **Flash resource area (256KB, read-only)** — `Resource` returns a
   host buffer VIEWING flash: reading it does NOT copy into the XS heap
   (SVGImage draws its PDC straight from flash; measured `len=29` probe).
   **Big constant tables (string catalogs, level data, lookup tables)
   belong here as `data` resources**, indexed on demand.
5. **The phone (PKJS side, effectively unlimited)** — full JS + storage +
   network. AppMessage/fetch make the phone a database server; the watch
   keeps only the visible window (this is the `fetch`/pebbleproxy path).

## Strings — the special case ("stringleri başka yerde tutsak?")

A displayed string must exist as a JS string only WHILE displayed (the
Label holds it). Everything else:

- **Store as bytes** in a Uint8Array pool (`createStore`), materialize per
  visible row (`String.fromCharCode.apply` over a subarray — 1 alloc).
  VirtualList + Store already implement exactly this: N=∞ rows of data,
  3 materialized strings.
- **Constant strings → preloaded `const`** in a runtime module: preloaded
  data is frozen into FLASH (ROM), ~free at runtime. Day names, month
  names, static labels — move them into the preloaded runtime.
- **Big/static catalogs → flash `data` resource**: `[u16 offset table][Latin-1
  bytes]`, `new Resource("strings.dat")`, decode one string on demand.
  Zero XS cost for the catalog, one transient string per read.
- **Cold user data → `localStorage`** (native heap) or the phone.

## The packed reactive core (task #15) — MEASURED

Prototype in `examples/slotbenchp.tsx`; A/B via `memtest.py --ramp`
(each UP press = +2 signal+effect pairs, ramp until fxAbort):

| | current core (`slotbench`) | packed core (`slotbenchp`) |
|---|---|---|
| marginal slot cost / pair | **~273 B** | **~144 B (≈2× cheaper)** |
| pairs until death | died at 20 | 32 (u32 cap) at 99%, alive |

Design: signal = integer index; values in `Float64Array`; subscriber sets =
per-signal **u32 bitmask** (effect id = bit; add `|=`, notify loop
`m & -m` + `31-Math.clz32(b)`, clear `m &= m-1`); the per-effect dep list is
**deleted** — unsubscribe is one `SUB[s] &= ~maskE` pass (reverse edges are
implied by forward masks). All bookkeeping is chunk bytes; the only
irreducible slot cost is the reaction closure itself (~144 B measured, incl.
bench label churn). Non-numeric values need a side table (slots return);
numeric signals (clocks, counters, offsets — our dominant load) get the
full win. Cap: 32 effects per u32 word; tier to N words if ever needed
(largest example uses ~6 effects).

Integration status — **BOTH STAGES SHIPPED and verified on-device**:
- **Stage 1** (99e8184): `effect()` returns a packed integer id; the
  Effect object + dependency array are gone; subscriptions are one u32
  word per lazy signal row (cap 32 live effects, `fx:max` loud); ids
  freed mid-cascade are quarantined so snapshot masks never run a reused
  id. Measured (emery ramp): marginal cost 273 → **176 B/pair (−36%)**,
  capacity 20 → **24 pairs**.
- **Stage 2** (206f46d): packed signals — an INTEGER id indexing `G.val`
  (1 slot per value, no Signal object, no getter/setter closures) via the
  `S` API, produced by **compile-time lowering** (`tools/lower.py`,
  between tsc and esbuild): `const [x,setX] = useState(v)` → `S.sig`,
  `x()` → `S.get(x)`, `setX(e)` → `S.set(x, e)`. Authoring DX unchanged;
  aliased getters/setters bail to the object API, property calls like
  `st.count()` are protected (caught on-device, selftest-covered).
- **On-device verification (emery)**: forbind 3 reactive rows ✅ (the
  earlier "crash" was confirmed to be recovery-screen contamination —
  after a FULL emulator state wipe incl. persist dirs it boots and
  updates), list with store + localStorage persistence ✅ (lowered),
  counter ✅ (lowered), sloth watchface ✅ (3 pairs lowered), post-trim
  slotbench ramp ✅. forbind5 (5 reactive rows) still exceeds the boot
  ceiling — the row cost is dominated by Piu nodes + closures, not the
  reactive graph. Node suites: 102/102 + `lower.py --selftest`.
- **Emulator recovery** — when installs hang/fail and
  `/tmp/pb-emulator.json` shows an empty platform: run
  `tools/reset-emulator.sh [platform]`. The wedge is NOT the SPI flash;
  the whole per-platform persist dir (app_cache, localstorage,
  timeline.db AND flash) corrupts and freezes first boot, so the script
  hard-kills qemu+pypkjs and deletes the entire dir. `pebble` re-extracts
  a pristine one on next install (retry once after a cold boot).

## Standing tricks (quick list)

- **CPU for RAM, always**: derive in thunks; `computed` only when it saves
  more subscriptions than it costs.
- Preload everything preloadable (code+consts → flash); watch gotcha 13
  (const-only at module top level) and the ~15.9KB mod boot ceiling.
- One shared behavior class, handlers as fields (done in jsx-runtime).
- Inline subscriber storage: null → single ref → array-on-demand (done).
- Recycle Piu nodes; never churn node objects per frame (VirtualList).
- Byte-pool collections + windowed materialization (Store + VirtualList).
- Bitmask sets for bounded id spaces: deps, dirty flags, freelists.
- Snapshot-free hot loops: no for-of/spread/slice in notify/unsubscribe.
- Numbers over strings in signals; format at the Label binding.
- Images: pixels in native heap / flash — never in XS (Texture, SVGImage).


## Code-review pass (post Stage 1+2) — findings

Reviewed: signals.js, flow.js, jsx-runtime.js, tools/lower.py, build.sh.

- **signals.js**: bit-31 arithmetic verified safe end to end (JS bitwise ops
  coerce to int32; `Math.clz32` coerces ToUint32 — `1 << 31` masks round-trip
  correctly through `g.u`/`g.sub`). Quarantine can never hand a live id to a
  snapshot: allocation excludes `q`, release only at cascade depth 0.
  `unsubscribe` is O(rows) per effect re-run — deliberate CPU-for-RAM.
  `dispose()` of ids is idempotent (`!g.eff[d]` guard). One behavioral note:
  effect ids are recycled, so a stale id held across a dispose could alias a
  NEW effect — owners drop ids at dispose so the runtime never does this;
  user code holding raw ids long-term should not either (documented here).
- **flow.js**: For's swap-pop sweep is correct under downward iteration
  (swapped-in elements always come from already-visited higher indices).
  `order` captures node refs before the sweep, so removal cannot skew the
  position pass. Duplicate-key and dispose semantics covered by tests.
- **jsx-runtime.js**: no heap regressions; per-binding cost is now thunk
  closure + reaction closure + packed id (the closures are entries 1-2 on
  the marginal list below).
- **lower.mjs** (replaced the regex lower.py): AST-based via the TypeScript
  compiler API — every rewrite is decided on the resolved binding SYMBOL
  (`checker.getSymbolAtLocation`), so shadowing, property access
  (`st.count()` vs a state `count`), and aliasing are correct by
  construction, not by heuristic. Ambiguous pairs bail to the object API.
  Guarded by `node tools/lower.mjs --selftest`.
- **Gap found and fixed during this pass**: For kept rows in a Map — now
  parallel arrays (commit 6bdf174).

## Marginal-benefit backlog (ranked: est. saving / effort)

1. **Recycled-row For** (fixed slots + index thunks, VirtualList-style,
   for row-COUNT-stable reactive lists): kills per-row createRoot + owner
   record + wrapper + rebuild churn. ~300-500 B/row, effort M.
   → This is the "I want 5 reactive rows" answer: the forbind5 boot cost
   is Piu nodes + closures per row, not the reactive graph.
2. **Shared-binding reaction**: jsx-runtime allocates a reaction closure
   per binding (`() => setProp(node,key,thunk())`). Store (node,key,thunk)
   in parallel arrays indexed by effect id + ONE shared reaction that looks
   up its triple — saves ~2-3 slots (~40 B)/binding. Effort M.
3. **Owner packing**: each createRoot allocates `{d:[]}` (~4 slots) — For
   rows each carry one. Parallel-array owner table keyed by root id:
   ~60 B/root. Effort M.
4. ~~esbuild-plugin lowering~~ **DONE** (tools/lower.mjs): the useState
   transform is now AST-based on the TypeScript compiler API — python is
   out of the pipeline, rewrites are binding-symbol-exact. RAM-neutral;
   the tooling-robustness win is banked.
5. **Stage 3 lowering**: same treatment for bare `signal()`/`computed()`
   in app code (→ S.sig / plain fn): ~50 B/signal. Effort S.
6. **Constant tables → preloaded ROM**: DOW/month names etc. as consts in
   the preloaded runtime instead of app modules: ~50-150 B/app. Effort XS.
7. **Runtime export pruning**: each export costs alias RAM; audit rarely
   used exports (useMemo?) once apps stabilize. ~tens of B. Effort XS.
8. **Flash string catalog** (`strings.dat` + offset table, read in place):
   only pays off with large static text; none in current examples. Effort M.

## Low-hardware technique coverage audit (which DOD/embedded patterns we use)

The whole codebase is applied Data-Oriented Design. Coverage vs the
standard low-hardware toolkit, with the remaining gaps as tracked tasks:

| Technique | Status | Gap → task |
|---|---|---|
| Structure-of-Arrays | ✓ (graph) | numeric value split ANALYZED → net-negative, see #17 |
| Object pooling / recycling | ✓ (rows) | VirtualList recycles; 5-live-rows proven (#18); dynamic-For subtree pool still open |
| Flyweight (share immutable) | partial | HandlerBehavior yes; per-binding reaction closure not → **#19** |
| SoA — owner records | ✗ | createRoot `{d:[]}` per root → **#19** |
| Compile-time codegen | partial | useState lowered; signal()/computed not → **#19** |
| Constant data → ROM | ✗ | DOW/month arrays in app modules → **#19** |
| Flash string catalog | ✗ | `.dat` + offset table for big static text (no example needs it yet) |
| Dirty-region / clip redraw | ✗ | SVGImage rotate invalidates the whole screen — CPU/battery, not XS heap; add `clip` |
| Bitset / swap-pop / arena / bit-tricks | ✓ | — |
| Recompute > cache (CPU for RAM) | ✓ | — |

Tooling: lowering is AST-based (raw TS Compiler API); ts-morph adoption is
under evaluation (**#20**). Lowering is Svelte/Solid-style compile-time
reactivity — it removes the closure/object BOILERPLATE, NOT the reactive
graph (ids are still allocated at runtime), so unlike react-pebble's
compile-away-reactivity model we keep 100% runtime dynamism. A pair that
can't be proven safe (getter/setter used as a first-class value) simply
BAILS to the object API — correctness always wins over the optimization.


## #17 typed numeric signal storage — ANALYZED, REJECTED (net-negative)

Considered storing packed-signal values in a `Float64Array` (numeric) +
side-table (non-numeric) instead of the current `G.val = []` JS array.
Rejected on architectural analysis:

- Packed-signal values ALREADY live in the CHUNK heap, not the scarce slot
  heap: XS stores JS-array elements in the array's contiguous items chunk
  (~16 B/element, numbers stored inline). The big win — deleting the Signal
  OBJECT (~3 slots) — is already banked by Stage 2. So a typed split can
  only shave chunk bytes, never slots.
- Numeric element: 16 B → 8 B (`num`) + 1 B (`tag`) = 9 B, saving ~7 B.
- Non-numeric element (STRINGS — every watchface's time/date signals): the
  8 B `num` slot is wasted PLUS the value still needs its side-table
  reference (~16 B) PLUS the tag → ~25 B vs 16 B, WORSE by ~9 B.
- Our real workload is string-heavy (`hm`, `day` in sloth; time strings
  everywhere) with a few numeric counters, so the split is a wash-to-loss.

Verdict: not worth the parallel-array + tag complexity for a chunk-only,
possibly-negative delta. The SoA win that mattered (indices instead of
objects for the graph) is done. Effort reallocated to #18/#19 (real slot
wins). Recorded per Rule 2 (don't ship an unmeasured/negative change).

## #19 runtime-internal SoA/flyweight — ANALYZED: amortization floor reached

Measured binding/owner counts in real examples: 2-4 reactive bindings and
1-4 owners per app. The remaining SoA/flyweight targets each need a FIXED
side-table (parallel arrays indexed by effect/root id, sized to the id
space ~32); that table only pays once the per-item saving × N exceeds the
table's fixed cost — break-even around N ≈ table size. At 2-4 items/app it
is NET-NEGATIVE, the same reason #17 failed.

- **Shared-binding reaction** (one reaction + B_NODE/B_KEY/B_THUNK arrays):
  saves the per-binding closure (~2-3 slots) but adds 3 chunk slots/binding
  + a fixed registry + a bounded stale-node-reference leak. Net-negative at
  2-4 bindings. DEFERRED (revisit only for binding-heavy UIs, dozens+).
- **Owner packing** (createRoot {d:[]} → parallel table): same story at 1-4
  owners/app. DEFERRED.
- **Stage-3 signal()/computed lowering**: `signal()` → `S.sig` IS a real
  object→index win (no fixed table, same as the shipped useState lowering)
  — but ZERO current benefit: every example uses useState, none call
  signal() directly, and computed() is inherently runtime. SPEC'd for when
  direct signal() usage appears (extend lower.mjs: `const s = signal(v)` →
  `S.sig`, `s.value` read → `S.get(s)`, `s.value = e` statement → `S.set(s,
  e)`, bail on any non-.value use). Not implemented to avoid adding
  untested-in-practice complexity to a working tool for no current gain.
- **ROM const tables**: moving app-specific arrays (DOW) into the shared
  preloaded runtime ROMs them but charges every app; marginal. DEFERRED.

CONCLUSION: the optimization campaign has hit its natural floor. What paid
did so because it was NUMEROUS with a SHARED graph — the packed effect core
(effects are the most numerous object; the subscription graph is one shared
Uint32Array) and object→index lowering (per-signal, no fixed table). The
remaining targets are few-per-app, so their SoA/flyweight forms can't
amortize their fixed tables. Banked wins: packed core 273→176 B/pair
(-36%, +20% capacity), 5-live-rows via recycling (raw For fxAborts),
useState lowering (RAM + smaller archive), lazy multiscreen (O(1 screen)).

## #20 ts-morph vs raw TS Compiler API — DECISION: keep raw API

tools/lower.mjs uses the raw TypeScript Compiler API. ts-morph wraps the
SAME engine with nicer ergonomics. Decision: KEEP the raw API. Rationale:
(1) zero new dependency — typescript is already required for tsc; ts-morph
would need a real install, at odds with the repo's `npx -y esbuild` /
no-node_modules build; (2) the transform is ~180 lines, works, and is
fully selftest-guarded; (3) ts-morph would mostly save the Program/host
boilerplate (~15 lines) — cosmetic, not a fragility fix. Revisit only if
the lowering grows to multiple transforms or needs cross-file type flow.
