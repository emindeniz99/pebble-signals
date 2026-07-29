[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / NavHandle

# Type Alias: NavHandle

> **NavHandle** = `object`

Defined in: flow.ts:172

The handle every [Navigator](../functions/Navigator.md) screen builder receives.

## Methods

### canPop()

> **canPop**(): `boolean`

Defined in: flow.ts:188

Reactive: is there a parent to pop to.

#### Returns

`boolean`

***

### depth()

> **depth**(): `number`

Defined in: flow.ts:186

Reactive current depth (1 = root).

#### Returns

`number`

***

### pop()

> **pop**(): `void`

Defined in: flow.ts:184

Pop to the parent (no-op at the root) — the parent REBUILDS from its builder.

#### Returns

`void`

***

### push()

> **push**(`build`, `data?`): `void`

Defined in: flow.ts:182

Push a child screen — the CURRENT screen is disposed (one screen lives at
a time). `data` is the route-param slot-diet: a builder is RETAINED on the
stack for every level (pop rebuilds from it), so a per-push arrow that
closes over its parameters costs a closure (~60–100 B measured, D4) per
level. Pushing a SHARED module-scope builder plus a plain `data` value
retains two array elements instead (`push(screen, i)` — the builder
receives it as its second argument, also on pop-rebuild).

#### Parameters

##### build

(`nav`, `data?`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

##### data?

`unknown`

#### Returns

`void`
