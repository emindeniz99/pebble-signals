[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [lifecycle](../README.md) / Wakeup

# Interface: Wakeup

Defined in: lifecycle.ts:134

What [useWakeup](../functions/useWakeup.md) returns: the wakeup scheduler plus a reactive `last`.

## Properties

### cancel

> **cancel**: (`id?`) => `void`

Defined in: lifecycle.ts:146

Cancel ONE wakeup by id, or — called with NO argument — cancel ALL of them.

#### Parameters

##### id?

`number`

#### Returns

`void`

***

### last

> **last**: () => [`WakeupInfo`](WakeupInfo.md) \| `undefined`

Defined in: lifecycle.ts:152

The most recently FIRED wakeup as `{ id, cookie }`, or `undefined`. Seeded
from `watch.wake` (the wakeup that launched the app, if any) and updated on
every "wakeup" event. REACTIVE — read inside a thunk / effect to repaint.

#### Returns

[`WakeupInfo`](WakeupInfo.md) \| `undefined`

***

### query

> **query**: (`id`) => `unknown`

Defined in: lifecycle.ts:144

Query a scheduled wakeup by id — the host `{ time, scheduled }` shape.

#### Parameters

##### id

`number`

#### Returns

`unknown`

***

### schedule

> **schedule**: (`time`, `cookie?`, `notifyIfMissed?`) => `number`

Defined in: lifecycle.ts:142

Schedule a wakeup at `time` (JS epoch MS; the host converts to unix
seconds). `cookie` (int32, default 0) is echoed back on the event;
`notifyIfMissed` (default false) asks the system to still deliver it if the
watch was off at `time`. Returns the new WakeupId (the host THROWS on a
scheduling error).

#### Parameters

##### time

`number`

##### cookie?

`number`

##### notifyIfMissed?

`boolean`

#### Returns

`number`
