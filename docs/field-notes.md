# Field notes — how we found it

A lab notebook for the signal-piu memory work: **where** we looked, **what**
we read in the firmware/SDK source, **which tools** we built, and — just as
important — **the wrong turns**. If you are reading this later trying to
understand *why* a decision was made, or you are on the same XS-mod frontier
for a different library, this is the map.

Two house rules govern everything here (from `CLAUDE.md`):

- **Rule 1 — docs first, then source.** Read the official Moddable/Pebble
  docs, then cross-check against the SDK source to learn *why*.
- **Rule 2 — measured numbers or it didn't happen.** Every limit is an
  on-device (QEMU) measurement. When a conclusion is overturned, we correct
  it *explicitly* — the wrong turns below are kept on purpose.

The whole game is one constraint: **the XS "arena" (JS heap) is firmware-fixed
at 32 KB**, and a mod cannot enlarge it. Everything else is a consequence.

---

## 1. The map — where the truth lives

These are the exact files we read, and what each one settled. Paths are under
the installed SDK (`$SDK = ~/.local/share/pebble-sdk/SDKs/4.17/toolchain/moddable`).

| File | What it settled |
|---|---|
| `$SDK/tools/mcrun.js` | **Mods have no preload.** It prints `Warning: preload is unavailable in mods` and sets `this.preloads = null`; the manifest's `preload` list is ignored. |
| `$SDK/build/devices/pebble/modules/archive-resource/ArchivePebbleResource.c` | **The mod archive is loaded into the app heap.** On QEMU it is `malloc`'d whole (via `applib_resource_mmap_or_load`), so the archive size ceiling *is* the native app-heap. |
| `$SDK/build/devices/pebble/modules/rocky/pebblesystem.c` | `applib_resource_mmap_or_load` returns a pointer into `gSystemResources` when mmappable, else `c_malloc`s a copy — the mechanism behind the ceiling. |
| `$SDK/build/devices/pebble/host/main.js` | **Where `importNow` comes from.** Line ~169 the host wraps the mod archive: `importNow(specifier) { return state.mod.importNow(specifier); }` and passes it into the app compartment. Our bare-global `importNow(...)` is *this* wrapper. |
| `$SDK/typings/modules.d.ts` | `Modules.importNow(name, namespace?)` — the **standard Moddable** API our Pebble wrapper delegates to. (We were briefly wrong that importNow was Pebble-only — it is not.) |
| `$SDK/documentation/xs/mods.md` (public repo) | The official mods guide. Confirms, in prose, what we measured: mods can't preload, symbol IDs are remapped to the host at load, mods create many host-unknown symbols. |
| `gabbro_sdk_debug.elf` (`$SDK/../qemu/`) | The firmware's interned **symbol table** (`gxPreparation`). We extract it to know which names cost a boot slot and which are free. |

The single most useful realization: **every one of our hard-won measurements
is also stated, qualitatively, in `mods.md`.** Reading it first (Rule 1) would
have saved rounds — but measuring gave us the *numbers* the docs don't.

---

## 2. The findings — question → how we looked → answer

Each of these is written up in full in `xs-heap-playbook.md`; here is the
*investigation*, not just the result.

### 2.1 "Can I put code/data in ROM to dodge the 32 KB arena?"

- **How we looked:** built `--preload-pure` (route pure modules to the
  manifest's preload list), measured boot with instruments.
- **Wrong turn #1:** we assumed "preloaded = frozen in ROM = ~free," like a
  Moddable *host*. It boot-died anyway.
- **Source that explained it:** `mcrun.js` — mods have **no preload**. The
  manifest list is silently nulled. So a "preloaded" mod module still
  *executes at load*, building every module-level object in the 32 KB arena.
- **Official confirmation:** mods.md — *"modules in the host that are
  preloaded have already completed their imports at build time … the module
  imported by a preloaded module cannot be overridden by the modules of a
  mod."* Preload is a **host** feature.
- **Answer:** the only "big code" lever is **lazy `importNow` modules** —
  bytecode stays in flash (XIP), only the *active* screen's objects live in
  RAM. 100 KB+ of total code runs this way; see `lazyscreen`, `lazyone`.

### 2.2 "A screen with 40 components dies. Why? What's the unit of cost?"

- **How we looked:** generated cells with N thin arrow functions
  (`gen-boot-probe --code`, `gen-lazyone.py`) and bisected boot vs death.
- **Answer (the per-function-object law):** cost is **per module-level
  function object (~5–6 slots each), not per byte.** 4 KB of helpers dies as
  46 thin functions but boots as 8 fat ones. Proof pair: `lazymany` (70 thin
  arrows) **dies**; `lazypack` (same 70 bodies switch-packed into ONE
  function) **boots**.
- **What we built from it:** `tools/squash.mts` — an automatic pass that
  turns `const H = [arrow, arrow, …]` (used only as `H[i](args)`) into a
  single `switch` dispatch function. Turns the manual fix into a compiler pass.

### 2.3 "Which symbols cost a boot slot?"

- **How we looked:** `tools/host-symbols.py` extracts the firmware's interned
  key list from `gxPreparation` in the debug ELF; `tools/xsa-symbols.py`
  lists the mod archive's `SYMB` atom; `comm -23` gives **new-to-host**
  names.
- **Answer:** `fxMapArchive` interns every archive symbol at boot and remaps
  its ID to the host's; a name the host already knows is free, a **new-to-host
  name costs a slot.** At a saturated app, `"zk0" in bg` (one new symbol)
  **dies** while the 1-byte-different `"fill" in bg` (host-known) **boots**.
- **Official confirmation:** mods.md — *"When the mod is run by a mod host, XS
  automatically updates the symbol ID values in the mod's byte code so they
  match the host IDs"* and *"Mods may create many more symbols because they
  can contain code with many property names that do not appear in the host."*
- **What we built from it:** `tools/symbol-rename.mts` — the **symbol diet**.
  It renames each surviving runtime export wire name (`jsx`, `useState`, `S`,
  …) *and every matching import* to a host-known id from a curated
  obscure-constant pool (`BGRA32`, `CLUT16`, `LOG2E`, …). Measured: `list`
  47→41 new-to-host, `lazyscreen` 43→34. See §4 for why this is DX-neutral.

### 2.4 "How big can a lazy module get before it dies?"

- **How we looked:** `gen-lazyone.py` at many sizes, fresh emulator per point,
  reading `App bytes free` from instruments.
- **Wrong turn #2:** first pass reported a vague "112–131 KB band, suspect the
  internal-flash mod AREA size." Both halves were wrong.
- **Source that explained it:** `ArchivePebbleResource.c` → on QEMU the whole
  archive is `malloc`'d into the app heap. So the ceiling is **`archive +
  app-heap runtime needs ≤ free heap`** (≈130,768 B on gabbro's 128 KB
  class), and it *moves with the app*. Edge measured at **116,816 ✓ /
  117,042 ✗** with `App bytes free = 3,088` at rest.
- **Hardware caveat (unverified):** real gabbro flash may be XIP-mappable, in
  which case the copy — and this ceiling — may not exist on device.

### 2.5 "Does each Piu node cost native app-heap on top of the arena?"

- **How we looked:** `tools/gen-native-probe.mts` builds N Labels, reads `App
  bytes free` at N = 0/40/80.
- **Answer (overturned a premise):** **no second ledger.** `App bytes free` is
  *byte-identical* at 40 and 80 labels while the arena (chunk+slot) grows. The
  Piu content struct is an XS host chunk (`xsSetHostChunk`) — it lives *in the
  32 KB arena*, not the ~130 KB native pool, which holds only the archive +
  framebuffer. So there is ONE node ledger, the arena we already guard.

---

## 3. The toolbox we built

All zero-dependency, all under `tools/`. Each exists because a question had no
answer without it.

| Tool | Answers |
|---|---|
| `host-symbols.py` | Which names are free (host-interned)? Parses `gxPreparation` in the debug ELF. |
| `xsa-symbols.py` | Which names does *my* mod pay for? Lists the `SYMB` atom. |
| `gen-boot-probe.mts` | One-variable boot cost (data bytes / extra modules / a fresh symbol / code helpers). |
| `gen-lazyone.py` | A single lazy module at an exact target size (archive-limit bisect). |
| `gen-native-probe.mts` | Native app-heap cost per Piu node (the §2.5 measurement). |
| `squash.mts` | The lazymany→lazypack fix as a build pass (§2.2). |
| `symbol-rename.mts` | The symbol diet (§2.3). |
| `prune-exports.mts` | Drop unused runtime exports (removes a symbol *and* its bytes). |
| `reset-emulator.sh` | Hard-reset a wedged QEMU (see wrong turn #3). |

---

## 4. The optimization model — flags, and why your code never changes

Every heavy transform is a **build-time flag with a safe escape hatch**, and
**none of them change the code you write.** You author normal TSX; the build
does the rest. This is the whole point: the DX is React/Solid-shaped, the
*output* is hand-tuned for a 32 KB machine.

| Flag (env / CLI) | Default | What it does | DX impact |
|---|---|---|---|
| `LOWER` / `--no-lower` | ON | Rewrites `useState`/`signal` call sites to the packed `S.*` API | none — you write `useState` |
| `PRUNE` / `--no-prune` | ON | Demotes unused runtime exports so minify DCEs them | none |
| `SQUASH` / `--no-squash` | ON | Array-of-arrows → one dispatch fn in lazy modules | none |
| `SYMDIET` / `--no-symdiet` | ON | Renames runtime export wire names to host-known ids | none |
| `TREESHAKE` / `--no-treeshake` | ON | Ships only the runtime modules the app imports | none |
| `PRELOAD_PURE` / `--preload-pure` | **OFF** | Routes pure modules to the manifest (opt-in; see §2.1) | none |
| `MINIFY` / `--no-minify` | ON | esbuild minify | none |

Two things worth internalizing:

1. **DX-neutral by construction.** The symbol diet renames `jsx`→`RGB332`
   only on the *shipped `.js` boundary* — the export/import specifier — never
   your source, never the `.d.ts`, never the local variable. You keep writing
   `import { useState } from "signal-piu"`. The rename is monotonic and
   collision-checked, so at worst it is a no-op; it can never break your code.
2. **Each optimization is individually reversible — but they are collectively
   load-bearing for RAM.** Flip ONE flag off and you get a correct build that
   still *fits* (measured: `counter` boots with `--no-prune` alone, or
   `--no-lower` alone, 0 aborts — the arena rebalances). That is how we
   *isolate* a regression (the #29 boot bug was found by bisecting with
   `--no-lower`). But do **not** read flags-off as a shipping mode: with ALL
   of them off at once, even the tiny `counter` **dies** with `fxAbort memory
   full` (measured: slot heap pinned at 8176, exhausted). `prune` (drops the
   unused runtime) and `lower` (halves slot cost per state) are not polish —
   they are what makes a saturated app fit in 32 KB. The output is always
   *correct*; it is not always *small enough*.

---

## 5. Wrong turns, kept on purpose

Honesty is a rule here (Rule 12 in the root `CLAUDE.md`: "fail loud"). The
mistakes taught more than the wins.

- **Wrong turn #3 — the flash-only emulator red herring.** When installs
  started hanging, we spent hours deleting the SPI-flash image. The real fix
  was wiping the *whole* per-platform PERSIST dir (`reset-emulator.sh`) — the
  state dir was corrupt, not the flash. (Rule 3 exists because of this.)
- **"ROM is ~free."** Assumed preloaded mod modules were frozen like a host's.
  They are not (§2.1). Cost us the first `--preload-pure` round.
- **"112–131 KB band, mod AREA size."** A lazy guess with a wrong mechanism.
  The real answer (§2.4) is the app heap, and the edge is a 226-byte window,
  not a round constant.
- **"Flags-off is always a safe, correct build."** Half true — corrected in
  §4. Each flag off *individually* still fits, but ALL off at once exhausts
  the arena (`counter` → `fxAbort memory full`). Found by actually building
  the all-off path (owner asked "do we test flags-off?"). Lesson: `prune` +
  `lower` are load-bearing, not cosmetic. Guarded now by `npm run
  smoke:flags-off`.
- **"importNow isn't in @moddable/typings."** Wrong. `Modules.importNow` is
  standard Moddable (modules.d.ts, mods.md); Pebble only wraps it as a bare
  global. Corrected in `globals.d.ts`.
- **"Classes are poor ROM tenants."** True *all-in-main*, false for lazy
  modules — `lazyklass` (40 methods) boots fine because methods share one
  prototype; the real cost is the method-name *symbols*.
- **data-to-Resource aborts.** `new Uint8Array(resource)` (whole-wrap) =
  memory-full; `String.fromCharCode.apply(...)` at render depth = JS stack
  overflow (6 KB stack). Safe path: ranged `resource.slice()` +
  `String.fromArrayBuffer`.

---

## 6. Us vs. the official docs

Where our empirical work landed relative to `mods.md`:

| Claim in mods.md (qualitative) | Our contribution (quantitative) |
|---|---|
| "Mods cannot preload modules." | Measured the *consequence*: per-function-object slot cost; the lazy-module workaround; the squash pass. |
| "XS updates symbol IDs to match the host." | Measured *which* names are free vs. new-to-host; built the symbol diet to exploit it. |
| "Mods may create many more symbols…" | `host-symbols.py`/`xsa-symbols.py` count them exactly (list app: ~48 new-to-host, ~8 of them runtime export wire names). |
| "…constrained resources put constraints on mods." | Pinned the archive ceiling to the app heap and the node ledger to the arena. |

The lesson is not "docs were enough" nor "we didn't need them" — it is that
**docs give the shape, measurement gives the size**, and you need both.

---

## 7. Useful links

- Moddable **mods** guide (read this first): <https://github.com/Moddable-OpenSource/moddable/blob/public/documentation/xs/mods.md>
- Moddable **modules.d.ts** (`Modules.importNow`, `Modules.has`, host/archive): <https://github.com/Moddable-OpenSource/moddable/blob/public/typings/modules.d.ts>
- Pebble's Moddable fork (only ~4 commits ahead of upstream — FFI privilege drop, timer guard): <https://github.com/coredevices/moddable>
- PebbleOS firmware (the C the mod runs against): <https://github.com/coredevices/PebbleOS>
- CloudPebble, the revived web IDE (server-side build + QEMU streaming): <https://github.com/coredevices/cloudpebble>
- pebble-tool (the `pebble` CLI we drive): <https://github.com/coredevices/pebble-tool>
- pypkjs (phone-side PebbleKit JS in Python — the emulator's fetch/localStorage bridge): <https://github.com/coredevices/pypkjs>

Our SDK version: **Moddable tools 8.2.3** (matches `@moddable/typings` 8.2.3),
Pebble SDK 4.17, gabbro + emery QEMU emulators.
