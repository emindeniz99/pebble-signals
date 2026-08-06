[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [watchinfo](../README.md) / backlight

# Function: backlight()

> **backlight**(`on?`): `void`

Defined in: [watchinfo.ts:177](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L177)

Pulse or force the backlight — `watch.light` (`xs_global_light`,
device-present per the hostprobe receipt 2026-07-29).

  backlight();       // interaction pulse — lights up and times out on its
                     // own, exactly like a button press (app_light_enable_interaction)
  backlight(true);   // force ON until backlight(false) — drains the battery,
                     // use for short moments only

No-op (never throws) when the `watch` global is absent.

## Parameters

### on?

`boolean`

## Returns

`void`
