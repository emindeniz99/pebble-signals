[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [press](../README.md) / RepeatClickOptions

# Type Alias: RepeatClickOptions

> **RepeatClickOptions** = `object`

Defined in: [press.ts:123](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/press.ts#L123)

Options for [useRepeatClick](../functions/useRepeatClick.md) — the auto-repeat tempo and its acceleration.

## Properties

### accel?

> `optional` **accel?**: `number`

Defined in: [press.ts:129](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/press.ts#L129)

Multiplier applied to the delay after each repeat (`< 1` accelerates). Default 0.8.

***

### initial?

> `optional` **initial?**: `number`

Defined in: [press.ts:125](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/press.ts#L125)

Delay (ms) before the FIRST auto-repeat, after the immediate press fire. Default 400.

***

### min?

> `optional` **min?**: `number`

Defined in: [press.ts:127](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/press.ts#L127)

Floor (ms) the accelerating delay never drops below. Default 80.
