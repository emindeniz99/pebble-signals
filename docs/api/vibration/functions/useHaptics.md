[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [vibration](../README.md) / useHaptics

# Function: useHaptics()

> **useHaptics**(): [`Haptics`](../interfaces/Haptics.md)

Defined in: vibration.ts:93

useHaptics() — fire the vibration motor: the RN `Vibration` / react-pebble
`useVibration` analog. Returns a small command object; call its methods from an
event handler or effect (never module scope).

  const h = useHaptics();
  <Button label="OK" onPress={() => { doSave(); h.short(); }} />
  h.pattern([100, 50, 100]);   // buzz-pause-buzz

Resolves the host `pebble/vibes` class lazily (Rule 1 — no load-time host
access) and maps short/long/double/pattern/cancel onto its static methods.
There is no instance to share or free (unlike the accelerometer), so calling
this in N components is N cheap resolves, no singleton. The motor is cancelled
automatically when the owning screen is disposed (onCleanup) so a long pattern
never bleeds into the next screen — call inside a render root / component body
so that binds (Rule 5). NOTE: the physical buzz is not observable on QEMU (no
motor / no `pebble emu-vibe`) — the JS surface is device-buildable, the buzz is
felt only on real hardware.

## Returns

[`Haptics`](../interfaces/Haptics.md)

a [Haptics](../interfaces/Haptics.md) command object (short/long/double/pattern/cancel)
