[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [lifecycle](../README.md) / WakeupInfo

# Interface: WakeupInfo

Defined in: lifecycle.ts:106

A fired wakeup — [useWakeup](../functions/useWakeup.md)'s `last` value and the "wakeup" event payload.

## Properties

### cookie

> **cookie**: `number`

Defined in: lifecycle.ts:110

The int32 cookie that was scheduled with it.

***

### id

> **id**: `number`

Defined in: lifecycle.ts:108

The WakeupId of the wakeup that fired (matches a [Wakeup.schedule](Wakeup.md#schedule) return).
