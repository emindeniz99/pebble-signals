# Draft issue for coredevices/pebbleos — Alloy/XS memory limits & silent startup deaths

> Status: DRAFT, ready to post. Everything below was measured on the SDK
> 4.17 gabbro/emery QEMU emulators while building
> [signal-piu](../README.md), a runtime-reactive UI library for Alloy.
> Each finding has an on-device repro; none are estimates.

## Summary

Alloy mods run inside a firmware-fixed 32KB XS arena with several
additional undocumented budgets. Exceeding ANY of them kills the app
**silently at startup** — no log line, no reboot, just an exit to the
launcher — which makes every one of these limits look identical to a
crash bug during development. This issue reports (1) the limits we
measured, (2) two places where firmware behavior contradicts the SDK's
own documentation, and (3) a request for a loud failure channel.

Environment: pebble tool v5, SDK 4.17, gabbro + emery QEMU emulators,
`projectType: "moddable"` mods, release builds.

## 1. `ModdableCreationRecord` sizes are validated, then ignored

`pebble.h` documents `stack`/`slot`/`chunk` as "0 for default",
implying nonzero values override, and Moddable's pebble-examples README
states "Applications can override the default memory configuration …
when calling `moddable_createMachine()`". Measured behavior: the record
is REJECTED unless all three are nonzero ("moddable.c:79 invalid
ModdableCreationRecord"), and then the sizes are ignored — 16K/16K and
32K/32K requests produce byte-identical instrumentation (chunk 8192
initial, slot heap growing to the same ceiling, 6144B stack, 32KB
static total). Only `.flags` takes effect.

**Ask:** either honor the sizes (within a documented cap) or fix the
docs and reject nonzero sizes loudly.

## 2. Enabling FFI reconfigures the machine into an unusable layout

Passing a non-NULL `fxBuildFFI` triggers a different creation path in
`__moddable_createMachine` (disassembled from the 4.17 gabbro SDK debug
ELF, ~0x2fbc0-0x2fbde):

```
chunkBytes = (staticSize - stackCount*16) / 2      // = 13,312B
heapCount  = chunkBytes / 16                       // = 832 slots, FIXED
modMachineAllowKernelHeap(0)
```

A mod whose live slot needs exceed 832 slots (13.3KB) dies at startup —
silently. Our runtime idles around ~1,100 slots, so FFI is unusable for
any non-trivial mod. Additionally `newHostFunction` caps FFI bindings
at 32 (`cmp #31`), and every FFI function name consumes a runtime
symbol via `XS->id()`.

**Ask:** give FFI machines a workable heap (or document the 832-slot
budget), and log the reconfiguration. FFI is otherwise the natural
escape valve for the 32KB arena (data in the ~122KB app heap), which
is why this matters double.

## 3. Mod boot deaths are silent, and the budget is slots/symbols, not bytes

Originally measured as an archive-size ceiling (15,859B boots, 15,948B
dies, inert padding); a later one-variable matrix (2026-07) showed the
real budget: `fxMapArchive` interns EVERY archive symbol at map time and
each module costs records + 2 ids, so at a saturated app one extra
new-to-host symbol flips boot→death (`"zk0" in skin` dies while the
1-byte-different `"fill" in skin` boots), while +1KB of inert string
data still boots. Nothing in the toolchain warns; `mcrun` and
`pebble build` succeed; the on-device abort produces no output on the
app-log transport.

**Ask:** surface `fxAbort` reasons at install/launch, and document the
mod symbol/module boot cost so toolchains can budget it.

## 4. Preload alias/key budget has ~zero headroom

Adding two top-level `function` declarations to a preloaded module —
never called — kills startup silently; the same code as `const` arrow
bindings boots. Writable module bindings consume alias slots from a
firmware-fixed budget the mod cannot see or grow.

**Ask:** expose/raise the alias budget, and make exhaustion loud.

## 5. All of the above (plus boot-time OOM) fail identically and silently

Arena OOM during mod load, archive overflow, alias exhaustion, FFI
reconfiguration: every failure is "app exits to launcher, zero log
output", because the app-log channel is not yet up. We spent multiple
full days bisecting these apart.

**Ask:** any early failure beacon — a reason code in a syslog line, a
`moddable_createMachine` return value the C shim could log, anything.

## 6. Mod archive is copied into the app heap — the size ceiling is the heap

`ArchivePebbleResource.c` loads the mod archive with
`applib_resource_mmap_or_load`; when resources are not memory-mappable
(the QEMU emulators), the WHOLE archive is malloc'd from the app heap.
Measured on gabbro (128KB class, 130,768B free after footprint), lean
one-lazy-module app, fresh emulator per point: 116,816B archive works
(instruments then idle at **App bytes free = 3,088**); 117,042B dies at
launch, silently. Archives above the whole free heap (e.g. 130,892B)
fail the initial malloc and die instantly — also silently. The ceiling
is therefore `archive + app-heap runtime needs ≤ free heap` and MOVES
with the app; nothing in the toolchain warns at build or install time.

**Ask:** (a) memory-map the archive where flash allows it instead of
copying (and document whether real hardware takes the mmap path);
(b) fail loudly — "load resource failed" never reaches the app-log
transport; (c) let `pebble build` warn when the archive approaches the
platform's app-heap budget.

## 7. Piu Pebble port crashes (all reproducible)

- Writing `.visible` on bound content crashes the firmware (first write).
- Swapping a bare `Label` as a container's direct child crashes;
  Container-wrapped subtrees swap indefinitely.
- A reactive property binding created inside a keyed-list row (an
  effect re-run context) kills startup; identical bindings in the
  initial tree are fine.
- Structural swaps generated by react-pebble's compiler REBOOT the
  firmware outright ("Install an app to continue") — cross-framework
  evidence that runtime scene-graph restructuring is fragile in this
  port.
- Any real-coordinate QEMU touch event reboots the firmware, even on
  static apps (emulator-side).

## 8. `fetch` is unusable from a normal-sized mod (arena)

Alloy's `fetch` proxies through PKJS on the phone
(`@moddable/pebbleproxy`), which is the correct and emulator-supported
design. The problem is the WATCH side: fetch's own allocations
(Response, Headers, URL, promise chains) abort with "fxAbort memory
full" when called from a mod already running a modest JS runtime (~85%
arena) — only a bare app (no runtime) leaves room. So a network app
cannot also have a real reactive UI in 32KB. A larger arena (see #1)
would make `fetch` usable alongside a UI.

## 9. Font lookup contradicts the font table

The firmware's font table lists families like `Bitham-Bold`, but
`"42px Bitham-Bold"` throws inside render (leaving a black Application
— another silent-looking failure). The working syntax is CSS-like:
`"bold 42px Bitham"`. Documenting the accepted grammar would save the
next developer a bisection.

## 10. Mods cannot preload — the single biggest RAM lever is host-only

`mcrun.js` warns "preload is unavailable in mods" and nulls the preload
list (the manifest's `preload` array is silently ignored). Host builds
freeze preloaded modules into the ROM prep (xsl), but a mod's modules
ALL execute at load, building every module-level function object and
structure in the 32KB machine. On a firmware-fixed 32KB machine this is
the dominant constraint. Measured (gabbro, fresh emulator per cell):

- Every module-level function object costs ~5-6 slots at module load,
  exported or not; call-time closures are transient and effectively
  free. 4KB of helpers dies as 46 thin functions, boots as 8 fat ones.
- The cost law holds at RUNTIME load too, not just boot: a lazy
  (non-preloaded) module with 70 thin arrows dies at its `importNow`,
  while the SAME 70 bodies packed into ONE dispatch function (a switch)
  load and run. We now ship an automated build pass that performs that
  switch-packing — a transform that exists only because mods cannot
  freeze modules the way hosts can.
- Classes are fine tenants (methods share one prototype object); the
  real cost is their method-name symbols, which `fxMapArchive` interns
  eagerly for the whole archive at boot.
- Lazy `importNow` modules are the workable big-code path (100KB+ of
  total code runs this way, only the active screen's objects in RAM),
  but they cannot own frozen module-level state and every load replays
  the per-function cost.

**Ask:** support preload for mod archives (xsl already implements the
freeze for hosts), or document the intended alternative for RAM-tight
mod code. This would obsolete an entire class of userland workarounds
(switch-packing compilers, per-screen module splitting).

## 11. ROOT CAUSE: `mcrun` nulls BOTH escape valves for mods (creation + preload)

Sections 3/4/10 are three faces of one mechanism. `tools/mcrun.js` — the
mod builder, stock Moddable Tech, not a Pebble patch — does, after parsing
the manifest:

```js
this.creation = null;   // the "creation" section is DISCARDED for mods
this.preloads = null;   // preload is DISCARDED for mods
```

So the two levers Moddable gives a HOST to control exactly these budgets
are both unavailable to a mod:

- `"creation": { "keys": {...}, "stack": …, "static": … }` would size the
  runtime key (symbol) array and the machine — the direct fix for the
  boot-symbol floor (§3). **Measured (2026-07):** adding a full `creation`
  block to a mod manifest produces a **byte-identical archive** (navreactive,
  15,198B, 43 new-to-host symbols, both with and without) — confirming
  `mcrun` ignores it. A mod inherits the firmware's ONE fixed pre-built
  machine and cannot resize it.
- `preload` (freeze modules into the ROM prep via `xsl`) would remove the
  per-module-object load cost (§10). Nulled, so every mod module executes
  in the live 32KB machine at load.

The net effect: a mod's only headroom is (a) fewer distinct new-to-host
symbol names, (b) fewer modules, (c) fewer top-level writable bindings —
all userland micro-optimizations against a ceiling the mod cannot see or
raise. A three-module reactive UI (signals + jsx-runtime + flow) plus a
default error-handling layer already sits at that ceiling on gabbro.

**Ask (concrete, and now tractable since PebbleOS + Moddable are open
source):** any ONE of —
1. let a mod's manifest carry a `creation` section through `mcrun` into the
   archive, and have `moddable_createMachine` honor `keys`/`static` (§1 says
   the firmware currently validates-then-ignores the record sizes);
2. implement mod preload (`xsl` already freezes modules for hosts);
3. raise the firmware's fixed machine defaults (heap 512 +64, keys 32 +32,
   per the 4.17 gabbro creation struct) — costs static RAM for every app.

Even documenting the exact per-symbol / per-module / per-alias boot budget,
so a toolchain can refuse the build instead of shipping a silent boot death,
would remove an entire class of multi-day debugging.

## Repro availability

All numbers come from XS instrumentation logs
(`kModdableCreationFlagLogInstrumentation`) driven by a deterministic
QEMU harness; repro projects and the measurement scripts are available
on request.
