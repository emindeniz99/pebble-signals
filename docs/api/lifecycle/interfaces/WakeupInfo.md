[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [lifecycle](../README.md) / WakeupInfo

# Interface: WakeupInfo

Defined in: [lifecycle.ts:115](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/lifecycle.ts#L115)

A fired wakeup — [useWakeup](../functions/useWakeup.md)'s `last` value and the "wakeup" event payload.

## Properties

### cookie

> **cookie**: `number`

Defined in: [lifecycle.ts:119](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/lifecycle.ts#L119)

The int32 cookie that was scheduled with it.

***

### id

> **id**: `number`

Defined in: [lifecycle.ts:117](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/lifecycle.ts#L117)

The WakeupId of the wakeup that fired (matches a [Wakeup.schedule](Wakeup.md#schedule) return).
