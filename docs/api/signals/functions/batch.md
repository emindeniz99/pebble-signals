[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / batch

# Function: batch()

> **batch**\<`T`\>(`fn`): `T`

Defined in: [signals.ts:754](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L754)

Coalesce writes: N `.value` sets inside `fn` produce ONE notification per
subscriber (union of touched signals), after `fn` returns. Reads inside the
batch see new values eagerly; only notification defers (Solid semantics).

## Type Parameters

### T

`T`

## Parameters

### fn

() => `T`

## Returns

`T`
