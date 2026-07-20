[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [lifecycle](../README.md) / useAppFocus

# Function: useAppFocus()

> **useAppFocus**(): () => `boolean`

Defined in: lifecycle.ts:188

useAppFocus() — reactive app-focus state (true while the app owns the screen).

  const focused = useAppFocus();
  <Label string={() => (focused() ? "focused" : "covered")} />

SEEDS `true` (an app is in focus at launch; the host's first didFocus fire is
deferred, not synchronous), then the host "didFocus" event (a boolean) writes
it. Uses the bare `watch` global directly; the listener is removed via
onCleanup when the owner is disposed, so CALL THIS INSIDE a render root /
component body (Rule 5).

DEVICE-GATED: the "didFocus" event is EMULATOR-UNCERTAIN — the native
app_focus_service subscription is real and the hook is correct, but QEMU may
not deliver didFocus, so the seed can stay put under the emulator. Verify on
hardware.

## Returns

a getter `() => boolean` — reactive; call inside a thunk to subscribe

() => `boolean`
