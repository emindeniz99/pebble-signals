[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [signals](../README.md) / ReadonlySignal

# Interface: ReadonlySignal\<T\>

Defined in: [signals.ts:278](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L278)

A derived, read-only reactive value — what [computed](../functions/computed.md) returns. Reading
`.value` inside an effect subscribes; writing it is a type error (a computed
is recomputed from its dependencies, never assigned).

## Type Parameters

### T

`T`

## Properties

### value

> `readonly` **value**: `T`

Defined in: [signals.ts:279](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/signals.ts#L279)
