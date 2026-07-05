[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / ErrorBoundaryProps

# Type Alias: ErrorBoundaryProps

> **ErrorBoundaryProps** = [`BoxProps`](BoxProps.md) & `object`

Defined in: flow.ts:70

## Type Declaration

### children

> **children**: `Thunk`\<[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)\>

the subtree to protect — a thunk returning nodes (like Show's children).

### fallback

> **fallback**: (`err`, `reset`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

shown when the subtree throws; `reset` re-runs `children` under a fresh root.

#### Parameters

##### err

`unknown`

##### reset

() => `void`

#### Returns

[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)
