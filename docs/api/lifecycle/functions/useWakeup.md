[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [lifecycle](../README.md) / useWakeup

# Function: useWakeup()

> **useWakeup**(): [`Wakeup`](../interfaces/Wakeup.md)

Defined in: lifecycle.ts:224

useWakeup() — the wakeup scheduler plus a reactive `last`-fired event.

  const wakeup = useWakeup();
  // from a button: schedule ~60s out with cookie 1
  const id = wakeup.schedule(Date.now() + 60000, 1);
  <Label string={() => "last woke by cookie " + (wakeup.last()?.cookie ?? "-")} />

Wraps importNow("pebble/wakeup").default (the Wakeup class) for
schedule/query/cancel, and owns a `last` signal SEEDED from `watch.wake` and
fed by the host "wakeup" event. `cancel()` with no argument cancels ALL
wakeups; `cancel(id)` cancels one (the host branches on argc — passing
`undefined` would cancel id 0, so this hook branches too). The "wakeup"
listener is removed via onCleanup, so CALL THIS INSIDE a render root /
component body (Rule 5).

DEVICE-FIRST: `last` only updates when a SCHEDULED wakeup actually FIRES (needs
a real schedule + the watch to reach that wall-clock time, usually on the NEXT
launch — inspect `last` / `watch.wake` then). schedule / query / cancel hit
real native services; exercise them on hardware.

## Returns

[`Wakeup`](../interfaces/Wakeup.md)

a [Wakeup](../interfaces/Wakeup.md) — `{ schedule, query, cancel, last }`
