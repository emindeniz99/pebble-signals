[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [jsx-runtime](../README.md) / ErrorBoundaryProps

# Interface: ErrorBoundaryProps

Defined in: [jsx-runtime.ts:503](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L503)

Props for [ErrorBoundary](../functions/ErrorBoundary.md). Box coordinates size the host (like Show).

## Properties

### bottom?

> `optional` **bottom?**: `number`

Defined in: [jsx-runtime.ts:509](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L509)

***

### children

> **children**: () => [`JSXNode`](../type-aliases/JSXNode.md)

Defined in: [jsx-runtime.ts:513](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L513)

the subtree to protect — a thunk returning nodes (like Show's children).

#### Returns

[`JSXNode`](../type-aliases/JSXNode.md)

***

### fallback

> **fallback**: (`err`, `reset`) => [`JSXNode`](../type-aliases/JSXNode.md)

Defined in: [jsx-runtime.ts:515](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L515)

shown when the subtree throws; `reset` re-runs `children` under a fresh root.

#### Parameters

##### err

`unknown`

##### reset

() => `void`

#### Returns

[`JSXNode`](../type-aliases/JSXNode.md)

***

### height?

> `optional` **height?**: `number`

Defined in: [jsx-runtime.ts:505](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L505)

***

### left?

> `optional` **left?**: `number`

Defined in: [jsx-runtime.ts:506](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L506)

***

### right?

> `optional` **right?**: `number`

Defined in: [jsx-runtime.ts:507](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L507)

***

### skin?

> `optional` **skin?**: `Skin` \| `SkinDictionary`

Defined in: [jsx-runtime.ts:510](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L510)

***

### style?

> `optional` **style?**: `Style` \| `StyleDictionary`

Defined in: [jsx-runtime.ts:511](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L511)

***

### top?

> `optional` **top?**: `number`

Defined in: [jsx-runtime.ts:508](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L508)

***

### width?

> `optional` **width?**: `number`

Defined in: [jsx-runtime.ts:504](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/jsx-runtime.ts#L504)
