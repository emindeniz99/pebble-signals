[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [lifecycle](../README.md) / FocusPhase

# Type Alias: FocusPhase

> **FocusPhase** = `"did"` \| `"will"`

Defined in: [lifecycle.ts:185](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/lifecycle.ts#L185)

Which focus PHASE [useAppFocus](../functions/useAppFocus.md) tracks. Both host events carry the SAME
boolean and share ONE app_focus_service subscription (global.js events[6]/[7]
— see the module header); they differ only in WHEN they fire: `"did"` once the
focus change has COMPLETED, `"will"` as it BEGINS — the EARLIER signal, for
stopping work before an overlay finishes covering the app.
