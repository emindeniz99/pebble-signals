[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [battery](../README.md) / useBattery

# Function: useBattery()

> **useBattery**(): () => [`BatterySample`](../interfaces/BatterySample.md)

Defined in: [battery.ts:161](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/battery.ts#L161)

Reactive battery state — a getter for the latest `{ percent, charging, plugged }`;
reading it inside a Label binding / effect subscribes, so the UI repaints on
every battery event.

  const battery = useBattery();
  <Label string={() => `${battery().percent}%`} />                    // reactive
  <Label string={() => (battery().charging ? "charging" : "")} />

`percent` is 0..100 (Rule 7). The getter is SEEDED with a real reading at
construction (the battery host supports an immediate probe — unlike the
accel/compass hooks), so the first paint shows the true charge, not a
placeholder. All callers share ONE host Battery (the C wrapper allows only one)
and ONE backing signal, so N components cost one instance. The instance is
closed automatically when the last useBattery owner is disposed — call this
inside a render root / component body so onCleanup can bind (Rule 5).

## Returns

a getter `() => { percent, charging, plugged }` — reactive; seeded from the host at construction

() => [`BatterySample`](../interfaces/BatterySample.md)
