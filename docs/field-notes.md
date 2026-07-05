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

### Why `PRELOAD_PURE` is OFF — and where the RAM actually goes

A fair question: if a "pure" module ends up in the 32 KB arena either way,
what does routing it to the manifest's preload list buy you? **For a mod:
nothing.** On a Moddable *host*, `preload` executes the module at BUILD time
and freezes its objects into ROM, so they cost zero RAM at runtime. But a mod
**cannot preload** — `mcrun.js` nulls the preload list (§2.1). So a
"preloaded" mod module still *executes at load* and builds its objects in the
arena, exactly like a main-bundled one. Same RAM either way — and the manifest
route *adds* cost (an extra module record + its new-to-host symbols). That is
why it stays OFF: on a mod it is at best a wash, at worst fatal at a saturated
app class.

So where DO you put things to save arena? The real levers, ranked:

| Want to move… | Lever | Cost in the 32 KB arena |
|---|---|---|
| **Data** (tables, strings) | `romTable()` → flash resource | **~0** — read in place with `resource.slice()`; one transient string per read |
| **Code** you don't need yet | lazy `importNow` module | **0 until called**; only the active screen's objects live in RAM |
| Unused runtime exports | `PRUNE` (default on) | removed entirely (symbol + bytes) |
| Runtime export *names* | `SYMDIET` (default on) | one boot slot each, reclaimed |
| Pure module → "preload" | `PRELOAD_PURE` | **no gain on a mod** (executes at load anyway); avoid |

Bottom line: **`romTable` for data, lazy `importNow` for code.** `preload` is a
host-only trick we can't use; `PRELOAD_PURE` exists only because it works on
Moddable hosts and was worth measuring to confirm it does NOT help mods.

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
- **The error-logger that crashed the machine.** Our "make reactive errors
  visible" fix called `console.error(...)` — but the Pebble host console is
  `Object.freeze({log})`, **no `.error`** (host main.js:45; the vendored
  typings' `interface Console { log }` said so all along — a Rule 1 miss).
  On device the logger itself threw inside notify()'s catch and fxAbort'ed
  the machine. Fix: `(c.error || c.log).call(c, …)` — the logger can never
  throw. Bonus finding from the same probe: **first-run (creation-time)
  effect exceptions bypass notify() entirely** — only RE-runs are guarded.
- **"pebble logs prints nothing" ≠ the app is silent.** pebble-tool spawns
  pypkjs with stdout/stderr → devnull, and captures split across separate
  shell invocations die with their processes. The working recipe: ONE shell
  invocation — `pebble logs > f 2>&1 &` → `sleep 3` → `pebble install`
  (foreground) → `sleep 10` → `kill %1`. Device-proven (instruments
  heartbeats + pkjs lines + a live fxAbort stack trace captured).

---

## 5b. Case study — making errors visible (the log-transport deep dive)

The full story of one debugging campaign, kept as a teaching artifact. It
produced two runtime fixes, one API decision, four overturned assumptions,
and the log-capture recipe in `CLAUDE.md` Rule 3. If you only read one
section of this file, read this one.

**The itch.** A watchface rendered a blank label. The machine was healthy
(instruments heartbeats flowing), no crash, nothing in `pebble logs`. The
cause turned out to be a one-character API typo — calling a computed
(`greeting()`) instead of reading it (`greeting.value`) — but NOTHING told
us. A typo producing a silent blank screen is a development-killer.

**Step 1 — why was the log empty?** Suspecting the transport, we read
pebble-tool's own source (`pebble_tool/sdk/emulator.py`). Two smoking guns:
`_spawn_pypkjs()` launches pypkjs with `stdout=stderr=black_hole` (devnull)
unless the tool's logger is at DEBUG — so pypkjs's own crashes are
invisible by design. And our captures, split across separate shell
invocations, died with their processes. The fix is procedural, not code:
run listener + install in ONE shell invocation, install in the foreground
(recipe now in CLAUDE.md Rule 3; `pebble install -v` also surfaces the
qemu/pypkjs command lines). First success: 17 lines — instruments, pkjs
proxy chatter, heap reports.

**Step 2 — the first live capture caught OUR bug.** With logs flowing, a
deliberately broken binding produced, live from the device:

```
xsPlatform.c:125> fxAbort unhandled exception: TypeError: call: not a function (in q)
 at q ()
 at A ()
```

An error WITH a stack trace — visibility achieved. But the error was not
the typo's `Error("boom")`… it was our own logger. The "make errors
visible" fix called `console.error(...)`, and the Pebble host console is
`Object.freeze({log})` — **no `.error`** (host main.js:45; our own vendored
`interface Console { log }` had said so all along — a Rule 1 miss). The
logger threw inside notify()'s catch and took the machine down. Fix:
`(c.error || c.log).call(c, msg, rawErr)` — prefer error, fall back to
log, pass both the formatted string (name + message + stack via
`fmtError`) and the raw error object; the logger can never throw.

**Step 3 — why did the ORIGINAL typo not log?** Because the first probe
threw during the FIRST run of the binding effect — which executes inside
`effect()` creation at module load, a path that never passes through
notify()'s guard. Creation-time exceptions propagated out of render() and
aborted the module load. Second finding: **only re-runs were guarded.**

**Step 4 — where does JS logging actually GO on this firmware?** A probe
app called `console.log` at module load, after 2.5 s, and `trace()`
directly — none appeared, while C-side lines (instruments, fxAbort) did.
Reading `xs/platforms/pebble/xsHost.c` explained it: the visible lines
come from C's `modLog_transmit` → `APP_LOG`; JS `trace` on a release
firmware (no `mxDebug`) is a **no-op**. So the console fallback is for
debug hosts/xsbug/Node — on release firmware the reliable channels are
`__spError` (app-installed handler), the UI itself, and fxAbort. A
visible dev-log bridge (watch → AppMessage → PKJS `console.log`, which
DOES show as `pkjs>` lines) is designed on the roadmap.

**Step 5 — the API decision (binding guard).** Both findings pointed at
the same fix: guard the JSX binding body itself. `jsx-runtime` now wraps
every reactive binding in try/catch and reports with full context —
`binding 'string' on Label threw (kept last value)` plus name, message,
stack, and the raw error. This covers the first render too (the
creation-time hole), keeps the last good value, and lets the rest of the
app live. It is a deliberate DIVERGE from Solid (which propagates
creation errors): on a watch, a stale label beats exit-to-launcher — or
so we thought; Round 2 below overturns that default. Conformance law 24
pins this contract (today: as the NO-boundary floor); the device receipt
is an app whose binding throws every second running with **15
heartbeats, 0 fxAbort**, screen frozen at the last good value ("n=1").

**Assumptions overturned along the way** (Rule 2 corrections): "pypkjs
keeps dying" (partly environmental, but captures were the real issue);
"the session's emulator died of resource exhaustion" (wrong — 14 GB RAM
free; `install -v` booted fine; pipes/timeouts had misled us); "console
has .error" (it doesn't); "trace reaches pebble logs" (it doesn't, on
release).

**Want it to CRASH instead? Dev strict mode.** The containment default is
a product decision, not a limitation — the `__spError` hook already gives
you fail-fast when you want it. Install a handler that RETHROWS:

```ts
// dev builds only: log everything, THEN die loudly (fxAbort + stack)
globalThis.__spError = (e) => { /* your logging */ throw e; };
```

Measured contract (pinned by tests): the handler always runs FIRST — so
the full log/context is never lost — and the rethrow then propagates: a
first-render throw aborts module load, a re-run throw escapes the setter
(the handler fires twice on re-runs: once with binding context, once from
the notify layer). At this point the story read "default = contain &
survive; strict = log-then-crash" — Round 2 below revised the default.

**Round 2 — the frozen-label default was overturned (owner design
review, same 2026-07).** Living with the shipped guard for a day exposed
its product flaw: the "contained" default leaves the wearer looking at a
watchface that SEEMS alive but silently stopped updating — a frozen time
display is arguably worse than a dead app, because the user keeps
trusting it. Owner call: *telling the user the app crashed beats a watch
that lies.* So the containment default was replaced by a **top-level
error boundary that `render()` installs by default**:

- An escaped binding error (first render OR re-run) and a throwing
  `render()` build now ESCALATE: the whole reactive tree is disposed
  (owners tear down effects and cleanups; later notifies hit disposed ids
  and no-op), the Application is emptied FIRST (frees the old nodes on
  the tight arena before the error UI allocates), and a crash screen is
  painted — "APP CRASHED", the real error (name/message/stack, capped at
  380 chars), and `[any button: exit]`.
- The exit button rethrows the ORIGINAL error outside every guard:
  uncaught → fxAbort with stack in `pebble logs` → the host kills the
  mod. One press, two receipts (screen + log).
- `render(build, dict, {boundary: false})` = strict: log fully, then
  propagate (the old dev-strict semantics as a first-class flag).
- `__spError` still outranks everything — a handler owns the policy
  (contain by returning, crash by rethrowing), and the old contained
  behavior remains the floor when NO boundary exists (bare core, tests).

Two cosmetic findings came straight off device screenshots: XS (like V8)
opens `.stack` with the `Name: message` line, so `fmtError` was printing
the head twice (deduped — every line costs visible space on a 260 px
circle); and top-aligned text on the ROUND gabbro display clips into the
corners, so the crash Text is vertically centered (no top/bottom → Piu
centers the fitted content in the circle's widest band).

**The crash-loudness matrix (v2)**, for the record:

| Where it throws | Default (`render()` boundary ON) | `{boundary: false}` | custom `__spError` |
|---|---|---|---|
| Binding thunk (first render or re-run) | crash screen — tree disposed, error painted; select retries the build, back exits via rethrow | logged, then CRASH (first render: module-load abort; re-run: escapes the setter) | handler's choice; contained keeps last value |
| render() BUILD | crash screen | logged, then propagates out of render() | handler's choice |
| Bare core (no render(): tests, headless) | logged + contained — effect isolated, app LIVES | — | handler's choice |

So "no silent death" now means: either the wearer SEES the crash (screen
+ optional exit), or the app dies with a stack trace in the log, or an
app-installed handler explicitly chose otherwise. The one path that used
to be quiet-ish — the frozen label — is gone from the defaults.

Device receipts for the boundary (gabbro, QEMU): the `crashdemo` example
(a binding that throws at n=3) paints the crash screen while the machine
keeps 13-15 heartbeats with **0 fxAbort** and stays stable for minutes
after (`screenshots/crash-boundary-gabbro.png`); post-teardown signal
writes hit disposed effects and no-op as designed; the `watchface`
example re-verified clean on the same runtime (no regression).

**Round 3 — retry, screen packing, and the button receipt (owner
review of the shipped screen).** Three refinements, each from looking at
the actual device output:

- *Retry (Solid `reset`, React error-dialog guidance, on two buttons).*
  React's `createRoot` options (`onUncaughtError`/`onCaughtError`) and
  Solid's `<ErrorBoundary fallback={(err, reset) => …}>` both treat
  "clear the error and try again" as a first-class recovery. Our crash
  screen now maps it to the watch: **select = retry** (re-run the app
  build under a fresh root — component-scope state starts over,
  module-scope state survives; a build that immediately re-throws just
  repaints the screen), **back/up/down = exit** (rethrow → fxAbort).
- *Screen packing.* The log keeps the full multi-line error, but the
  SCREEN compacts newlines to `" ~ "` — one stack frame per line wasted
  most of a 260 px circle (device screenshot); as one wrapped paragraph
  the same 380-char budget fits in half the height. Insets adapt via the
  new `screen.round` flag (below).
- *`screen.round` / `screen.color`.* The Pebble host exposes the display
  shape on the compartment's `screen` global (`pebble-display.js`:
  `get round()`, `get color()` — PBL_ROUND compile flag underneath).
  render() now mirrors both onto our exported RN-style `screen`, so apps
  (and the crash screen: 26 px insets on round, 8 on rect) can adapt
  layout per panel. Piu itself has NO circular text flow — the native
  SDK's `GTextAttributes` round-flow never made it into the Piu port —
  so shape-aware insets are the honest tool.

**Correction (Rule 2): "QEMU can't inject buttons" was WRONG.** The
previous round claimed button presses weren't injectable because the
Pebble QEMU Protocol port is held by pypkjs and monitor `sendkey` isn't
wired to the GPIOs. Both facts are true — but the project's own
`tools/drive.py` already solves it (kill pypkjs, take the single-client
qemu port directly, send `QemuButton` + listen to `AppLogMessage`), and
it's even written up in `docs/debugging.md`. Re-ran the FULL loop with
it: crash screen → **select** → face reborn at n=0
(`screenshots/crash-retry-gabbro.png`) → crashes again at n=3 →
**back** → "Install an app to continue"
(`screenshots/crash-exit-gabbro.png`), with the kill's
`fxAbort unhandled exception: Error: demo boom at n=3` + stack arriving
on the drive log channel. One delivery quirk, for the record: the
firmware persists app-log records and ships them when a NEW log session
attaches, so a kill's fxAbort line can show up timestamped into the
NEXT drive session — a second run whose dumps prove the machine alive
13+ s after the crash (no spontaneous abort) pinned the causality.

**The moral:** every layer of this stack can silently eat an error — the
spawn (devnull), the shell (split invocations), the runtime (unguarded
first runs), the logger itself (missing method), the firmware (trace
no-op). Visibility had to be won at each layer separately, and each win
was only trustworthy with a device receipt.

**Round 4 — the OPT-IN per-subtree `<ErrorBoundary>` (Solid parity), and
an alias-budget lesson re-learned the hard way.** The default crash
screen is the app's last resort; Solid's real feature is a *local*
`<ErrorBoundary fallback={(err, reset) => …}>` that contains a failure to
one subtree and keeps the rest of the UI alive. We built it in `flow.ts`.

- *The routing problem.* A binding catches in its own guard, but a
  re-run throw happens on a later `notify()` turn — outside any build —
  so "which boundary owns this effect?" can't be answered by a call-stack
  walk (we have no parent-owner pointers, unlike Solid's owner tree). The
  answer: tag each effect with its boundary AT CREATION. `Graph.z[e]` =
  the owning boundary (a lazy sparse array, null until the first
  `<ErrorBoundary>` — a boundary-free app allocates nothing); `Graph.c` =
  the boundary in scope right now, set by `withBoundary()` during a build
  and re-established by `run()` so a boundaried effect's own re-run and
  any effect it spawns both inherit it. `report()` became the single
  router: `__spError` > nearest boundary (`Graph.c`) > terminal sink.
  Nesting falls out for free — a throwing fallback is built under the
  PARENT boundary, so it escalates outward, never loops.
- *The re-entrancy bug (found by coverage, not luck).* A creation-time
  binding throw fires `onError` SYNCHRONOUSLY mid-build; without a guard
  the orphan children tree then mounts on top of the freshly-painted
  fallback (the same shape as render()'s `panicked` flag). And the
  `if (shown)` escalation, if it called `report()` while `Graph.c` was
  still self, looped forever — fixed by escalating through
  `withBoundary(parent, …)` so the scope is correctly re-established.
- *ALIAS-BUDGET LESSON, re-learned (Rule 2).* First cut named the two
  Graph fields `cb` and `bnd`. Measured: the `boundary` example DIED at
  boot with `fxAbort memory full`, and a NON-EB app (watchface) jumped
  147→ from ~141 symbols. Cause: `cb`/`bnd` are new-to-host symbol names,
  each costing a boot slot (gotcha 13 / the boot-floor). The file's own
  rule — right there in the Graph comment — is "field names must be
  SINGLE LETTERS already in the minified symbol table." Renaming to
  `c`/`z` recovered the symbols (watchface back to 144) and it booted
  clean. I'd read that comment and ignored it; the device caught me.
- *Device status (honest).* watchface — which now exercises the new
  `run/notify/report/effect/dispose` boundary branches on EVERY reactive
  tick — boots and runs clean on gabbro, so the always-on core cost is
  boot-safe and does NOT regress non-EB apps. The `boundary` EXAMPLE
  itself is 147 symbols (watchface + 2 for the kept
  `withBoundary`/`getBoundary`, which prune away entirely when unused) and
  would not boot in this session — but neither would the known-good
  `navreactive` (151 sym) after repeated hard resets, i.e. the emulator
  session was degraded (the documented intermittent wedge), not the code.
  richlist boots at 149 symbols historically, so 147 should on a healthy
  session; the live catch/reset screenshot is queued behind a fresh
  emulator. The LOGIC is pinned by 364 Node tests / 100% branch coverage
  and conformance Law 26 (MATCH Solid) on real XS — build/re-run catch,
  fallback+reset, nesting, escalation, sibling-stays-alive, and the
  re-entrancy guard all covered.

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
