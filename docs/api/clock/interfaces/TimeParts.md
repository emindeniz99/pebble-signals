[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [clock](../README.md) / TimeParts

# Interface: TimeParts

Defined in: [clock.ts:119](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clock.ts#L119)

Per-field reactive time getters returned by [useTimeParts](../functions/useTimeParts.md).

## Properties

### hours

> **hours**: () => `number`

Defined in: [clock.ts:121](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clock.ts#L121)

Reactive getter for the hour (0–23).

#### Returns

`number`

***

### minutes

> **minutes**: () => `number`

Defined in: [clock.ts:123](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clock.ts#L123)

Reactive getter for the minute (0–59).

#### Returns

`number`

***

### seconds

> **seconds**: () => `number`

Defined in: [clock.ts:125](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/clock.ts#L125)

Reactive getter for the second (0–59).

#### Returns

`number`
