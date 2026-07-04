# API parity — React / Preact / Solid vs signal-piu

signal-piu is **Solid-flavored, not React-flavored**: components run ONCE (no
re-render), you read state by CALLING a getter (`count()`), and reactive values
are passed as thunks (`() => …`). So "hook parity" means *behavioral* parity
with Solid's primitives, not identical signatures to React's.

## What we have

| Primitive | signal-piu | Closest in… | Notes |
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
| `createResource` | Solid | 🟡 real gap for async data (fetch → loading/error/data). Would pair with VirtualList. Not yet built |
| `onMount` | Solid | ✅ SHIPPED (run once, untracked) |
| `createSelector` / `mapArray` | Solid | 🔴 niche; `For` covers the list case |
| `mergeProps` / `splitProps` | Solid | 🔴 props are plain objects; not needed |
| `animate()` / transitions | Reanimated / Solid `Tween` libs | ✅ SHIPPED `animate(from,to,ms,easing?)` in flow.js |
| `Suspense`/`ErrorBoundary` | React/Solid | 🔴 no async render; subscriber errors already isolated via `__spError` |

## Not a React drop-in — say so

Because `useState` returns `[getter, setter]` (Solid semantics) and components
don't re-run, React code does NOT port unchanged. Don't advertise React
compatibility; advertise **Solid-style fine-grained reactivity on Piu**.

## Conformance suite — the parity claim is CHECKED

`tests/conformance.test.mjs` runs our runtime through 12 canonical
fine-grained-reactivity laws and records, per law, how Solid / Preact-signals /
React behave. We can't take those libraries as deps (no-node_modules build, the
32KB ethos, the release-age cooldown), so the reference column is each
primitive's documented contract encoded as data next to the executable check.

Result: **10 laws MATCH Solid** (auto-tracking, no-run-for-unread, dynamic
re-tracking of conditional deps, computed memoization + recompute, untrack,
batch coalescing, cleanup ordering, owner disposal) and **2 intentionally
DIVERGE**:

- **Components run exactly once** — the structural break from React (which
  re-renders). This is *why* `useState` is `[getter, setter]`.
- ~~Push notify is NOT glitch-free~~ **FIXED (2026-07 core round): the diamond
  is glitch-free** — computeds are lazy (recompute on read, validated against a
  global write version, pulling each source first: the read recursion IS the
  topological order) and every notify coalesces into settle() turns. The sink
  runs once, straight to the correct value; no scheduler, no per-edge objects —
  the whole scheme rides the existing bitmask core plus one version counter
  (law 12 = MATCH on both V8 and real XS).

React's own test-utils assume a React runtime + DOM and won't run against us,
so React parity is documented, not executed.
