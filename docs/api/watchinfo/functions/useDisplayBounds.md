[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [watchinfo](../README.md) / useDisplayBounds

# Function: useDisplayBounds()

> **useDisplayBounds**(): [`DisplayBounds`](../interfaces/DisplayBounds.md)

Defined in: watchinfo.ts:96

Read the display geometry — the RN `useWindowDimensions` analog.

  const { width, height, round } = useDisplayBounds();
  <Label string={`${width}x${height}`} />

A ONE-SHOT snapshot of the jsx-runtime `screen` record (width/height/round/
color), constant for the life of the boot — NOT a subscription, so there is
no cleanup and a STATIC Label string (not a reactive thunk) is correct. MUST
be called once render() has started (inside a component body / the build
callback), or the screen fields read 0 — see the module header.

## Returns

[`DisplayBounds`](../interfaces/DisplayBounds.md)

the screen subset `{ width, height, round, color }` (a fresh object)
