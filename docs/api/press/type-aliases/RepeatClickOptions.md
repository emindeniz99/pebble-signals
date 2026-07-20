[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [press](../README.md) / RepeatClickOptions

# Type Alias: RepeatClickOptions

> **RepeatClickOptions** = `object`

Defined in: press.ts:121

Options for [useRepeatClick](../functions/useRepeatClick.md) — the auto-repeat tempo and its acceleration.

## Properties

### accel?

> `optional` **accel?**: `number`

Defined in: press.ts:127

Multiplier applied to the delay after each repeat (`< 1` accelerates). Default 0.8.

***

### initial?

> `optional` **initial?**: `number`

Defined in: press.ts:123

Delay (ms) before the FIRST auto-repeat, after the immediate press fire. Default 400.

***

### min?

> `optional` **min?**: `number`

Defined in: press.ts:125

Floor (ms) the accelerating delay never drops below. Default 80.
