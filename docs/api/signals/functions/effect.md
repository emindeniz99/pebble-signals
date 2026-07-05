[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [signals](../README.md) / effect

# Function: effect()

> **effect**(`fn`): `number`

Defined in: signals.ts:495

Run `fn` now and re-run it whenever a signal it READ changes. Dependencies
are re-tracked every run (conditional deps work). Returns an integer effect
id — dispose with [dispose](dispose.md), or [track](track.md) it to an owner. A bare
`effect()` is NOT auto-owned; the hooks ([useEffect](useEffect.md)) track for you.

## Parameters

### fn

`EffectFn`

## Returns

`number`
