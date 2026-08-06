[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [accel](../README.md) / TapDirection

# Type Alias: TapDirection

> **TapDirection** = `"x+"` \| `"x-"` \| `"y+"` \| `"y-"` \| `"z+"` \| `"z-"`

Defined in: [accel.ts:86](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/accel.ts#L86)

A single-tap direction reported by [useTap](../functions/useTap.md) — AXIS-FIRST `[axis][sign]`
exactly as the host builds it (pebble-accelerometer.c doTap()). NOTE this is
the OPPOSITE order from the vendored `accelerometer.d.ts` ("+x"), which is
wrong against the C source; this type is the on-device truth.
