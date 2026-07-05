[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / createRoot

# Function: createRoot()

> **createRoot**\<`T`\>(`fn`): \[`T`, () => `void`\]

Defined in: signals.ts:714

Run `fn` under a fresh owner; returns `[result, disposer]`. Calling the
disposer tears down every effect/cleanup [track](track.md)ed during `fn`.

## Type Parameters

### T

`T`

## Parameters

### fn

() => `T`

## Returns

\[`T`, () => `void`\]
