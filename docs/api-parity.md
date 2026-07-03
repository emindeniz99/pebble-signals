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
compatibility; advertise **Solid-style fine-grained reactivity on Piu**. A
future "conformance suite" could port Solid's reactivity/batch/cleanup
behavior specs against our API to *prove* the semantics match — but React's
own test-utils assume React runtime + DOM and won't run against us.
