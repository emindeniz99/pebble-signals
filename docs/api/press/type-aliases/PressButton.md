[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [press](../README.md) / PressButton

# Type Alias: PressButton

> **PressButton** = `"Select"` \| `"Up"` \| `"Down"` \| `"Back"`

Defined in: [press.ts:57](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/press.ts#L57)

The hardware button a press-gesture hook watches — the suffix appended to
`onPress` / `onRelease` to form the jsx-runtime button-event keys: `"Select"` →
`onPressSelect` / `onReleaseSelect`, `"Up"` → `onPressUp` / `onReleaseUp`, and so
on for `"Down"` / `"Back"`, the four buttons Piu delivers to the focused content.
