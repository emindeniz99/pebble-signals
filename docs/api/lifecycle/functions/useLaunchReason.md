[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [lifecycle](../README.md) / useLaunchReason

# Function: useLaunchReason()

> **useLaunchReason**(): [`LaunchInfo`](../interfaces/LaunchInfo.md)

Defined in: lifecycle.ts:169

useLaunchReason() — a ONE-SHOT read of why the app launched (`watch.launch`).

  const { reason, arguments: arg } = useLaunchReason();
  <Label string={"launched: " + reason} />   // reason never changes at runtime

No subscription, no cleanup: launch info is fixed for the run, so this is a
plain read — call it anywhere, it needs no reactive owner. Returns a fresh
`{ reason, arguments }` (the host mints a new object each read). On a host
WITHOUT the bare `watch` global (Node / tests) it degrades to
`{ reason: 0, arguments: 0 }` and never throws.

## Returns

[`LaunchInfo`](../interfaces/LaunchInfo.md)

`{ reason, arguments }` — the AppLaunchReason and unsigned launch arg
