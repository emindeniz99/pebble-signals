[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / createContext

# Function: createContext()

> **createContext**\<`T`\>(`defaultValue`): `object`

Defined in: signals.ts:940

Context — pass a value down the (synchronous, run-once) build without
threading props. createContext(default) -> ctx; provide(ctx, value, build)
sets ctx for the duration of build() (children read it via useContext);
useContext(ctx) reads the current value. No Symbol/Map (XS rule): a context
is a one-field record and provide() is a save/restore around the subtree,
which is exactly right because children build synchronously inside build().

## Type Parameters

### T

`T`

## Parameters

### defaultValue

`T`

## Returns

`object`

### v

> **v**: `T`
