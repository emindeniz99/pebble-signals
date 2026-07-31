[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [jsx-runtime](../README.md) / Component

# Type Alias: Component\<P\>

> **Component**\<`P`\> = (`props`) => [`JSXNode`](JSXNode.md)

Defined in: jsx-runtime.ts:36

A component: a plain function that runs ONCE at mount (no re-render model)
and returns its subtree. Type props with the generic — `Component<{ n:
number }>`. The `P = void` default makes a prop-less ROOT component
callable with no arguments, which is exactly how the root-entry shim
mounts it (see handbook "root component entry"). Types only — zero runtime.

## Type Parameters

### P

`P` = `void`

## Parameters

### props

`P`

## Returns

[`JSXNode`](JSXNode.md)
