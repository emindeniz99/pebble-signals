[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / NavHandle

# Type Alias: NavHandle

> **NavHandle** = `object`

Defined in: flow.ts:149

The handle every [Navigator](../functions/Navigator.md) screen builder receives.

## Methods

### canPop()

> **canPop**(): `boolean`

Defined in: flow.ts:157

Reactive: is there a parent to pop to.

#### Returns

`boolean`

***

### depth()

> **depth**(): `number`

Defined in: flow.ts:155

Reactive current depth (1 = root).

#### Returns

`number`

***

### pop()

> **pop**(): `void`

Defined in: flow.ts:153

Pop to the parent (no-op at the root) — the parent REBUILDS from its builder.

#### Returns

`void`

***

### push()

> **push**(`build`): `void`

Defined in: flow.ts:151

Push a child screen — the CURRENT screen is disposed (one screen lives at a time).

#### Parameters

##### build

(`nav`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

#### Returns

`void`
