[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / ReadonlySignal

# Interface: ReadonlySignal\<T\>

Defined in: signals.ts:245

A derived, read-only reactive value — what [computed](../functions/computed.md) returns. Reading
`.value` inside an effect subscribes; writing it is a type error (a computed
is recomputed from its dependencies, never assigned).

## Type Parameters

### T

`T`

## Properties

### value

> `readonly` **value**: `T`

Defined in: signals.ts:246
