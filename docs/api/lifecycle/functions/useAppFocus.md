[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [lifecycle](../README.md) / useAppFocus

# Function: useAppFocus()

> **useAppFocus**(`phase?`): () => `boolean`

Defined in: [lifecycle.ts:210](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/lifecycle.ts#L210)

useAppFocus() — reactive app-focus state (true while the app owns the screen).

  const focused = useAppFocus();
  <Label string={() => (focused() ? "focused" : "covered")} />
  const soon = useAppFocus("will");   // same boolean, fired EARLIER

SEEDS `true` (an app is in focus at launch; the host's first focus fire is
deferred, not synchronous), then the host focus event (a boolean) writes it.
Uses the bare `watch` global directly; the listener is removed via onCleanup
when the owner is disposed, so CALL THIS INSIDE a render root / component body
(Rule 5). Want BOTH edges? Call it twice — the phases are independent
subscriptions on the host's one native service.

DEVICE-GATED: the focus events are EMULATOR-UNCERTAIN — the native
app_focus_service subscription is real, the hook is correct and subscribing is
device-proven no-throw for both phases, but QEMU may not DELIVER them, so the
seed can stay put under the emulator. Verify on hardware.

## Parameters

### phase?

[`FocusPhase`](../type-aliases/FocusPhase.md) = `"did"`

`"did"` (default) subscribes to "didFocus" — the change is done;
  `"will"` subscribes to "willFocus" — the change is starting.

## Returns

a getter `() => boolean` — reactive; call inside a thunk to subscribe

() => `boolean`
