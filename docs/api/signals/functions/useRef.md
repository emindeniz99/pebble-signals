[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / useRef

# Function: useRef()

> **useRef**\<`T`\>(`v`): `object`

Defined in: [signals.ts:950](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L950)

Mutable box that never notifies — React's useRef. (useCallback is
deliberately absent: components run ONCE here, so a plain closure is
already stable; there is nothing to memoize against.)

## Type Parameters

### T

`T`

## Parameters

### v

`T`

## Returns

`object`

### current

> **current**: `T`
