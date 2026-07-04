[**signal-piu**](../../../README.md)

***

[signal-piu](../../../README.md) / [runtime/signals](../README.md) / S

# Variable: S

> `const` **S**: `object`

Defined in: src/tsx/globals.d.ts:113

Packed lowering target — integer-id signals with zero per-signal objects.
`build.mts` rewrites `useState`/`signal`/`computed` to this at compile time;
you rarely call it by hand.

## Type Declaration

### computed()

> **computed**\<`T`\>(`fn`): `number`

Packed memo: one value slot + one recomputing effect.

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `T`

#### Returns

`number`

### get()

> **get**\<`T`\>(`i`): `T`

Read packed signal `i` (subscribes the current effect).

#### Type Parameters

##### T

`T`

#### Parameters

##### i

`number`

#### Returns

`T`

### put()

> **put**\<`T`\>(`i`, `v`): `void`

RAW write — stores a function verbatim (the `signal.value =` contract).

#### Type Parameters

##### T

`T`

#### Parameters

##### i

`number`

##### v

`T`

#### Returns

`void`

### set()

> **set**\<`T`\>(`i`, `v`): `void`

Functional-update write (the `useState` setter contract).

#### Type Parameters

##### T

`T`

#### Parameters

##### i

`number`

##### v

`T` \| ((`prev`) => `T`)

#### Returns

`void`

### sig()

> **sig**\<`T`\>(`v`): `number`

Allocate a packed signal, return its integer id.

#### Type Parameters

##### T

`T`

#### Parameters

##### v

`T`

#### Returns

`number`
