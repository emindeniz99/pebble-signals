[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [battery](../README.md) / BatterySample

# Interface: BatterySample

Defined in: [battery.ts:85](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/battery.ts#L85)

One battery reading — what [useBattery](../functions/useBattery.md)'s getter returns. `percent` is
0..100 (Rule 7 — the host's integer charge_percent, not a 0..1 fraction).

## Properties

### charging

> **charging**: `boolean`

Defined in: [battery.ts:89](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/battery.ts#L89)

True while the battery is actively charging.

***

### percent

> **percent**: `number`

Defined in: [battery.ts:87](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/battery.ts#L87)

Charge level, 0..100 (integer percent — the host's charge_percent).

***

### plugged

> **plugged**: `boolean`

Defined in: [battery.ts:91](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/battery.ts#L91)

True while external power is connected (can be true with `charging` false when full).
