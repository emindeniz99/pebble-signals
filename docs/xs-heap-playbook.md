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

Integration status: **Stage 1 INTEGRATED** (runtime-internal; zero DX
change): `effect()` now returns a packed integer id, the Effect object and
its dependency array are gone, subscriptions are one u32 word per signal
row (lazy, stride 1, cap 32 live effects), freed ids quarantine during a
notification cascade so snapshot masks can never run a reused id. Signals
keep the `.value` object API (their objects go in Stage 2). Full Node
suite passes (96/96). On-device (emery, pre-trim build): slotbench
marginal cost 273 → 178 B/pair (−35%), capacity 20 → 22 pairs; the
fixed-overhead trim (single-word masks, lazy cln, 8-row initial table)
landed after that run. VERIFICATION DEBT: example re-runs (forbind/list)
+ post-trim ramp are pending — the QEMU emulators wedged (frozen first
boot on both platforms) at the end of the session. An earlier forbind
"crash" observation is CONFOUNDED (the firmware was on its recovery
screen from a prior ramp death — gotcha 1), so treat it as unproven.

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
