[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / ByteStore

# Interface: ByteStore

Defined in: signals.ts:1085

The public surface of a byte-record store — what [createStore](../functions/createStore.md) returns.
Values move in and out BY COPY (serialization store, not an object heap), so
`get` is honestly `unknown`: the record's runtime tag decides the type.

## Methods

### count()

> **count**(): `number`

Defined in: signals.ts:1087

Number of records currently stored.

#### Returns

`number`

***

### def()

> **def**(`tag`, `encode`, `decode`): `void`

Defined in: signals.ts:1089

Register a custom codec under tag 8..255 (see [Encode](../type-aliases/Encode.md)/[Decode](../type-aliases/Decode.md)).

#### Parameters

##### tag

`number`

##### encode

[`Encode`](../type-aliases/Encode.md)

##### decode

[`Decode`](../type-aliases/Decode.md)

#### Returns

`void`

***

### get()

> **get**(`i`): `unknown`

Defined in: signals.ts:1093

Decode record `i` by copy; `undefined` when out of range.

#### Parameters

##### i

`number`

#### Returns

`unknown`

***

### load()

> **load**(`k`): `boolean`

Defined in: signals.ts:1099

Restore records saved under `k`; false on missing/oversize/corrupt data.

#### Parameters

##### k

`string`

#### Returns

`boolean`

***

### push()

> **push**(`v`, `tag?`): `number`

Defined in: signals.ts:1091

Append a value (pass `tag` for custom types). New count, or -1 if it doesn't fit.

#### Parameters

##### v

`unknown`

##### tag?

`number`

#### Returns

`number`

***

### remove()

> **remove**(`i`): `number`

Defined in: signals.ts:1095

Remove record `i` (tail shifts down). New count, or -1 when out of range.

#### Parameters

##### i

`number`

#### Returns

`number`

***

### save()

> **save**(`k`): `void`

Defined in: signals.ts:1097

Persist the raw record bytes under `k` in the host's localStorage.

#### Parameters

##### k

`string`

#### Returns

`void`
