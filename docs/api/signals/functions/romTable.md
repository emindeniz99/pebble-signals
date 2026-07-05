[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / romTable

# Function: romTable()

> **romTable**(`name`): [`RomTable`](../interfaces/RomTable.md)

Defined in: signals.ts:1167

Open a packed string table from the flash resource area (zero boot RAM;
one transient string per read). Pack with `tools/pack-table.mts`; the
build's manifest derivation ships any `romTable("<name>")` literal's blob
automatically.

## Parameters

### name

`string`

## Returns

[`RomTable`](../interfaces/RomTable.md)
