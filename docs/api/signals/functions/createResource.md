[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / createResource

# Function: createResource()

> **createResource**\<`T`\>(`fetcher`): [`Resource`](../interfaces/Resource.md)\<`T`\>

Defined in: signals.ts:1019

Async data: run `fetcher` now, expose `{loading, error, data, refetch}` as
reactive thunks. Out-of-order completions are dropped (only the newest call
may settle the resource). On Pebble, `fetch()` proxies through the phone
(`@moddable/pebbleproxy`, README gotcha 18) and its Response allocations are
heavy for the 32KB arena — keep fetch-using apps lean and prefer decoding
into a byte [createStore](createStore.md) over retaining parsed objects.

## Type Parameters

### T

`T`

## Parameters

### fetcher

() => `Promise`\<`T`\>

## Returns

[`Resource`](../interfaces/Resource.md)\<`T`\>
