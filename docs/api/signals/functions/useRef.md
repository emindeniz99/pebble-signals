[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / useRef

# Function: useRef()

> **useRef**\<`T`\>(`v`): `object`

Defined in: signals.ts:901

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
