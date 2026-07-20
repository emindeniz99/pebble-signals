[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [compass](../README.md) / useCompass

# Function: useCompass()

> **useCompass**(`opts?`): () => `number`

Defined in: compass.ts:151

Reactive magnetometer heading — the RN `Magnetometer` analog. Returns a getter
for the latest heading; reading it inside a Label binding / effect subscribes,
so the UI repaints on every sample.

  const heading = useCompass();               // default filter 2°
  <Label string={() => `${heading()}°`} />    // reactive; DEGREES, CCW
  const coarse = useCompass({ filter: 15 });   // emit only on >=15° changes

The heading is DEGREES 0..360 from magnetic north, increasing COUNTER-CLOCKWISE
(Rule 7 — the host convention; for a CLOCKWISE screen north-arrow rotate by
`360 - heading()`). It starts at 0 and updates on the first sample (the host has
no construction-time reading — see the module header). `filter` is the minimum
angular change in DEGREES before a new sample is emitted (a throttle; default 2),
applied ONCE by whichever hook first builds the instance; later callers share
its filter (see the module header). All callers share ONE host Compass (the C
wrapper allows only one) and ONE backing signal, so N components cost one
instance. The instance is closed automatically when the last useCompass owner is
disposed — call this inside a render root / component body so onCleanup can bind
(Rule 5).

## Parameters

### opts?

optional `{ filter }` — minimum angular change in degrees to emit (default 2)

#### filter?

`number`

## Returns

a getter `() => number` — heading in degrees 0..360, magnetic, CCW (reactive; seeded 0)

() => `number`
