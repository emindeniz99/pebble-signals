[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [accel](../README.md) / useTap

# Function: useTap()

> **useTap**(): () => [`TapDirection`](../type-aliases/TapDirection.md) \| `undefined`

Defined in: [accel.ts:199](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/accel.ts#L199)

Reactive single-tap direction — a signal of the LAST tap the wearer produced
(a flick of the wrist / a tap on the case). Returns a getter that is
`undefined` until the first tap, then the AXIS-FIRST direction string.

  const tap = useTap();
  <Label string={() => tap() ?? "tap me"} />  // "x+", "z-", ...

Shares the SAME single Accelerometer as [useAccel](useAccel.md) (the "only one" C
rule), building it at default 25 Hz if it is the first hook to run. Single tap
only — double-tap is deliberately not exposed (see the module header). Auto
cleaned up when the last accel/tap owner is disposed; call inside a render
root / component body (Rule 5).

## Returns

a getter `() => TapDirection | undefined` — the last tap, reactive

() => [`TapDirection`](../type-aliases/TapDirection.md) \| `undefined`
