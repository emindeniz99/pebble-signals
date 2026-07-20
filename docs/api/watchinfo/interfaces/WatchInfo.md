[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [watchinfo](../README.md) / WatchInfo

# Interface: WatchInfo

Defined in: watchinfo.ts:66

One-shot device + screen facts returned by [watchInfo](../functions/watchInfo.md) — the bare
`watch` global's getters merged with the [DisplayBounds](DisplayBounds.md) screen subset
into ONE flat object. Every field is constant for the life of the boot.

## Extends

- [`DisplayBounds`](DisplayBounds.md)

## Properties

### color

> **color**: `boolean`

Defined in: watchinfo.ts:58

True on a COLOR panel, false on a black/white one.

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`color`](DisplayBounds.md#color)

***

### firmware

> **firmware**: `object`

Defined in: watchinfo.ts:70

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

Defined in: watchinfo.ts:54

Display height in px (e.g. 260 on gabbro, 228 on emery).

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`height`](DisplayBounds.md#height)

***

### hour12

> **hour12**: `boolean`

Defined in: watchinfo.ts:79

True when the wearer's system clock is 12-hour style (`!24h`).

***

### model

> **model**: `number`

Defined in: watchinfo.ts:68

Hardware model id — the host WatchInfoModel enum as an integer.

***

### round

> **round**: `boolean`

Defined in: watchinfo.ts:56

True on a CIRCULAR panel (gabbro) — inset content off the clipped corners.

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`round`](DisplayBounds.md#round)

***

### width

> **width**: `number`

Defined in: watchinfo.ts:52

Display width in px (e.g. 260 on gabbro, 200 on emery).

#### Inherited from

[`DisplayBounds`](DisplayBounds.md).[`width`](DisplayBounds.md#width)
