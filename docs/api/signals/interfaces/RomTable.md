[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / RomTable

# Interface: RomTable

Defined in: [signals.ts:1362](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L1362)

What [romTable](../functions/romTable.md) returns — a read-only view over a packed table.

## Properties

### count

> **count**: `number`

Defined in: [signals.ts:1364](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L1364)

Number of entries in the table.

## Methods

### get()

> **get**(`i`): `string`

Defined in: [signals.ts:1366](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L1366)

Decode entry `i` (wraps modulo [count](#count)); "" on an empty table.

#### Parameters

##### i

`number`

#### Returns

`string`
