[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / computed

# Function: computed()

> **computed**\<`T`\>(`fn`): [`ReadonlySignal`](../interfaces/ReadonlySignal.md)\<`T`\>

Defined in: [signals.ts:734](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L734)

Memoized derived signal, LAZY and glitch-free: `fn` re-runs on read when a
dependency changed, and its value is cached across reads. Costs one internal
effect — prefer a plain thunk `() => a.value + b.value` unless the value is
read in many places.

## Type Parameters

### T

`T`

## Parameters

### fn

() => `T`

## Returns

[`ReadonlySignal`](../interfaces/ReadonlySignal.md)\<`T`\>
