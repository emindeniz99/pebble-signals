[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / signal

# Function: signal()

> **signal**\<`T`\>(`value`): [`Signal`](../interfaces/Signal.md)\<`T`\>

Defined in: signals.ts:487

Create a reactive value. Reading `.value` inside an [effect](effect.md) (or a JSX
binding thunk) subscribes to it; writing `.value` notifies subscribers. The
build lowers `const s = signal(v)` to the packed integer [S](../variables/S.md) API.

## Type Parameters

### T

`T`

## Parameters

### value

`T`

initial value

## Returns

[`Signal`](../interfaces/Signal.md)\<`T`\>
