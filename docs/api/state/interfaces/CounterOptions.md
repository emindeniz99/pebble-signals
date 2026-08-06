[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [state](../README.md) / CounterOptions

# Interface: CounterOptions

Defined in: [state.ts:77](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/state.ts#L77)

Options for [useCounter](../functions/useCounter.md): step size and optional inclusive bounds.

## Properties

### max?

> `optional` **max?**: `number`

Defined in: [state.ts:83](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/state.ts#L83)

Inclusive upper bound — values above it clamp down. Omitted = unbounded above.

***

### min?

> `optional` **min?**: `number`

Defined in: [state.ts:81](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/state.ts#L81)

Inclusive lower bound — values below it clamp up. Omitted = unbounded below.

***

### step?

> `optional` **step?**: `number`

Defined in: [state.ts:79](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/state.ts#L79)

Amount `inc`/`dec` move the count by. Default `1`.
