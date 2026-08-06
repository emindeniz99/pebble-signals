[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / useState

# Function: useState()

> **useState**\<`T`\>(`init`): \[() => `T`, (`v`) => `void`\]

Defined in: [signals.ts:895](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L895)

React-style state, Solid semantics: returns `[getter, setter]` where the
getter is a CALL — `count()`, not `count`. The setter takes a value or a
functional update `setCount(c => c + 1)`. Lowered to the packed [S](../variables/S.md) API.

## Type Parameters

### T

`T`

## Parameters

### init

`T`

## Returns

\[() => `T`, (`v`) => `void`\]
