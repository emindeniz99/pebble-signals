[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / report

# Function: report()

> **report**(`err`, `ctx`): `void`

Defined in: signals.ts:333

Report a caught reactive error — the shared "loud failure" channel. The
escalation ladder (2026-07 redesign — owner decision: telling the wearer
the app crashed beats a silently frozen watchface):
1. `globalThis.__spError` installed → the handler owns the policy entirely
   (contain by returning, escalate by rethrowing — dev strict mode). It
   also owns LOGGING — report() prints nothing for it.
2. Else: log the FULL error (type, message, stack, raw object) through the
   host console — ALWAYS, even when a boundary is about to catch it
   (owner decision: a caught error is still worth seeing in the log;
   on release firmware the line is a trace no-op anyway, so it is free
   where it can't be read and visible everywhere it can).
3. Then dispatch: the nearest `<ErrorBoundary>` in scope catches it (its
   fallback shows the error); else the sink — render()'s default sink
   paints the crash screen, the strict sink (`boundary:false`) rethrows,
   no sink (bare core) means the log was it: contain.

Hard-won constraints baked in (device receipts, 2026-07):
- The Pebble host console is `Object.freeze({log})` — NO `.error`. An
  unconditional `.error()` call here threw inside notify()'s catch and
  fxAbort'ed the machine on gabbro. So: prefer error, fall back to log,
  and the logger itself must NEVER throw.
- On release firmware JS `trace` (which host console.log wraps) is a
  no-op, so the log line only reaches `pebble logs` on debug hosts/xsbug —
  but `__spError` always works, Node tests always see it, and the crash
  screen is visible on the WATCH itself.
- console/error/log are host-interned names — zero boot-symbol cost.
Exported for the jsx-runtime binding guard (which adds prop/node
context); apps may also call it from their own try/catch.

## Parameters

### err

`unknown`

### ctx

`string`

## Returns

`void`
