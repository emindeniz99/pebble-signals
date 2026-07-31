[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [fetch](../README.md) / useFetch

# Function: useFetch()

> **useFetch**\<`T`\>(`url`, `opts?`): [`Resource`](../../signals/interfaces/Resource.md)\<`T`\>

Defined in: fetch.ts:126

Reactive HTTP fetch — composes [createResource](../../signals/functions/createResource.md) over the host `fetch`
global. Runs a request NOW and exposes it as a reactive [Resource](../../signals/interfaces/Resource.md)
(`{ data, loading, error, refetch }`); read the thunks inside a Label binding to
repaint on each transition.

  const res = useFetch<{ value: string }>("https://api.example.com/thing.json");
  <Label string={() =>
    res.loading() ? "…" : res.error() ? "err" : String(res.data()?.value)} />
  // on a button: res.refetch();

  // a reactive URL — the thunk is re-read on every fetch, so refetch()
  // follows the current id:
  const res = useFetch(() => `https://api.example.com/item/${id()}`);

  // a custom decoder (e.g. plain text instead of JSON):
  const res = useFetch("https://example.com/name.txt", { parse: (r) => r.text() });

DEVICE-GATED (see the module header, handbook gotcha 18a): `fetch` proxies
through the phone and its Response allocations are heavy for the 32KB arena —
keep a useFetch app LEAN, or use `runtime/phonefetch`'s usePhoneFetch (the
shipped fetch-over-message API: same `url` contract, same Resource shape, no
Response in the arena) for anything non-trivial.

## Type Parameters

### T

`T`

the parsed value type (`res.data()` is `T | undefined`).

## Parameters

### url

`string` \| (() => `string`)

the request URL, or a `() => string` thunk read on EVERY fetch
  (initial + each refetch) so a derived URL refetches to its current value.

### opts?

`parse` overrides how the `Response` becomes `T` — it defaults to
  `(r) => r.json()`. Return a `Promise<T>`; a throw / rejection surfaces at
  `res.error()`.

#### parse?

(`r`) => `Promise`\<`T`\>

## Returns

[`Resource`](../../signals/interfaces/Resource.md)\<`T`\>

a [Resource](../../signals/interfaces/Resource.md)`<T>` — `{ data, loading, error, refetch }`.
