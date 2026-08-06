[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [accel](../README.md) / AccelSample

# Interface: AccelSample

Defined in: [accel.ts:93](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/accel.ts#L93)

One accelerometer reading — RAW milli-g on each axis (~+/-4000; 1000 ~= 1g).
What [useAccel](../functions/useAccel.md)'s getter returns. Not converted to m/s^2 (the host
leaves that TODO unimplemented — Rule 7).

## Properties

### x

> **x**: `number`

Defined in: [accel.ts:95](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/accel.ts#L95)

Left/right axis, raw milli-g.

***

### y

> **y**: `number`

Defined in: [accel.ts:97](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/accel.ts#L97)

Up/down axis, raw milli-g.

***

### z

> **z**: `number`

Defined in: [accel.ts:99](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/accel.ts#L99)

Front/back (through-screen) axis, raw milli-g.
