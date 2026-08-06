[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [anim](../README.md) / SpringOptions

# Type Alias: SpringOptions

> **SpringOptions** = `object`

Defined in: [anim.ts:249](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L249)

Options for [useSpring](../functions/useSpring.md).

## Properties

### damping?

> `optional` **damping?**: `number`

Defined in: [anim.ts:253](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L253)

Velocity damping. Higher = less overshoot/bounce. Default 26 (RN default).

***

### from?

> `optional` **from?**: `number`

Defined in: [anim.ts:259](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L259)

Value to spring FROM. Default: the target (a bare-number target then rests, no motion).

***

### mass?

> `optional` **mass?**: `number`

Defined in: [anim.ts:255](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L255)

Inertial mass. Higher = slower, heavier motion. Default 1.

***

### precision?

> `optional` **precision?**: `number`

Defined in: [anim.ts:257](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L257)

Settle threshold: stop when |x-target| and |velocity| both fall below this. Default 0.05.

***

### stiffness?

> `optional` **stiffness?**: `number`

Defined in: [anim.ts:251](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/anim.ts#L251)

Restoring force toward the target. Higher = snappier. Default 170 (RN default).
