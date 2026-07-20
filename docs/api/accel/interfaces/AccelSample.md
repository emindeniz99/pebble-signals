[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [accel](../README.md) / AccelSample

# Interface: AccelSample

Defined in: accel.ts:93

One accelerometer reading — RAW milli-g on each axis (~+/-4000; 1000 ~= 1g).
What [useAccel](../functions/useAccel.md)'s getter returns. Not converted to m/s^2 (the host
leaves that TODO unimplemented — Rule 7).

## Properties

### x

> **x**: `number`

Defined in: accel.ts:95

Left/right axis, raw milli-g.

***

### y

> **y**: `number`

Defined in: accel.ts:97

Up/down axis, raw milli-g.

***

### z

> **z**: `number`

Defined in: accel.ts:99

Front/back (through-screen) axis, raw milli-g.
