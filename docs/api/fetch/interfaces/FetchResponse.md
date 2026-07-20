[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [fetch](../README.md) / FetchResponse

# Interface: FetchResponse

Defined in: fetch.ts:75

The subset of the host `fetch` [Response](https://developer.repebble.com)
that a [useFetch](../functions/useFetch.md) `parse` callback reads — a faithful view of the shipped
`@moddable/fetch` `Response` (json / text / arrayBuffer + the status metadata),
minus `headers` (which needs the host `Headers` type, not loaded in these
typings — cast if you need it). Declared locally because the ambient "fetch"
module is absent from the runtime-build typings, so the `fetch` global resolves
to `any` here; this is a TYPE only and erases at emit.

## Properties

### ok

> `readonly` **ok**: `boolean`

Defined in: fetch.ts:83

True for a 2xx status.

***

### status

> `readonly` **status**: `number`

Defined in: fetch.ts:85

HTTP status code (e.g. 200, 404).

***

### statusText

> `readonly` **statusText**: `string`

Defined in: fetch.ts:87

HTTP status text (e.g. "OK").

## Methods

### arrayBuffer()

> **arrayBuffer**(): `Promise`\<`ArrayBuffer`\>

Defined in: fetch.ts:81

Read the body as raw bytes.

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### json()

> **json**(): `Promise`\<`unknown`\>

Defined in: fetch.ts:77

Parse the body as JSON — the DEFAULT [useFetch](../functions/useFetch.md) parser.

#### Returns

`Promise`\<`unknown`\>

***

### text()

> **text**(): `Promise`\<`string`\>

Defined in: fetch.ts:79

Read the body as a UTF-8 string.

#### Returns

`Promise`\<`string`\>
