# API parity — React / Preact / Solid vs pebble-signals

pebble-signals is **Solid-flavored, not React-flavored**: components run ONCE (no
re-render), you read state by CALLING a getter (`count()`), and reactive values
are passed as thunks (`() => …`). So "hook parity" means *behavioral* parity
with Solid's primitives, not identical signatures to React's.

## What we have

| Primitive | pebble-signals | Closest in… | Notes |
|---|---|---|---|
| reactive value | `signal(v)` → `{value}` · packed `S.sig` | Solid `createSignal`, Preact `signal` | `.value` get/set; lowered to integer id at build |
| derived value | `computed(fn)` / `useMemo(fn)` | Solid `createMemo`, React `useMemo` | allocates one internal effect (see below) |
| side effect | `effect(fn)` / `useEffect(fn)` | Solid `createEffect`, React `useEffect` | auto-tracked; `useEffect` return = cleanup |
| React-style state | `useState(init)` → `[get, set]` | React `useState` | **getter is a call**: `count()`, not `count` |
| ref box | `useRef(v)` → `{current}` | React `useRef` | never notifies |
| batch writes | `batch(fn)` | Solid `batch`, Preact `batch` | N sets → one notify per subscriber |
| read w/o track | `untrack(fn)` | Solid `untrack` | |
| ownership/dispose | `createRoot`, `onCleanup`, `track`, `dispose` | Solid `createRoot`/`onCleanup` | subtree disposal |
| byte store | `createStore(size)` | (none — bespoke) | records as bytes, not a reactive store |
| control flow | `Show`, `For`, `VirtualList`, `Navigator` | Solid `Show`/`For`, RN FlatList/Navigation | components, not hooks |

## What we DON'T have (and whether it's worth it here)

| Missing | In | Verdict for a 32KB watch |
|---|---|---|
| `useReducer` | React | ✅ SHIPPED (trivial over useState) |
| `useContext`/`createContext`/`provide` | React/Solid | ✅ SHIPPED (save/restore around the synchronous build) |
| `useCallback` | React | 🔴 pointless — components run once, closures are already stable |
| `createResource` | Solid | ✅ SHIPPED (2026-07): fetch → `{loading/error/data}` signals, success batched; see [api/signals/functions/createResource](api/signals/functions/createResource.md) and the `fetchtest` example |
| `onMount` | Solid | ✅ SHIPPED (run once, untracked) |
| `createSelector` / `mapArray` | Solid | 🔴 niche; `For` covers the list case |
| `mergeProps` / `splitProps` | Solid | 🔴 props are plain objects; not needed |
| `animate()` / transitions | Reanimated / Solid `Tween` libs | ✅ SHIPPED `animate(from,to,ms,easing?)` in flow.js |
| `Suspense` | React/Solid | 🔴 no async render |
| `ErrorBoundary` | Solid | ✅ SHIPPED, two layers: a DEFAULT top-level crash screen from `render()` (opt out `{boundary:false}`) AND Solid's opt-in `<ErrorBoundary fallback={(err,reset)=>…}>` per subtree (`runtime/jsx-runtime`, device-verified live); `__spError` overrides both |

## Not a React drop-in — say so

Because `useState` returns `[getter, setter]` (Solid semantics) and components
don't re-run, React code does NOT port unchanged. Don't advertise React
compatibility; advertise **Solid-style fine-grained reactivity on Piu**.

## Conformance suite — the parity claim is CHECKED

`tests/conformance.test.mts` runs our runtime through **30 canonical
fine-grained-reactivity laws** and records, per law, how Solid / Preact-signals /
React behave.

**The reference column is EXECUTED, not cited (2026-07-31).** `solid-js` and
`@preact/signals-core` are **devDependencies** — Node-side only: nothing imports
them from the runtime, the mod manifest or `build.mts`, so they never reach the
device and cost the 32KB arena nothing. (The old "we can't take them as deps"
reasoning conflated a *dev* dependency with a *shipped* one.) Each law now
replays the **same scenario** against the real library and asserts the two
observables are equal (`ref`), or pins an **intentional** divergence by
asserting the reference really does behave the other way, with the reason
(`refDiverges`) — a divergence is never a silent skip. Laws with no analogue in
either core are named with their reason (`refNone`).

Result of that pass: **28 of 30 laws replay a live reference** (45 reference
checks match, 9 pin an intentional divergence) and **2 are documented-only** —
the throwing-JSX-binding containment (law 24) and `render()`'s default
crash-screen boundary (law 25), because neither core ships a renderer to
compare against. Running it printed two corrections to the old citations: Solid
`createMemo` is EAGER, so a throwing memo surfaces at the **writer** as well as
at the read (ours is lazy — read only), and signals-core does **not** dispose a
nested effect when its creator re-runs (the leaked one double-fires).

Result (2026-07): **25 laws MATCH Solid** (auto-tracking, no-run-for-unread,
dynamic re-tracking of conditional deps, computed memoization + recompute,
untrack read/write/return-value, batch coalescing + nesting, cleanup ordering,
owner disposal, glitch-free diamond, running-owner nested disposal on re-run,
memo chains, throwing-build teardown) and **5 intentionally DIVERGE**:

- **Components run exactly once** — the structural break from React (which
  re-renders); the verdict label on that law reads DIVERGE *vs React* — the
  executed Solid reference (`createComponent`) MATCHES.
- **A throwing effect is isolated** — one bad subscriber can't kill the others
  (or the machine); the error is reported (now logged, see the error-visibility
  fix) rather than propagated. Executed: Solid propagates AND skips the sibling;
  signals-core propagates but keeps the sibling — we do neither, because on XS
  an escaped throw kills the machine.
- **No memo-equality short-circuit** — Solid's `createMemo` skips notifying
  downstream when a dependency change recomputes the memo to an `===` value.
  OUR computeds are LAZY (recompute on read), so the notify path can't compare
  without an eager recompute that would defeat laziness: we propagate the
  source change and the downstream re-runs even when the memo value is
  unchanged. Extra work, never a *wrong* value. An opt-in eager-memo could add
  the short-circuit later.
- **A throwing JSX binding is contained at the binding** (law 24) and
  **`render()` installs a DEFAULT crash-screen boundary** (law 25) — the two
  documented-only laws: our JSX/render layer has no counterpart in either
  headless core, so there is nothing to replay. The reasons are pinned in the
  test, not skipped.

(~~Push notify is NOT glitch-free~~ FIXED in the 2026-07 core round — the
diamond is now glitch-free, law 12 = MATCH on both V8 and real XS: computeds
are lazy + validated against a global write version, and every notify coalesces
into settle() turns, so the sink runs once straight to the correct value.)

React's own test-utils assume a React runtime + DOM and won't run against us, so
the **React column stays documented, not executed** — it is the one library with
no headless core to replay a law against. Solid and Preact-signals are executed
(above).
