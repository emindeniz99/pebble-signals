[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [jsx-runtime](../README.md) / ErrorBoundary

# Function: ErrorBoundary()

> **ErrorBoundary**(`props`): `Container`

Defined in: jsx-runtime.ts:523

ErrorBoundary({ children, fallback }) — Solid's per-subtree boundary, on a
watch. `children` is a thunk (like Show); `fallback(err, reset)` renders
when the subtree throws — at BUILD time OR on any later reactive re-run —
and `reset` re-runs `children` under a fresh root (component-scope state
starts over; module-scope state survives — the swap tradeoff). The rest of
the app keeps running; only this subtree is replaced.

This is the OPT-IN, LOCAL counterpart to render()'s default top-level crash
screen: an inner ErrorBoundary catches first; anything it doesn't wrap (or a
throw from the fallback itself) escalates OUTWARD to the enclosing boundary
and ultimately to the crash screen — the same chain React (root
onUncaughtError) and Solid (outermost catch) use. It does NOT catch button/
tap handler throws (those run outside the reactive graph — parity with
Solid, which also skips event handlers).

`const` arrow, not `export function` (preloaded-module alias budget, gotcha
13); apps that never import it pay nothing (export prune + DCE). ALL its
helpers live INSIDE this one arrow on purpose: extra module-scope bindings
push esbuild's minified top-level identifier allocation into letters the
host never interned — MEASURED +5 boot symbols on watchface when ebHost/
ebWrap sat at module scope. Function-local names never intern; the price is
a few closures per ErrorBoundary instance, and boundaries are few.

## Parameters

### props

[`ErrorBoundaryProps`](../interfaces/ErrorBoundaryProps.md)

## Returns

`Container`
