[**signal-piu**](../../../README.md)

***

[signal-piu](../../../README.md) / [runtime/flow](../README.md) / VirtualList

# Function: VirtualList()

> **VirtualList**\<`T`\>(`props`): `any`

Defined in: src/tsx/globals.d.ts:198

Windowed list with recycled cells — a fixed pool of `rows` nodes scrolled
over a `data` source. `format` (simple mode) and `renderRow` (rich mode) are
MUTUALLY EXCLUSIVE at the type level.

## Type Parameters

### T

`T`

## Parameters

### props

[`VLSimple`](../interfaces/VLSimple.md)\<`T`\> \| [`VLRich`](../interfaces/VLRich.md)\<`T`\>

## Returns

`any`
