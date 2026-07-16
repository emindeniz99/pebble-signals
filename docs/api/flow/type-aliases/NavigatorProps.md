[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / NavigatorProps

# Type Alias: NavigatorProps

> **NavigatorProps** = [`BoxProps`](BoxProps.md) & `object`

Defined in: flow.ts:140

Props for [Navigator](../functions/Navigator.md).

## Type Declaration

### root

> **root**: (`nav`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

The root screen builder. Every screen builder MUST return a CONTAINER
element (a bare Label crashes the swap), and screen state does NOT
survive a pop+rebuild — persist anything that must live in a signal
OUTSIDE the builder.

#### Parameters

##### nav

[`NavHandle`](NavHandle.md)

#### Returns

[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)
