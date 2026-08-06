[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [flow](../README.md) / NavigatorProps

# Type Alias: NavigatorProps

> **NavigatorProps** = [`BoxProps`](BoxProps.md) & `object`

Defined in: [flow.ts:191](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/flow.ts#L191)

Props for [Navigator](../functions/Navigator.md).

## Type Declaration

### root

> **root**: (`nav`) => [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

The root screen builder. The swap wraps every screen in a sized
Container before mounting (the pre-wrapper port crash behind the old
"must return a Container" rule; a fresh on-device probe of a bare-Label
screen through the wrapper is still pending — prefer a Column root
until it lands). Screen state does NOT survive a pop+rebuild — persist
anything that must live in a signal OUTSIDE the builder.

#### Parameters

##### nav

[`NavHandle`](NavHandle.md)

#### Returns

[`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)
