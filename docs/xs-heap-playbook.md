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

## Memory partitions — the size table

Consolidated sizes for every place a byte can live on this watch. "Measured"
= from XS instrumentation logs (`mdbl.c`) or an on-device probe this project
ran; "firmware" = fixed by the Moddable/Pebble build, not ours to change.

| Partition | Size | Basis | Volatile? | Costs XS heap? |
|---|---|---|---|---|
| XS **stack** | 6144 B | measured (instrumentation) | yes | — (part of the 32KB) |
| XS **slot heap** | ~8176 B initial, grows within the arena | measured | yes | THIS is the scarce one |
| XS **chunk heap** | 8192 B initial, GC-compacted, grows within the arena | measured | yes | bytes here (typed arrays) |
| XS machine **total** | **32768 B** (slot+chunk+stack, firmware-cloned) | measured, firmware | yes | the whole budget |
| Mod archive **boot cost** | no fixed byte ceiling — costs SLOTS (symbols, modules) + CHUNK (bytecode/data), see "The boot floor" below | measured (2026-07 matrix; supersedes the old "~15.9KB ceiling" — README gotcha 15 correction) | ROM | yes, indirectly: every archive symbol interns at boot; every module costs records + 2 ids |
| Native **app heap** | ~122–130 KB; holds the mod ARCHIVE + Poco/framebuffer — NOT per-Piu-node structs (measured flat vs node count, 2026-07) | measured (this project) | yes | no (separate heap) |
| Flash **resource area** | 256 KB, read-only | firmware (device manifest) | ROM | no — `Resource` views it in place |
| **localStorage** (PKJS bridge) | per-key/-app cap **UNVERIFIED** — measure before relying on a size | needs a probe | persistent | no (native/phone side) |
| **Background worker** (C only) | 10.5KB, separate pool | measured via examples/worker | no (no XS: `pebble_worker.h` lacks the Moddable API — compile-error receipt; and workers can't read resources, where XS bytecode lives) | persists via shared `persist_*` KV |
| **Phone** (PKJS + AppMessage/fetch) | effectively unlimited | — | persistent | no |

Two rows are deliberately not given a number: localStorage's per-app cap and
any Pebble "persistent storage" key limit. This project has round-tripped
strings through localStorage (memory ladder step 3) but has NOT measured its
ceiling, and Rule 2 forbids quoting a limit we didn't measure. If an app needs
to know, write a probe (grow a stored blob until write fails) and record the
number here. Do not assume the classic-SDK 4 KB persist cap applies to the
Moddable localStorage path without checking.

## Piu nodes live in the ARENA, not a second native ledger (2026-07)

We long assumed each Piu node cost TWICE — XS arena slots for the JS half
AND native app-heap bytes for the C half (layout box, draw state). MEASURED
and CORRECTED (`tools/gen-native-probe.mts`, N imperative Labels in a Column,
instruments at idle, fresh emulator per N):

| N labels | App bytes free | Chunk used | Slot used |
|---|---|---|---|
| 0  | 114,716 | 5,604 | 9,440 |
| 40 | 114,664 | 7,824 | 10,208 |
| 80 | 114,664 | 12,000 | 12,032 |

**App bytes free is FLAT** — byte-identical at 40 and 80 labels — while the XS
arena (chunk + slot) grows. The Piu content struct is an XS host chunk
(`xsSetHostChunk`), so it lives INSIDE the 32KB arena, not the ~122-130KB
native pool. That pool holds the mod ARCHIVE (playbook "Limit bisect round
3") and Poco's framebuffer/render state — NOT per-node structs. So there is
ONE node ledger to budget, the arena, and it is the same 32KB we already
guard. Approximate per-Label arena cost across the range: **~80 B chunk +
~30 slot-units** (noisy — instruments captures at an arbitrary GC moment; the
load-bearing, GC-independent result is the flat app-heap). Practical import:
a big flat list still dies in the ARENA (why `For`/VirtualList recycle O(1
screen) of cells), and the native pool is not a second wall to worry about
until the archive itself approaches it.

## The boot floor — slots and symbols, not archive bytes (2026-07 matrix)

What actually kills an app at boot. Found by the v1.5 one-variable probe
matrix (`tools/gen-boot-probe.mts` → `--app probe`; screenshot verdicts on
gabbro; boundaries replicated) after the "~15.9KB archive ceiling" model
failed to survive controlled probes. All probes share the same
navmany-class skeleton (2 labels, Navigator, ticking signal):

| Probe (ONE variable each) | xsa | main.js | Verdict |
|---|---|---|---|
| baseline | 12235 | 777 | **BOOTS** (4/4) |
| +1057 B inert string table in main | 13502 | 1938 | **BOOTS** |
| +1536 B same table | 14177 | 2531 | dies |
| +2069 B / +4 KB same table | 14781/17263 | 3085/5362 | dies |
| +1 top-level binding (`g={}` + dead loop) | 12304 | 814 | dies (3/3) |
| `"zk0" in bg` — ONE new-to-host symbol | 12264 | 799 | dies |
| `"fill" in bg` — host-known symbol (control) | 12265 | 800 | **BOOTS** |
| +1 module, preloaded (`app/data`) | 12347 | 764 | dies |
| +1 module, NOT preloaded | 12347 | 764 | dies |
| +1 module, id `pdata` / `runtime/data` | ~12340 | 764 | dies |
| +2 exports merged into an EXISTING module | 12304 | 764 | dies |

Mechanism (source receipts: `fxMapArchive` in the SDK toolchain's
`xs/sources/xsAPI.c`; creation struct read out of `gabbro_sdk_debug.elf`
`gxPreparation` = chunk 8192 +1024 incr · heap 512 slots +64 incr · stack
384 slots · keys initial 32, incremental 32):

- **Slot floor.** At a saturated app class the slot heap cannot grow (the
  32KB arena is fully committed), so anything that needs even ONE more
  boot slot dies silently (`fxAbort`, no log on our transport): a new
  interned symbol (keys grow 32-at-a-time but allocate slot-side), a
  top-level binding, a module record.
- **Symbols intern EAGERLY.** `fxMapArchive` interns every name in the
  archive's SYMB atom at map time — including symbols of modules that are
  never imported. Lazy `importNow` therefore saves chunk-side bytecode,
  NOT boot slots. Count yours: `python3 tools/xsa-symbols.py
  build/mods/gabbro/mc.xsa` (only new-to-host names cost; richlist boots
  at 149 total symbols while a smaller probe dies — the probe class is
  saturated, richlist's isn't).
- **Modules are never free.** +2 ids + records per module, ANY placement
  — which is why PRELOAD_PURE v1 (move pure data to a preloaded module)
  cannot be default-on: at saturated classes the FIXED module cost alone
  is fatal. (With slot HEADROOM the mechanism works and frozen data costs
  zero slots — see the lean-preload receipt in the v2 section below.)
  It is also why merging 5 runtime modules
  into 3 once fixed a boot death.
- **Chunk is the cheap direction.** Inert string/bytecode data costs
  chunk, which had ~1.2KB slack on this skeleton. Data-as-strings/bytes
  beats data-as-structure at boot exactly like it does in steady state.
- **The export-pruning #29 fix worked mostly as a SYMBOL diet**: every
  demoted export removes an archive symbol (a boot slot), not just bytes.
- **The export-RENAME diet (2026-07, `tools/symbol-rename.mts`, default
  ON):** an export that survives pruning still costs a slot IF its wire
  name is new-to-host — and the runtime's public names (`jsx`, `useState`,
  `S`, `render`, …) all are. Minification mangles the LOCAL name but keeps
  the export/import boundary spelling. The pass rewrites each surviving
  runtime export wire name AND every matching import (main.js, sibling
  runtime modules, AND lazy modules) to a HOST-KNOWN id from a curated
  obscure-constant pool (`BGRA32`, `CLUT16`, `LOG2E`, … — Commodetto pixel
  formats + Math constants no UI app references), so `fxMapArchive` finds
  the id already interned. It touches ONLY specifier clauses — local code
  is byte-identical — and is monotonic + collision-checked (a target
  appearing as any token in the bundle is skipped), so it can only lower
  the count. DEVICE-VERIFIED: list 47→41 new-to-host (boots + reactive),
  lazyscreen 43→34 (lazy screen loads + renders — the rename stays
  consistent across the runtime→lazy-module import boundary). NOT freed:
  property names (`.sig`/`.get`/graph props), which are interned by
  property access regardless of the export wire name — a source-level
  prop rename would be the next lever.

## v2: data-to-Resource — DEVICE-PROVEN (2026-07 deep dive)

The working successor to PRELOAD_PURE for DATA, proven end-to-end on gabbro:
the SAME 4KB station table that kills the probe class all-in-main at +1.5KB
**boots and live-decodes from the flash resource area** (screenshot receipt:
the probe label ticking through "station 0004 — sector 2 relay uplink…").
`tools/gen-boot-probe.mts --bytes 4096 --res` regenerates the whole probe.

Recipe (every step earned by a measured death):
- Pack the table as ONE binary blob — `[u16 count][u16 end-offsets][payload]`
  — bundled via the manifest `data` bucket. Boot cost: ~the decoder's ~220 B
  of bytecode; ZERO new-to-host symbols (verified — identical 47-symbol set
  as booting navmany); no module, no array structure.
- `new Resource("blob")` is a petrified HOST BUFFER viewing flash in place
  (Resource.c: `xsSetHostBuffer` + petrify). The pebble host injects the
  `Resource` global (host/main.js) — works from mods.
- **DO NOT wrap the whole resource**: `new Uint8Array(resource)` dies at
  boot with `fxAbort memory full` even for a 2-BYTE blob (measured).
- **DO NOT decode with `String.fromCharCode.apply`** at render depth: it
  spreads one argument per byte onto the 6KB JS stack — `fxAbort JavaScript
  stack overflow` (measured; the label thunk runs deep inside
  render→effect→pick).
- DO use ranged `resource.slice(a, b)` (native, returns a small transient
  ArrayBuffer copy of just the range) + **`String.fromArrayBuffer`** (the
  Moddable XS extension — ONE call, no stack spreading; host-verified
  symbol). Per-read cost = the entry's bytes, transient.

Why this wins where v1 lost: fxMapArchive interns MODULE symbols and charges
module records at boot, but the archive's RESOURCES atoms are only walked
and skipped — resource payloads cost nothing until sliced. Same reason
imgwatch's 24.6KB archive boots.

**And the lean-preload counterpart (owner pushback, measured same day):
v1's preload mechanism DOES work when the app class has slot margin.** A
lean skeleton (no ticker) + `--preload-pure` data module: 4KB boots and
reads on-screen; 8KB boots too; slot used is IDENTICAL at both sizes
(17104/18416 — the frozen array structure is genuinely in flash) while
chunk grows ~0.32×payload. The same 4KB module dies on the ticker skeleton
(fxAbort memory full) — the module's FIXED cost is what kills at zero
margin, not the data. So the data ladder is now: structured data + slot
margin → preloaded pure module (plain JS access, zero slot growth);
tight margin or bigger data → Resource blob (zero symbols, slice+decode);
truly huge or mutable → phone/persist.

Diagnostic receipts for the debugging that got here (now standing tools):
- `tools/host-symbols.py <sdk debug elf>` extracts the firmware host's FULL
  interned key list (1423 keys on gabbro 4.17) straight from
  `gxPreparation`; `comm -23` against `tools/xsa-symbols.py … list` shows
  exactly which of a build's symbols are new-to-host (navmany: 47 of 123 —
  including ALL Graph property names and every kept runtime export: the
  precise symbol-diet shopping list).
- The mod area is the MCU's INTERNAL flash, directly addressable (XIP):
  `kModulesStart` pointers are dereferenced raw (`xsHost.c`), so archive
  BYTES are true ROM — only structure (symbols/modules/records) costs boot.
- Live abort reasons ARE capturable: run `pebble logs --emulator gabbro` in
  the background and REINSTALL (auto-launch) — `fxAbort <reason>` lines and
  periodic `instruments:` heartbeats arrive on that channel (verify the
  capture is alive first: it intermittently loses the race and prints a
  TimeoutError instead). This replaces blind screenshot-only verdicts for
  boot deaths.

## Code in ROM — the smart-split campaign (2026-07, owner's goal)

**FINAL MECHANISM (mcrun source, closes the campaign's open question):
mods have NO real preload.** `$SDK/toolchain/moddable/tools/mcrun.js`
prints "Warning: preload is unavailable in mods" and sets
`this.preloads = null` — the manifest preload list is IGNORED. Everything
we called "frozen" (runtime modules, app/data) actually EXECUTES at boot;
its objects are built in RAM. This unifies every measurement in one
model: boot cost = per-function-OBJECT slots (~5-6 each) + array elements
in chunk + symbols + module records, while BYTECODE stays in XIP flash
(why 16KB of code boots: bodies never enter RAM) with a chunk-side
proportional load cost that kills by 24KB. Consequences:
- "preload-pure vs main" gains are about MODULE SEPARATION and class
  leanness, not freezing; some earlier pre-vs-main deltas were partly
  skeleton-class differences.
- **40KB TOTAL CODE: DEVICE-PROVEN (`lazyfat` example).** Five ~8KB
  arithmetic-fat lazy screen modules (archive 35,873B, main.js 709B):
  boots with modules=4; five SELECTs later instruments show **modules=9
  (all five loaded) with slot use up only ~64B** (17088→17152) and the
  fifth screen renders its computed value on-screen ("f(3) = 41065").
  Bytecode never enters RAM; only each screen's few function objects do.
- **ONE 40KB module ALSO works when loaded lazily (`lazyone` example,
  device-proven):** the same ~40KB as a SINGLE module (5 fat fns, archive
  34,394B / main 573B) importNow-loads at runtime and renders its computed
  value ("sum(3) = 216286"). The 16-24KB single-shot ceiling measured
  earlier applies to BOOT-time loading; a lazy runtime load of one big
  module clears it. Keep the function COUNT low either way.
- **The many-thin-components hazard + the compiler fix (both device-
  proven):** 70 thin arrows in ONE lazy module die at RUNTIME load too
  (fxAbort memory full) — the per-function cost is universal, so a screen
  built from ~40 tiny arrow components WILL blow up. Fix proven by the
  `lazypack` cell: the SAME bodies switch-PACKED into ONE dispatch
  function load and run ("70 bodies, 1 fn / H(3,5) = h3[72]"). The
  smart-split compiler therefore needs a SQUASH pass (inline small
  components / pack helpers into dispatch functions), not just splitting.
- **Size limit hunt (single lazy module, runtime load):** ~104KB source /
  71,069B archive WORKS ("sum(3) = 492831"); ~208KB source / 130,892B
  archive INSTALLS but dies at launch — practical archive limit is
  between 71KB and 131KB (bisect pending). Load speed: the 40KB and
  104KB modules loaded + rendered within the 3-4s driver step
  (no ms instrumentation yet).
- **Timer-deferred load + TRUE WATCHFACE: both device-proven (`lazyauto`).**
  A 10ms `setTimeout` importNow — firing right after the module body, i.e.
  after boot pressure passes — auto-loads the 40KB module with no buttons
  ("auto-loaded 40KB / sum(3) = 216286" renders by itself). The SAME app
  packaged as a real watchface (`watchapp.watchface: true`) installs,
  becomes the active face, and does the same. This is THE watchface
  pattern for big lazy code. ROUND 3 (owner asks): the timer works at
  **0ms** too, and the lazy module can OWN live reactive state — a clock
  (signal + setInterval started at lazy-load) ticks on the real-watchface
  build ("21:42:46" → "21:42:51" across two shots). Also the per-function
  law's precise scope:
  EVERY module-level function object costs at load (exported or not —
  lazymany's 70 arrows were unexported); closures created INSIDE a
  function at call time are transient and load-free.
- **#48 conveniences SHIPPED (2026-07):** `romTable(name)` in
  runtime/signals — typed accessor over a packed resource blob
  (`tools/pack-table.mts` packs a JSON string array; gen-manifest ships
  any `romTable("<name>")` literal's blob automatically; the `romtable`
  example renders a 200-entry ~10KB table live from flash, zero boot RAM;
  covered by node tests with stubbed host pieces). Plus a **squash
  advisory** in the build: a lazy module creating >16 function objects at
  load prints a warning pointing at the lazypack pattern.
- **Automated SQUASH pass (tools/squash.mts, default ON for lazy
  modules; --no-squash / SQUASH=0):** the lazymany→lazypack fix applied
  mechanically. A module-level `const H = [arrow, arrow, …]` whose every
  use is `H[i](args)` or `H.length` is rewritten to ONE dispatch
  function with a switch (call sites become `H(i, args)`, `.length`
  folds to the literal count). Deliberately narrow, bail-safe: exports,
  bare `H[0]`, escaping `H`, destructured/default/rest params, async
  arrows and `var` in bodies are all left untouched (the >16-fn advisory
  still fires for those). DEVICE RECEIPT: lazymany — 70 thin arrows that
  DIED at runtime load — boots and renders "h3(5) = h3[72]" with the
  pass on, zero source changes.
- **Folder-convention screen splitting (`autoscreens` example):** every
  `src/tsx/examples/<app>/screens/*.tsx|ts` auto-ships as a lazy module
  `app/screens/<name>` — no per-screen importNow literal needed, and the
  imported NAME MAY BE COMPUTED (`importNow("app/screens/" + name)`):
  because the whole folder ships and every file feeds the treeshake +
  prune keep-sets, the dynamic import can only reach shipped-and-scanned
  modules, so both scans stay ON. Each screen goes through the squash
  pass and the fn-count advisory individually. DEVICE RECEIPT: root →
  select loads screens/alpha, back, select loads screens/beta — both
  names computed at runtime from an array.
- **Limit bisect (round 3, SOLVED — corrects round 2):** round 2 said
  "112-131KB band, suspect mod AREA size" — both halves were wrong. The
  full bisect (gabbro, fresh emulator per point, lean lazyone cell):
  111,640✓ 112,495✓ 114,558✓ 114,726✓ 115,910✓ 116,504✓ **116,816✓ /
  117,042✗** 121,778✗ 126,845✗ 130,892✗ — the edge is a 226-byte window
  at ~116.8KB, and it is NOT a round constant (112KiB and 114KiB both
  probed and passed). MECHANISM (ArchivePebbleResource.c + instruments):
  the firmware loads the mod archive via `applib_resource_mmap_or_load`;
  on the QEMU emulator resources are not memory-mappable, so the WHOLE
  archive is malloc'd INTO THE APP HEAP (128KB class: 131,072 − 304
  footprint = 130,768 free). Receipt: the working 116,816B build idles
  at **App bytes free = 3,088** — archive + ~10.9KB of runtime app-heap
  allocations ≈ the whole heap. So the LAW is: `archive bytes + app-heap
  runtime needs ≤ ~130,768` — the ceiling MOVES with the app (a fatter
  Piu tree lowers it; our lean cell peaked at 116,816). Two death modes,
  one mechanism: >130,768 fails the malloc outright (the 130,892
  "installs, dies at launch" cell); 117K-130K mallocs the archive but a
  later runtime allocation fails. Hardware caveat (unverified): real
  gabbro flash may be XIP-mappable, in which case the copy — and this
  ceiling — may not exist on-device at all.
- **Class correction (lazyklass cell):** a 40-METHOD class in a LAZY
  module works ("sum = 2719" renders) — methods share ONE prototype
  object, so classes are fine ROM tenants when lazy-loaded; the real
  costs are the 40 method-name SYMBOLS (interned at boot: 158 in that
  build) and module-scope `new` (classifier keeps it in main). The
  earlier "classes are poor tenants" verdict applied to the all-in-main
  cell, not to lazy modules.
- SOLVED QUIRK: `romscreens` ran healthily (0 aborts, 5 modules) but
  showed WHITE — bisect proved the bug lived in the `--preload-pure` path
  (same app without the flag rendered black/fine). Root cause: the
  runtime-min prune keep-set scanned main.js + lazy modules + shipped
  runtime siblings but NOT preload-pure module files, so `jsxs` (imported
  only by app/screens.js — main.js uses just `jsx`) was demoted out of
  jsx-runtime and the frozen builders failed silently at render. Fix:
  build.mts now importScans `pureFiles` into the keep-set exactly like
  lazyFiles. Verified on gabbro: screens 1→2→3 render with text, back
  pops to 2. Lesson: EVERY shipped module — lazy, pure, sibling — must
  feed the prune keep-set; a module the scan can't see is a module the
  prune will break.
- The road to BIG TOTAL code (40KB+) is LAZY modules: `importNow` screen
  modules keep bytecode in flash until pushed and only the ACTIVE
  screen's objects live in RAM (lazyscreen + multilazy O(1) principle) —
  total code scales far past the boot ceiling because it never all loads
  at once.
- TRUE ROM-freeze for mods is an UPSTREAM feature request (xsl supports
  it for hosts; mcrun refuses) — filed in docs/upstream-issue.md.


Can helpers/classes/screens live in flash without paying the 32KB arena?
MEASURED (gabbro, `gen-boot-probe --code/--diet/--fat/--klass`, lean
skeleton, fresh-emulator verdicts):

| Cell | Verdict |
|---|---|
| 2KB code all-in-main (23 fns) | **BOOTS** — code in main is cheaper than data (bytecode is XIP; only function objects + dispatch materialize) |
| 4KB code all-in-main (46 fns) | dies (memory full) |
| 4KB code PRELOADED, 46 named fns (133 syms) | dies |
| 4KB code PRELOADED, 46 inline fns, DIET (118 syms) | dies — name symbols were NOT the killer |
| 4KB code PRELOADED, **8 FAT fns** | **BOOTS** |
| 4KB code PRELOADED, 16 fns | **BOOTS** |
| **16KB code PRELOADED, 8 fat fns (xsa 29,034B!)** | **BOOTS** — 4x past main's ceiling, and the final nail for the old "15.9KB archive ceiling" myth |
| 24KB / 32KB code preloaded | die — code ceiling between 16 and 24KB in this form |
| 4KB of class METHODS (44) | classifier keeps `new C()` in main (right call); 163 syms; dies — classes are POOR ROM tenants (per-method property symbols + per-function cost) |

The law this adds: **frozen code pays per FUNCTION OBJECT, not per byte.**
Same 4KB dies as 46 functions and boots as 8 — bodies are ~free (XIP
bytecode), function objects are not (mechanism — alias/record per frozen
function — still to be pinned in xsl source). Screens fit this perfectly:
a screen builder is naturally ONE big function — see the `romscreens`
example (screens module frozen via `--preload-pure`; instruments-verified
on device: 0 aborts, 5 modules loaded, healthy heartbeat).

Practical recipe for "lots of code from ROM" today:
1. Put big, pure, const-only functions in a preload-pure module — FEW and
   FAT (≤~16 per module measured safe at the lean class), up to ~16KB.
2. Screens: one builder per screen in a frozen screens module
   (`romscreens`); Navigator pushes them; no lower/auto-thunk inside pure
   modules, so explicit thunks only; no module-scope `new Style/Skin`
   (classifier rejects — inherit the render dict's style or create inside
   the builder).
3. Avoid classes in ROM modules; avoid many small helpers (either inline
   them into their callers — esbuild does this in main — or group them
   behind fewer fat entry points).
4. `build.mts` now prints `symbols: N` on every build — watch it.

## Firmware heap ceiling — you cannot grow the 32KB (mdbl.c finding)

The single most important constraint, and the most counter-intuitive:
**requesting a bigger JS machine does nothing.** Measured in `src/c/mdbl.c`
(SDK 4.17, gabbro/emery):

- The `ModdableCreationRecord` stack/slot/chunk fields must all be nonzero or
  the record is REJECTED (`moddable.c:79 invalid ModdableCreationRecord`, no
  machine starts) — so you must pass sizes...
- ...but the sizes are then **IGNORED**. Instrumentation reports the SAME arena
  (chunk 8192, ~8176 B slots, 6144 B stack, 32768 total) whether you ask for
  slot=16K/chunk=16K or slot=32K/chunk=32K. The JS machine is **cloned from the
  firmware's built-in creation config** (`"static": 32768` in the Moddable
  pebble device manifest). Only `.flags` (instrumentation, debug) takes effect.

Consequence for the "does adding native C code shrink the JS heap?" question:
the JS arena is a FIXED 32768 B carved out by firmware, independent of the app's
own native `main()` — your `window_create()` and any native allocations draw
from the *separate* ~122–130 KB native app heap, not the XS arena. So native
code does not "halve" the JS heap; on **4.17** the JS heap was not yours to size
— a constant the firmware hands you.

**CORRECTION / potential unlock (Rule 2, 2026-07 research).** The "sizes are
ignored" result is specific to our **4.17** emulator. Reading upstream
`coredevices/PebbleOS` `main` (`src/fw/applib/moddable/moddable.c`), the current
firmware DOES honor `stack`/`slot`/`chunk` — it maps them onto the `xsCreation`
record (`stackCount = stack/sizeof(xsSlot)`, `initialHeapCount = slot/…`,
`initialChunkSize = chunk`), all-or-nothing (any nonzero → all must be nonzero).
So on a **newer firmware than 4.17, a larger-than-32 KB arena may be
requestable from `mdbl.c`** — a real potential heap unlock, not a dead end. This
is NOT yet re-measured (the 4.17 emulator's instrumentation stream is currently
not attaching — see the emulator note; and 4.17 ignored the fields regardless).
Tracked in the roadmap: retest sizing when the SDK/firmware updates. Also
configurable on `main`: `.flags` (only two — `LogInstrumentation` + `Debug`,
both no-ops without a BT log listener) and `.fxBuildFFI` (custom native
bindings). Until then, treat 32 KB as the budget on 4.17 and keep optimizing
RAM — but the ceiling is a firmware VERSION artifact, not a law of physics.

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
  (const-only at module top level) and the boot slot/symbol floor (see "The boot floor").
- One shared behavior class, handlers as fields (done in jsx-runtime).
- Inline subscriber storage: null → single ref → array-on-demand (done).
- Recycle Piu nodes; never churn node objects per frame (VirtualList).
- Byte-pool collections + windowed materialization (Store + VirtualList).
- Bitmask sets for bounded id spaces: deps, dirty flags, freelists.
- Snapshot-free hot loops: no for-of/spread/slice in notify/unsubscribe.
- Numbers over strings in signals; format at the Label binding.
- Images: pixels in native heap / flash — never in XS (Texture, SVGImage).


## Code-review pass (post Stage 1+2) — findings

Reviewed: signals.js, flow.js, jsx-runtime.js, tools/lower.py, build.mts.

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
- **lower.mts** (replaced the regex lower.py): AST-based via the TypeScript
  compiler API — every rewrite is decided on the resolved binding SYMBOL
  (`checker.getSymbolAtLocation`), so shadowing, property access
  (`st.count()` vs a state `count`), and aliasing are correct by
  construction, not by heuristic. Ambiguous pairs bail to the object API.
  Guarded by `node tools/lower/cli.mts --selftest`.
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
4. ~~esbuild-plugin lowering~~ **DONE** (tools/lower/cli.mts): the useState
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
  direct signal() usage appears (extend lower.mts: `const s = signal(v)` →
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

tools/lower/cli.mts uses the raw TypeScript Compiler API. ts-morph wraps the
SAME engine with nicer ergonomics. Decision: KEEP the raw API. Rationale:
(1) zero new dependency — typescript is already required for tsc; ts-morph
would need a real install, at odds with the repo's `npx -y esbuild` /
no-node_modules build; (2) the transform is ~180 lines, works, and is
fully selftest-guarded; (3) ts-morph would mostly save the Program/host
boilerplate (~15 lines) — cosmetic, not a fragility fix. Revisit only if
the lowering grows to multiple transforms or needs cross-file type flow.

## Future / maybe (noted, not scheduled)

- **Recursive alias-following in lowering**: today `const p = setX` bails the
  pair. Could follow p's uses and lower them too — but requires whole-program
  flow analysis and is undecidable in the dynamic case (Rice's theorem: "what
  is this value at runtime" is not generally computable). Alias chains blur
  fast. HARD, low value (aliasing is rare), high risk. Revisit only with a
  real need + a bounded, provable analysis.
- **Type-directed storage (revives #17)**: the runtime-tag split was rejected
  (hurts strings), but the COMPILER knows the type — `useState(0):number` can
  lower to a typed-array-backed numeric signal (8 B chunk, no tag), strings
  stay generic, `any` stays generic. Each optimal, no runtime branch. Win is
  small (~8 B chunk / numeric signal) but positive. Needs the checker's
  getTypeAtLocation (works for primitive literals even without lib). Do it
  when we want maximal optimization; low priority.
- **ts-morph**: revisit if lowering grows to multiple transforms or needs
  cross-file type flow — then evaluate ts-morph / jscodeshift for the best
  ergonomics (see #20).

## Lazy-import / infinite nested screens (#23 research)

Moddable XS on Pebble supports **runtime module loading**, and it is the
*normal* delivery path — your app is not linked into firmware. The boot host
(`$SDK/toolchain/moddable/build/devices/pebble/host/main.js`) maps the app
archive (`mc.xsa`) out of SPI flash and imports it through an
`ArchiveCompartment`: `state.mod.import("main")`. It also injects a global
**`importNow(specifier)`** (synchronous) for the app to pull in more modules.

Findings (evidence in the moddable toolchain sources):
- **Dynamic import works**: both async `import()` and sync `importNow()` are
  compiled in (`xs/sources/xsModule.c`: `fxImport`, `fxRunImportNow`). They
  resolve **precompiled bytecode** from the flash archive — `eval`/`Function`
  are stripped, so you cannot compile source on-device.
- **`preload` = ROM-frozen**: modules in the manifest `preload` list run their
  bodies at build time and cost ~0 heap (our `runtime/*`). `main` is NOT
  preloaded — it loads into the 32KB heap on first import.
- **Bytecode is already O(1) in the heap**: module functions execute reading
  bytes straight from flash (`xsHost.c`: `fxMapArchive`/`spiRead`). Importing a
  screen module puts only its record + export bindings + top-level objects in
  the heap — never its code. So "screen CODE is O(1)" is largely already true.
- **Lazy pattern**: `importNow("examples/screenN")` on first visit defers a
  screen's heap cost until shown (the SDK does this for `device.files`).
- **True unload needs a child Compartment**: modules imported into the app's
  main compartment are pinned for the app's lifetime (`mxOwnModules` retains
  them) — no per-module eviction. To reclaim a screen's record/exports you must
  import it into a `new Compartment(...)` you drop on leave; coarse and
  compartment overhead is real, so it only pays for large screens — measure.

The `Navigator` primitive (runtime/flow.js) delivers the **arena** half today:
a screen STACK where only the TOP screen is built, so the node/effect arena is
O(1) at any depth (Node-verified, tests/flow.test.mjs).

**2026-07: layered and DEVICE-VERIFIED — the `lazyscreen` example (#27).**
SELECT calls the host's global `importNow("app/s2")`; the non-preloaded
module's bytecode loads from flash on that first push and renders; BACK
returns. Boot-floor discipline (see "The boot floor"): the module still
costs 2 ids + its interned symbols AT BOOT, so the lazy module exports
`default` only (host-known symbol) — measured whole-app cost: archive
11,330 B / 120 symbols, below the probe baseline despite the extra module.

## #30 re-analysis — type-directed numeric storage (revive #17)

The idea: the compiler knows `useState(0)` is `number`, so route numeric
signals to a `Float64Array` (8B, contiguous, no per-slot tag) instead of the
shared `g.val` JS array (~16B/slot on XS), with NO runtime type tag. Attractive
because it dodges #17's original objection (a runtime tag hurting strings).

Re-analyzed against the ACTUAL packed layout — it does not cleanly pay:

- **Shared-id double-waste.** Every packed signal draws a unique row id from
  `grow()` (that id is also its `g.sub` subscription row). If numeric values
  live in a `Float64Array` indexed by that same id and non-numeric values in
  `g.val` indexed by the same id, then BOTH arrays must be sized to the max id
  — a numeric row wastes a `val` slot and a non-numeric row wastes an `fval`
  slot. Net: +8B per NON-numeric signal to save ~8B per numeric one. Only wins
  when numeric signals outnumber non-numeric, and even then the fixed second
  array eats the margin at the 2-4-signal scale a watch app actually has.
- **Separate id spaces cost more.** Giving numeric signals their own dense
  `Float64Array` index (no wasted slots) breaks the shared subscription graph:
  a numeric signal would need BOTH a sub-row id and an fval index, i.e. two
  numbers per signal + a mapping on the get/set hot path. Worse than the box
  it removes.
- **The one clean variant is a behavior TRADE, not a win.** Make `g.val` a
  `Float64Array` by default and BAIL every non-numeric `signal()`/`useState`
  to the object API (a real `Signal`, unlowered). No double-waste, no routing.
  But then string/boolean signals lose packing (back to a ~4-slot Signal
  object) — a numeric-heavy app wins, a string-heavy app loses. Compile-time
  types remove the tag but NOT this storage-routing/sizing cost, which was #17's
  real reason for rejection.

Decision: keep #17's verdict. The dominant win (deleting the Signal object)
is already shipped in the packed core; ~8B/numeric-signal on top is not worth
the double-waste or the get/set-path mapping on a 2-4-signal watch app. If a
genuinely numeric-heavy app appears, revisit the `Float64Array`-default +
string-bail variant behind a build flag (like TREESHAKE) and MEASURE it there.

## Runtime type safety — typed-.js, NOT converted to .ts (measured decision)

The question "should the whole runtime be strict TypeScript, it's a library"
was answered with a measurement, not a preference:

- `strict` `checkJs` over signals.js / flow.js / jsx-runtime.js reports **163
  errors** — but the breakdown is: 90 implicit-any params (TS7006), 43
  implicit-any vars (TS7005), 11+7 implicit-any index/element, and a handful of
  unprovable-null (the lazy `Store` float scratch that `fl()` DOES initialize
  before use) + lib-strictness (`Uint8Array` where `apply` wants `number[]`,
  the `globalThis.__spError` hook index). Turn `noImplicitAny` and
  `strictNullChecks` off and the count is **ZERO real type bugs**.
- So a full `.ts` conversion would add ~163 annotations of ceremony to
  device-shipped files tuned to the boot floor, catch zero bugs, and
  ship a new transpile step we can't re-verify on device while the emulator is
  wedged (Rule 2).

Decision: keep the runtime as **typed-.js**. Its PUBLIC contracts are already
type-checked — `src/tsx/globals.d.ts` declares every export and
`tests/types.test-d.tsx` asserts the prop contracts under the strict
`tsconfig.check.json` (`npm run typecheck`). On top of that, `npm run
typecheck:runtime` runs a **lenient checkJs** over the runtime bodies as a
regression guard: it stays at 0 and will flag a genuine type error (wrong arg,
bad index) without the annotation burden. Convert to `.ts` only if/when a
device-verified transpile step is on the table AND strict typing starts earning
its keep (e.g. the runtime grows past what globals.d.ts can express). Today it
does not.

## Glitch-free reactivity — design spec (from Solid + Preact source)

**The problem (measured in tests/conformance.test.mjs, law 12).** Diamond A→B,
A→C, D reads B+C. Our push-based notify is depth-first EAGER: writing A runs B's
computed → notifies D → D runs with B-new-but-C-STALE (a glitch value, e.g. 13),
then C's computed runs → notifies D again → D runs correct (31). Two defects: D
runs twice, and observes one transient wrong value. Final value converges, so on
a 2–4-signal watch it's invisible — but it's a real divergence from Solid/Preact.

**Why Solid & Preact don't glitch (source-read).** Both make derived nodes
(computed/memo) **LAZY / pull-based**: a write never recomputes, it only MARKS
downstream dirty (cheap bit-flip). Recompute happens on READ, and the read
*pulls each source first* — the recursion `read → refresh(sources) → read` IS a
topological sort, so D is only ever computed after B and C are current, and runs
ONCE. Preact gates with per-edge `_version` + a global `globalVersion`; Solid
gates with two-color `state` (STALE/PENDING) + a global `ExecCount` and
`updatedAt` stamp. Neither builds an explicit schedule; recursion gives order.

**Cheapest scheme for OUR bitmask/id core (the floor).** We already have the
mark direction (per-signal `Uint32` subscriber masks) — that's the expensive
half in the libraries (Preact's 8-slot per-edge Node objects), and we get it
free. To go glitch-free we add only:
- a `Uint32 version` per node (signal + computed) — **+4 B/node**;
- a shared `dirtySet` bitmask (1 word / 32 nodes) — **~free**;
- make `computed` LAZY: recompute on read, gated by its `dirtySet` bit, pulling
  each source (recurse if the source is dirty) before running `fn`; bump its own
  `version` only if the output VALUE changed;
- effects run last, off the `dirtySet` bits, after memos settle.
- OPTIONAL equal-value cutoff (skip recomputing D when B recomputed to an equal
  value): a per-computed `seenVersions: Uint32Array[fanin]` — the source-id list
  a lazy computed needs for re-tracking anyway. Drop it and glitch-freedom still
  holds; you just occasionally recompute an unchanged-input node.

No per-edge objects, no linked lists, no topological sort — the recursion in
recompute is the sort. Cost: **~+4 B per signal and per computed + one global
bitmask.** This is the minimum known glitch-free construction and drops onto the
existing masks.

**MEASUREMENT (prototype, `tools/glitch-prototype.mts`, node:test — PROVEN).**
A standalone implementation of the design demonstrates the fix: the diamond
sink runs **once, straight to the correct value** (`seen === [4, 31]`) where the
shipped eager core produces `[4, 13, 31]` (two runs, one transient glitch). So
the design is validated end-to-end.

Building the prototype surfaced the real integration shape (and cost): glitch-
freedom needs (a) lazy computeds (recompute-on-read, pull sources first) AND (b)
an **always-coalesced notify** — every write defers + dedupes its subscriber
notifications so a sink reached by two paths runs once. We already have the
coalescing machinery (`batch()` unions subscriber masks); the change is to route
the normal `flush()` through it always, plus per-computed dirty/version state.
Estimated ~+4 B/computed + a global dirty word + ~30–50 lines (minified a few
hundred bytes). The remaining unknown is the on-device HEAP delta and any
notify-path perf cost — the emulator is currently too flaky to measure cleanly
(flow-apps won't launch, #29).

DECISION → **SHIPPED (2026-07 core round).** Integrated into signals.ts with
one refinement over this spec: validation is a GLOBAL write version (`G.y`)
checked on every computed read, not just a dirty bit — a dirty-flag-only
design can hand a stale computed to a sink that also reads the source
directly (notify order is id order, not topo order). Costs: one version
counter + one SoA triple (`G.x`) + per-effect owned lists (`G.w`), all under
single-letter property names (zero new boot symbols — the letters are in
every build's SYMB already); the old `cln` array and `cap` field were
deleted to pay for the new Graph slots. Net: −2 archive symbols vs the old
eager core, +767 B chunk bytecode. Law 12 = MATCH (V8 + real XS); navmany/
clock/coexist re-verified on gabbro. The first integration attempt WITHOUT
the symbol diet killed navmany at boot — the boot floor applies to our own
runtime too.

## Emulator stability note (session finding)

The QEMU/pypkjs emulator in this environment wedges easily under install
churn: a 2nd `pebble install` onto a running emulator, or several
reset+install cycles in a row, leaves it unable to render EVEN a known-good
app (screenshot/ping time out). `tools/reset-emulator.sh` + a single cold
install is the only reliable path, and even that intermittently needs the
documented retry. Consequence: some device conclusions this session
(notably the Navigator "swapped-screen reactive binding crashes" claim, #29)
are UNCONFIRMED — they may be emulator flakiness, not real crashes. #29 needs
a stable emulator to settle: reset, single-install a minimal reactive-
Navigator app, and only then trust the result. Do not chase it on a wedged
emulator.
