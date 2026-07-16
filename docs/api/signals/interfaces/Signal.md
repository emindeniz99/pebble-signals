[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / Signal

# Interface: Signal\<T\>

Defined in: signals.ts:241

The object-API signal cell returned by [signal](../functions/signal.md): read/write through
`.value` (reads inside an effect/binding subscribe; same-value writes are
dropped). Exported as a TYPE ONLY — construct with `signal(v)`, never
`new`; the class itself stays module-private (packed-core internals).

## Type Parameters

### T

`T`

## Properties

### i

> **i**: `number`

Defined in: signals.ts:243

***

### v

> **v**: `T`

Defined in: signals.ts:242

## Accessors

### value

#### Get Signature

> **get** **value**(): `T`

Defined in: signals.ts:248

##### Returns

`T`

#### Set Signature

> **set** **value**(`value`): `void`

Defined in: signals.ts:260

##### Parameters

###### value

`T`

##### Returns

`void`
