[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [state](../README.md) / CounterControls

# Interface: CounterControls

Defined in: state.ts:87

The controls object — the second element of [useCounter](../functions/useCounter.md)'s tuple.

## Properties

### dec

> **dec**: () => `void`

Defined in: state.ts:91

Subtract `step`, clamped to `[min, max]`.

#### Returns

`void`

***

### inc

> **inc**: () => `void`

Defined in: state.ts:89

Add `step`, clamped to `[min, max]`.

#### Returns

`void`

***

### reset

> **reset**: () => `void`

Defined in: state.ts:93

Restore `clamp(initial)`.

#### Returns

`void`

***

### set

> **set**: (`n`) => `void`

Defined in: state.ts:95

Set to `clamp(n)`.

#### Parameters

##### n

`number`

#### Returns

`void`
