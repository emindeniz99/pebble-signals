[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [accel](../README.md) / useAccel

# Function: useAccel()

> **useAccel**(`opts?`): () => [`AccelSample`](../interfaces/AccelSample.md)

Defined in: accel.ts:175

Reactive accelerometer — the RN `Accelerometer` analog. Returns a getter for
the latest reading; reading it inside a Label binding / effect subscribes, so
the UI repaints fine-grained on every sample.

  const accel = useAccel();                 // default 25 Hz
  <Label string={() => `x ${accel().x}`} /> // reactive; RAW milli-g
  const fast = useAccel({ hz: 100 });        // 100 Hz sampling

All callers share ONE host Accelerometer (the C wrapper allows only one) and
ONE backing signal, so N components cost one instance. `hz` (10|25|50|100,
default 25) is applied ONCE by whichever hook first builds the instance;
later callers share its rate (see the module header). The instance is closed
automatically when the last useAccel/useTap owner is disposed — call this
inside a render root / component body so onCleanup can bind (Rule 5).

## Parameters

### opts?

optional `{ hz }` sampling rate — 10, 25, 50 or 100 Hz (default 25)

#### hz?

`10` \| `25` \| `50` \| `100`

## Returns

a getter `() => { x, y, z }` of RAW milli-g values (reactive; seeded {0,0,0})

() => [`AccelSample`](../interfaces/AccelSample.md)
