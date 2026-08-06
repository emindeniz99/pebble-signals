[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [watchinfo](../README.md) / WatchInfo

# Interface: WatchInfo

Defined in: [watchinfo.ts:66](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L66)

One-shot device + screen facts returned by [watchInfo](../functions/watchInfo.md) — the bare
`watch` global's getters merged with the [DisplayBounds](DisplayBounds.md) screen subset
into ONE flat object. Every field is constant for the life of the boot.

## Extends

- [`DisplayBounds`](DisplayBounds.md)

## Properties

### color

> **color**: `boolean`

Defined in: [watchinfo.ts:58](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L58)

True on a COLOR panel, false on a black/white one.

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`color`](DisplayBounds.md#color)

***

### firmware

> **firmware**: `object`

Defined in: [watchinfo.ts:70](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L70)

Running firmware version, flattened once from `watch.firmwareVersion`.

#### major

> **major**: `number`

Major version component.

#### minor

> **minor**: `number`

Minor version component.

#### patch

> **patch**: `number`

Patch version component.

***

### height

> **height**: `number`

Defined in: [watchinfo.ts:54](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L54)

Display height in px (e.g. 260 on gabbro, 228 on emery).

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`height`](DisplayBounds.md#height)

***

### hour12

> **hour12**: `boolean`

Defined in: [watchinfo.ts:79](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L79)

True when the wearer's system clock is 12-hour style (`!24h`).

***

### language

> **language**: `string`

Defined in: [watchinfo.ts:81](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L81)

Wearer's system locale from `device.info.language` (e.g. "en_US"; "" when absent).

***

### model

> **model**: `number`

Defined in: [watchinfo.ts:68](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L68)

Hardware model id — the host WatchInfoModel enum as an integer.

***

### round

> **round**: `boolean`

Defined in: [watchinfo.ts:56](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L56)

True on a CIRCULAR panel (gabbro) — inset content off the clipped corners.

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`round`](DisplayBounds.md#round)

***

### serialNumber

> **serialNumber**: `string`

Defined in: [watchinfo.ts:87](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L87)

Hardware serial from `device.info.serialNumber` — "" when absent.
QEMU reports it `undefined` (hostprobe receipt 2026-07-29), so expect a
real value only on hardware.

***

### width

> **width**: `number`

Defined in: [watchinfo.ts:52](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L52)

Display width in px (e.g. 260 on gabbro, 200 on emery).

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`width`](DisplayBounds.md#width)
