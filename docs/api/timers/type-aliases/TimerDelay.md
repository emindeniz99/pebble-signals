[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [timers](../README.md) / TimerDelay

# Type Alias: TimerDelay

> **TimerDelay** = `number` \| (() => `number` \| `null`) \| `null`

Defined in: [timers.ts:50](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/timers.ts#L50)

A timer delay handed to [useInterval](../functions/useInterval.md) / [useTimeout](../functions/useTimeout.md):
 - a bare `number` — static ms, applied once at construction;
 - a THUNK `() => number | null` — REACTIVE: read a signal inside it and the
   timer tears down + recreates whenever the returned value changes (a `null`
   return pauses it, a number resumes it — the pause/resume idiom);
 - `null` — paused: no live timer at all.
