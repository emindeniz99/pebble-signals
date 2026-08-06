[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [watchinfo](../README.md) / DisplayBounds

# Interface: DisplayBounds

Defined in: [watchinfo.ts:50](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L50)

The screen subset of [WatchInfo](WatchInfo.md) — the static-per-boot display geometry,
read from the jsx-runtime `screen` record. What [useDisplayBounds](../functions/useDisplayBounds.md) returns.

## Extended by

- [`WatchInfo`](WatchInfo.md)

## Properties

### color

> **color**: `boolean`

Defined in: [watchinfo.ts:58](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L58)

True on a COLOR panel, false on a black/white one.

***

### height

> **height**: `number`

Defined in: [watchinfo.ts:54](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L54)

Display height in px (e.g. 260 on gabbro, 228 on emery).

***

### round

> **round**: `boolean`

Defined in: [watchinfo.ts:56](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L56)

True on a CIRCULAR panel (gabbro) — inset content off the clipped corners.

***

### width

> **width**: `number`

Defined in: [watchinfo.ts:52](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L52)

Display width in px (e.g. 260 on gabbro, 200 on emery).
