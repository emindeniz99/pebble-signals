# Design journey — why signal-piu is the way it is

> This is also the **comparison-to-alternatives** page: the options table
> below covers React/VDOM ports, compile-time reactivity (react-pebble) and
> hand-written Piu; the measured react-pebble head-to-head lives in the
> README ("vs react-pebble"), and the per-API mapping in
> [api-parity.md](api-parity.md).

This is the long version of "what did we evaluate, and why did we land here?"
If you're wondering *"why not just use React / a VDOM / Solid directly?"*, this
is the answer. Every decision below is forced by ONE fact: the Pebble
firmware gives a Moddable XS app a **fixed 32KB JavaScript heap** (the "arena")
— measured, not negotiable (SDK 4.17, README gotcha 15). CPU is comparatively
free; RAM is the whole game.

## The problem

Build a **runtime, data-driven** reactive UI for new Pebble watches
(gabbro 260×260, emery 200×228) that renders to **Piu** (Moddable's retained
scene graph) via **Alloy** — with a React-ish authoring experience — inside
32KB. "Data-driven" is the load-bearing word: watchfaces are static, but *apps*
(lists, menus, live data) need trees whose shape is decided at runtime.

## Options we evaluated

| Approach | What it is | Why we rejected it (or didn't) |
|---|---|---|
| **React + react-reconciler** | Custom host renderer under real React | React + reconciler + fiber is 100s of KB and assumes a GC-generous heap. DOA at 32KB. |
| **Preact** | 3KB React-like with a VDOM | Smaller, but still a **VDOM**: keeps a virtual tree in RAM and diffs it every update. On 32KB the second tree IS the budget. Also assumes browser globals. |
| **Any VDOM** | Diff a virtual tree → patch | Two costs we can't pay: the retained virtual tree (RAM) and the per-update diff (transient allocation exactly when the arena is fullest). |
| **react-pebble** (the sibling project) | Resolve reactivity at **compile time** (Node perturbation-diff), emit static Piu | Brilliant for watchfaces — **zero JS on the watch**, immune to the 32KB arena. But it can only emit *precompiled variants*; it cannot build a tree whose shape depends on runtime data (a list of N rows from a store). That's exactly what we needed. |
| **MobX** | Proxy-based observables | `Proxy` traps + the observable graph are heap-heavy; XS supports Proxy but it's the wrong tool at 32KB. |
| **SolidJS directly** | Fine-grained signals, no VDOM, compile-time JSX | The *model* is exactly right (see below) — but Solid's compiler (`babel-plugin-jsx-dom-expressions`) targets the **DOM** and assumes browser primitives. We couldn't reuse it; we had to build our own JSX runtime + Piu bindings + a lowering pass. |
| **Signals / fine-grained reactivity (the Solid MODEL, our own impl)** | Components run ONCE; reactive reads subscribe; updates flow to individual property writes; NO VDOM | **CHOSEN.** No virtual tree (RAM), no diff (transient allocation). An update is one effect run + one Piu property write. Runtime-dynamic structure via `Show`/`For`/`Navigator`. Fits 32KB. |

## Why runtime reactivity (and not compile-time like react-pebble)

react-pebble proves you can *delete* reactivity at build time and ship static
Piu — unbeatable for a watchface. But "a todo list with a live store", "a
menu you can drill 100 levels into", "5 rows re-reading a signal" are
**runtime-shaped**: the tree doesn't exist until data does. Compile-time
perturbation can't enumerate that. So signal-piu keeps a **tiny runtime
reactive graph** on the watch — the price of live structure. The two projects
are complementary: compile-away for static faces, runtime signals for apps.

## The Solid model, ported to Piu

- **Components run once.** No re-render. A component builds real Piu nodes a
  single time; updates flow through signals into individual property writes.
- **Read state by calling a getter** (`count()`), not `count`.
- **Reactive values are thunks** (`() => …`) because our JSX factory runs at
  runtime — it can't "defer an expression", only defer a *function*. (Solid
  gets `{count()}` without the arrow because its **compiler** rewrites the
  expression into an effect; we do the equivalent for `useState`/`signal` in
  `lower.mts`, and could extend it to auto-wrap JSX expressions.)

Three concrete differences from React (getter reads, run-once, thunk props)
are in the README; the full hook/primitive parity table is in
[`api-parity.md`](api-parity.md). **This is Solid-flavored, not a React
drop-in** — React code does not port unchanged.

## Everything after that is the 32KB arena talking

Once the model was fixed, every subsequent decision is a RAM trade (the trick
inventory lives in [`xs-heap-playbook.md`](xs-heap-playbook.md)):

- **Packed effect graph** (#15/#16): an effect is an **integer id**, not an
  object; subscriptions are **bitmasks** in a shared `Uint32Array`; the
  per-effect dependency array is gone (reverse edges implied by the forward
  masks). Measured ~2× cheaper than the object graph.
- **Compile-time lowering** (`lower.mts`, Stage 2/3): `useState`/`signal`/
  `computed` are rewritten to the packed `S.sig/get/set/put/computed` integer
  API at build time — the per-state closures and the `Signal` object never
  exist at runtime. Decided on the resolved TS **symbol**, so shadowing/
  aliasing are correct by construction; anything ambiguous bails to the object
  API. Idempotency-guarded (a second pass must be a fixed point).
- **Unlimited effects via multi-word stride** (#21): the subscriber mask grows
  from one u32 word (32 effects) to N words only when the 33rd effect is
  allocated — ≤32-effect apps pay nothing.
- **Byte-record Store**: collections as bytes in one `Uint8Array`
  (`[tag][len][payload]`), not objects — a row costs its payload, not ~450B of
  slots. This is what makes an "unbounded" `VirtualList` (O(rows) live nodes)
  possible.
- **No Proxy / Reflect / Map / Set** in the runtime: all heap-heavy on XS. The
  `Signal` uses plain accessors; owner tracking is a flat array; lookups are
  linear `indexOf` (rows are few, CPU is free).
- **One module, not three**: each preloaded XS module costs a module record +
  export aliases at boot; the ≤5-module budget is real, so signals+owner+hooks+
  store share one file. Files are **not** bundled/merged — they stay separate
  preloaded modules frozen into flash (ROM, ~free); tree-shaking (#25) drops
  *unused* modules from the preload list per app.

## Things we tried and rejected (with receipts)

- **Typed numeric storage** (#17, re-analyzed as #30): store numbers in a
  `Float64Array` (8B) instead of the JS `val` array. Rejected — small integers
  are already inline in XS slots (no box to remove), the win is only for rare
  float signals, and a shared signal-id space forces either a double-waste or a
  get/set-path mapping. Not worth doubling the most delicate code.
- **Runtime-internal SoA / flyweight for bindings** (#19): sharing binding
  records via a fixed side-table only amortizes past ~many items/app; a watch
  app has 2–4, so it's net-negative. Kept per-binding.
- **ts-morph / jscodeshift for lowering** (#20): raw TS Compiler API is
  zero-dep and enough for a single-file, single transform. Revisit only if
  lowering grows to multi-transform / cross-file type flow.

## Where it leaves us

A ~1,100-line, zero-runtime-dependency reactive core + JSX runtime + control
flow (`Show`/`For`/`VirtualList`/`Navigator`) that runs live, data-driven UIs
in 32KB — Solid's ergonomics, react-pebble's constraint, our own packed core
and compile-time lowering bridging the two.
