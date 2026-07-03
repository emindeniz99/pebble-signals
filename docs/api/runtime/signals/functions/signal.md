[**signal-piu**](../../../README.md)

***

[signal-piu](../../../README.md) / [runtime/signals](../README.md) / signal

# Function: signal()

> **signal**\<`T`\>(`value`): `object`

Defined in: src/tsx/globals.d.ts:50

Create a reactive value. Reading `.value` inside an [effect](effect.md) (or a
JSX binding thunk) subscribes to it; writing `.value` notifies subscribers.
The build lowers `const s = signal(v)` to the packed integer [S](../variables/S.md) API.

## Type Parameters

### T

`T`

## Parameters

### value

`T`

initial value

## Returns

`object`

### value

> **value**: `T`
