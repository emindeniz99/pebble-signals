[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / VLSimple

# Type Alias: VLSimple\<T\>

> **VLSimple**\<`T`\> = `VLBase`\<`T`\> & `object`

Defined in: flow.ts:102

[VirtualList](../functions/VirtualList.md) simple mode: one recycled Label per slot, text via
`format`. Mutually exclusive with `renderRow` (compile error if both).

## Type Declaration

### format?

> `optional` **format?**: (`v`, `i`) => `string`

value -> row text (default `String(value)`).

#### Parameters

##### v

`T`

##### i

`number`

#### Returns

`string`

### renderRow?

> `optional` **renderRow?**: `never`

## Type Parameters

### T

`T`
