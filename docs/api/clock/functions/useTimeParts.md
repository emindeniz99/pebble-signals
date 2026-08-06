[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [clock](../README.md) / useTimeParts

# Function: useTimeParts()

> **useTimeParts**(`granularity?`): [`TimeParts`](../interfaces/TimeParts.md)

Defined in: [clock.ts:151](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clock.ts#L151)

Split the current time into per-field reactive getters, derived from one
[useClock](useClock.md) Date.

  const { hours, minutes, seconds } = useTimeParts();
  <Label string={() => two(hours()) + ":" + two(minutes()) + ":" + two(seconds())} />

Each field is a PLAIN PROJECTION getter over the shared clock Date
(`() => now().getHours()`), NOT a `computed()` memo. Rationale (project Rule 4
— recompute, don't cache; and conformance Law 23 — pebble-signals's `computed`
does NOT equality-dedupe its notifications): a clock is ONE Date signal that
changes every tick, so a memo per field would still re-notify every tick (no
repaint saved) while costing three forward effects — a plain getter is
strictly cheaper with identical behavior. HONEST LIMIT: because every field
reads the same one Date signal, EVERY bound field re-evaluates each tick; for
a Label that must repaint ONLY when its own field changes, use separate
equal-write `useState` signals fed from one tick (the watchface.tsx pattern —
`setHh(d.getHours())` skips via S.set's Object.is when the hour is unchanged).
Composes [useClock](useClock.md), so it subscribes / cleans up exactly like it.

## Parameters

### granularity?

[`ClockGranularity`](../type-aliases/ClockGranularity.md) = `"second"`

forwarded to [useClock](useClock.md) (`"second"` default).

## Returns

[`TimeParts`](../interfaces/TimeParts.md)

`{ hours, minutes, seconds }` — three reactive `() => number` getters.
