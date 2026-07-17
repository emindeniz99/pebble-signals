[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / RomTable

# Interface: RomTable

Defined in: signals.ts:1288

What [romTable](../functions/romTable.md) returns — a read-only view over a packed table.

## Properties

### count

> **count**: `number`

Defined in: signals.ts:1290

Number of entries in the table.

## Methods

### get()

> **get**(`i`): `string`

Defined in: signals.ts:1292

Decode entry `i` (wraps modulo [count](#count)); "" on an empty table.

#### Parameters

##### i

`number`

#### Returns

`string`
