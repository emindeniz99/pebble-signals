[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [watchinfo](../README.md) / watchInfo

# Function: watchInfo()

> **watchInfo**(): [`WatchInfo`](../interfaces/WatchInfo.md)

Defined in: watchinfo.ts:123

Read one-shot device + screen facts — the RN `Platform` analog.

  const info = watchInfo();
  <Label string={`model ${info.model}`} />
  <Label string={`fw ${info.firmware.major}.${info.firmware.minor}.${info.firmware.patch}`} />
  <Label string={info.hour12 ? "12h" : "24h"} />

Merges the bare `watch` global's getters (`model`, `firmwareVersion`,
`hour12`) with [useDisplayBounds](useDisplayBounds.md)'s screen subset into ONE flat object.
Every field is constant per boot — this is a PURE one-shot: no subscription,
no cleanup (bind with a static Label string, not a thunk). `watch` is
typeof-probed: on the (device-impossible) absence of the global it degrades
to zeros / false instead of throwing. Call inside the render() build, not at
module scope (screen validity — see the module header).

## Returns

[`WatchInfo`](../interfaces/WatchInfo.md)

the merged `{ model, firmware, hour12, width, height, round, color }`
