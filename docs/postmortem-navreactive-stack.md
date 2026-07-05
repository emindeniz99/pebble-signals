# Post-mortem — navreactive's silent death was the JS value stack, not the boot floor

A multi-day misdiagnosis, its correction, the exact numbers, and the lesson.
Written to be read by the next person (or the next me) who sees an app die
silently at boot and reaches for the wrong tool.

## TL;DR

- **Symptom:** the `navreactive` example (a `Navigator` over a two-Label
  reactive screen) installed fine, then exited straight to the watchface at
  launch with no visible error — indistinguishable, on the surface, from an
  out-of-memory boot death.
- **What we believed for days:** it crossed the *boot-slot floor* — too many
  interned symbols / module records / preload aliases — so the cure was a
  "flow diet" (shrink the runtime's symbol surface).
- **What it actually was:** `fxAbort **JavaScript stack overflow**`. The app's
  initial render recursed too DEEP and blew the mod's **fixed XS value
  stack** — a *different* fixed budget than the 32 KB arena and than the
  boot-symbol floor.
- **The number:** the XS value stack is **6144 bytes = 384 slots** (16 B per
  slot), fixed at machine creation, un-growable from a mod. navreactive's
  initial render peaked at a **sampled 6128 B = 383 of 384 slots (99.7 %)** —
  one slot under the ceiling *after* the fix; before the fix it went over.
- **The fix:** remove **two stack frames** from the deepest render path
  (inline `asNode` inside `Navigator.swap()` so `build(nav)` is called
  directly instead of through `asNode(() => build(nav))`). Two frames was the
  *entire* margin. It now boots on gabbro (Round 2) and emery (Time 2).

## What the JS value stack actually is (the "neyin derinliği" answer)

XS (the JavaScript engine the Pebble firmware runs) executes bytecode against
a **value stack**: a contiguous array of `txSlot`s (16 bytes each on this
32-bit build). Every JavaScript function *call* pushes a **frame** onto it —
the callee, `this`, the arguments, the local variables, and the temporaries
the expression evaluator needs. When the function returns, its frame pops. So
"stack depth" = **how many nested JS calls are live at once**, measured in
slots, not in call count (each frame is several slots).

The stack has a **fixed size**, set when the machine is created:
`stackCount` slots. When a push would exceed it, XS calls `fxAbort` with
`"JavaScript stack overflow"`. On the Pebble mod machine that abort reaches
only the C-side log — the mod exits to the launcher with nothing on its own
log channel, which is why it *looks* like every other silent boot death.

This is **not the same** as the two budgets we usually fight:

| Budget | What it holds | Size (gabbro mod) | Overflow message |
|---|---|---|---|
| Slot **heap** | live JS objects/closures/signals | ~512 slots initial, grows within the 32 KB | `fxAbort memory full` |
| Boot **symbols/aliases** | interned archive symbols, module records | firmware-fixed, ~exact | *silent* (dies mapping the archive) |
| Value **stack** | live *call frames* (this post-mortem) | **384 slots / 6144 B, fixed** | `fxAbort JavaScript stack overflow` |

All three live inside the same 32 KB machine, all three are firmware-fixed for
a mod, and — critically — **all three fail as a silent exit to the launcher**.
That shared symptom is what let us misattribute one for another.

## The exact measurement (Rule 2: numbers or it didn't happen)

The XS instrumentation line (`kModdableCreationFlagLogInstrumentation`, one per
heartbeat) carries the stack live. Fields 12 and 13 are `Stack used` and
`Stack available`, in **bytes**. From a full navreactive boot on gabbro
(post-fix):

```
StackUsed=1824  StackAvail=6144   Modules=0   ← machine up, app not loaded yet
StackUsed=6128  StackAvail=6144   Modules=4   ← initial render PEAK: 383/384 slots
StackUsed=2592  StackAvail=6144   Modules=4   ← settled idle: 162 slots
StackUsed=2592  StackAvail=6144   Modules=4   ← …stays flat here forever
```

Two facts fall straight out:

1. `StackAvail = 6144` on **every** line → it is the fixed **total**, not a
   remaining count. 6144 / 16 = **384 slots**. That is the wall.
2. `StackUsed` **spikes to 6128 at the render, then drops to 2592**. So the
   field is the *instantaneous* depth, not a high-water mark — meaning the
   true transient peak is *≥* 6128 and (since it now boots) *<* 6144. In
   other words navreactive uses **all but at most one slot** of the entire
   stack during its first render, and essentially none of that headroom the
   rest of the time.

The spike lands exactly on the `Modules=4` line — the moment the app's initial
`render()` finishes building the tree. That is the deepest synchronous call
chain the app ever makes.

## Why navreactive specifically, and why "depth"

The deepest chain at first render, roughly:

```
render → createRoot → build()                     (app root)
  → jsx(Navigator) → Navigator() → swap()
    → createRoot   ← NESTED owner scope, opened INSIDE render's build
      → asNode → (() => build(nav)) → build(nav) → screen()
        → jsx(Column) → jsx(Label) → createHost
          → effect() → run() → (binding arrow) → thunk()
            → NAV.depth() → signal.value            (leaf, max depth)
```

Two things make this app pathological where a flat watchface (`watchms`,
which boots on the same runtime) is not:

- **Navigator opens a *nested* `createRoot` inside render's own build.** Every
  other control-flow node builds its children at the depth it is *called*;
  Navigator builds a whole second owner-scoped subtree from *within* the first
  one, roughly **doubling** the chain to the leaf binding.
- **The 2026-07 error-handling round quietly deepened the leaf.** The crash
  screen added a `mount()` wrapper frame; the boundary work added a
  save/restore in `run()`; the guarded binding wraps the thunk. None of these
  is wrong — but each adds a frame or two to the *universal* render path, and
  navreactive was already at 383/384.

The proof it was marginal, not a single bad line: a mix-and-match build where
we swapped one runtime module at a time between a known-booting commit
(`659c47c`) and HEAD showed that **new-jsx-alone OR new-signals/flow-alone
each overflow**, while old+old boots. No single commit "broke" it — the app
sat one frame under the ceiling and *any* increment pushed it over.

## The fix, and why two frames was enough

`Navigator.swap()` built its screen with:

```ts
appendChild(wrapper, asNode(() => build(nav)));   // asNode + its arg-arrow = 2 frames
```

`asNode(fn)` calls `fn()`, then if the result is itself a function calls it
again (the auto-thunk unwrap). Inlining that logic so `build(nav)` is invoked
directly in the `createRoot` body:

```ts
let s: unknown = build(nav);
if (typeof s === "function") s = (s as () => unknown)();
appendChild(wrapper, s as JSXNode);
```

removes the `asNode` call frame **and** the `() => build(nav)` arrow frame from
the deepest chain — behaviour-identical, ~15 lines, and it dropped the peak
from *over* 384 slots to **383**. navreactive booted on both platforms; 372
tests unchanged (pure refactor).

That two frames was the whole difference is the loudest confirmation possible
that this is a marginal-depth budget.

## Could we have measured it earlier? (yes — and this is the real lesson)

**Yes.** The `Stack used` / `Stack available` fields were in every
`instruments:` line the whole time. Had we read field 12 against field 13 —
"6128 out of 6144, one slot from the wall" — we would have seen a *stack*
problem, not a *heap* problem, on day one. We didn't, because:

- The failure *symptom* (silent exit to launcher) is identical to arena OOM
  and to the boot-symbol floor, so we pattern-matched to the budget we'd been
  fighting most recently (symbols).
- We read the **abort reason too late.** `fxAbort JavaScript stack overflow`
  is not `fxAbort memory full`. The single most decisive datum — the abort
  string — settles heap-vs-stack instantly, and it is right there in the boot
  log. Reading it first would have saved days.
- We trusted **inferred** numbers (symbol counts) over the **direct** signal
  (the abort reason + the stack gauge). Rule 2 says measure; we measured the
  *wrong thing* and then reasoned confidently from it.

Process fixes now baked into `debugging.md`:

1. On any silent boot death, **read the fxAbort reason before theorising.**
   `stack overflow` ≠ `memory full` ≠ (silent archive-map death).
2. A crash screen **also emits `instruments:` heartbeats** — "8 heartbeats"
   is *not* proof of a healthy boot. Screenshot to confirm real content vs the
   crash UI.
3. Watch `Stack used` vs `Stack available` (fields 12/13) the same way we
   watch `Slot used` vs `Slot available`. Approaching 6144 = a depth problem
   coming.

## Is it only at boot?

No — but in practice, effectively yes. The stack overflow fires on the
**deepest synchronous JS call chain**, whenever it happens. For a
`render()`-once, event-driven UI that deepest chain is the **initial render**
(build the whole tree in one go), which is at boot. Later interactions run at
*shallow* depth: a button press is `event → handler → nav.push → swap` — a
handful of frames on top of the event loop, nowhere near 384. So a deeply
recursive *runtime* operation (a hand-written recursive walk over a big
structure, say) could also overflow, but the reactive/render machinery only
approaches the wall at first render. **Design rule: keep the initial render
tree — and every control-flow node's per-screen frame cost — shallow.**

## Takeaways

- There are **three** fixed sub-budgets in a mod's 32 KB machine, not two:
  slot heap, boot symbols/aliases, **and the 384-slot value stack**. Know
  which one an abort names.
- **Read the abort reason first.** It is the cheapest, most decisive datum and
  it was in the log the entire time.
- On a mod, **an extra wrapper function in the render path is not free** — it
  is a permanent tax on every screen's depth. Control-flow nodes (Show, For,
  Navigator) should reach their children in as few frames as possible.
- Inferred metrics (symbol counts) are a proxy; when a *direct* gauge exists
  (the abort string, the stack instrument), the direct gauge wins.
