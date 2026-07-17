[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / Resource

# Interface: Resource\<T\>

Defined in: signals.ts:960

What [createResource](../functions/createResource.md) returns — reactive thunks over one in-flight fetch.

## Type Parameters

### T

`T`

## Properties

### data

> **data**: () => `T` \| `undefined`

Defined in: signals.ts:962

Latest fetched value; `undefined` until the first success. Reactive.

#### Returns

`T` \| `undefined`

***

### error

> **error**: () => `unknown`

Defined in: signals.ts:966

Rejection value of the LAST fetch, or `undefined`. Reactive.

#### Returns

`unknown`

***

### loading

> **loading**: () => `boolean`

Defined in: signals.ts:964

True while a fetch is in flight. Reactive.

#### Returns

`boolean`

***

### refetch

> **refetch**: () => `void`

Defined in: signals.ts:968

Start the fetcher again (stale responses from older calls are dropped).

#### Returns

`void`
