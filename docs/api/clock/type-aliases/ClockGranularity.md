[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [clock](../README.md) / ClockGranularity

# Type Alias: ClockGranularity

> **ClockGranularity** = `"second"` \| `"minute"` \| `"hour"` \| `"day"`

Defined in: [clock.ts:73](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clock.ts#L73)

Tick granularity for [useClock](../functions/useClock.md) / [useTimeParts](../functions/useTimeParts.md). The host tick
service exposes all four boundaries (global.js events: "secondchange",
"minutechange", "hourchange", "daychange" — one shared coalesced timer;
subscribe no-throw device-proven by the hostprobe receipt 2026-07-29).
Coarser is cheaper: a date-only line should tick on "day", not "second".
