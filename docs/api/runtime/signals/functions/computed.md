[**signal-piu**](../../../README.md)

***

[signal-piu](../../../README.md) / [runtime/signals](../README.md) / computed

# Function: computed()

> **computed**\<`T`\>(`fn`): `object`

Defined in: src/tsx/globals.d.ts:63

Memoized derived signal: `fn` re-runs only when a dependency changes, and
its value is cached across reads. Costs one internal effect — prefer a
plain thunk `() => a() + b()` unless the value is read in many places.

## Type Parameters

### T

`T`

## Parameters

### fn

() => `T`

## Returns

`object`

### value

> `readonly` **value**: `T`
