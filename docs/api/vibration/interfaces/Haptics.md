[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [vibration](../README.md) / Haptics

# Interface: Haptics

Defined in: [vibration.ts:47](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vibration.ts#L47)

The command surface [useHaptics](../functions/useHaptics.md) returns — fire-and-forget motor pulses.

## Methods

### cancel()

> **cancel**(): `void`

Defined in: [vibration.ts:60](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vibration.ts#L60)

Cancel any in-flight vibration (also fired automatically on owner dispose).

#### Returns

`void`

***

### double()

> **double**(): `void`

Defined in: [vibration.ts:53](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vibration.ts#L53)

Two quick buzzes (Vibes.doublePulse) — a distinct secondary signal.

#### Returns

`void`

***

### long()

> **long**(): `void`

Defined in: [vibration.ts:51](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vibration.ts#L51)

A long buzz (Vibes.longPulse) — an alert / attention pulse.

#### Returns

`void`

***

### pattern()

> **pattern**(`segments`): `void`

Defined in: [vibration.ts:58](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vibration.ts#L58)

A custom pattern of ALTERNATING on/off millisecond segments — `[100,50,100]`
is buzz 100 / pause 50 / buzz 100 (the RN vibration-pattern convention).

#### Parameters

##### segments

`number`[]

#### Returns

`void`

***

### short()

> **short**(): `void`

Defined in: [vibration.ts:49](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vibration.ts#L49)

A short buzz (Vibes.shortPulse) — the default confirmation tap.

#### Returns

`void`
