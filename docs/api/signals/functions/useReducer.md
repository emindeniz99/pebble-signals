[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / useReducer

# Function: useReducer()

> **useReducer**\<`S`, `A`\>(`reducer`, `init`): \[() => `S`, (`action`) => `void`\]

Defined in: [signals.ts:958](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L958)

React's useReducer, trivially over useState. `dispatch(action)` applies the
reducer as a functional update, so it composes with batching and lowering.

## Type Parameters

### S

`S`

### A

`A`

## Parameters

### reducer

(`s`, `a`) => `S`

### init

`S`

## Returns

\[() => `S`, (`action`) => `void`\]
