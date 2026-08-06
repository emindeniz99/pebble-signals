[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [watchinfo](../README.md) / exitApp

# Function: exitApp()

> **exitApp**(`reason?`): `void`

Defined in: [watchinfo.ts:190](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/watchinfo.ts#L190)

Exit the app programmatically — `watch.exit` (`xs_global_exit`: optional
exit-reason int, then pops the whole window stack back to the launcher /
watchface). The "Quit" menu-item primitive. Device-present per the
hostprobe receipt (2026-07-29; presence-probed — calling it ends the app,
which is the point). No-op when the `watch` global is absent.

## Parameters

### reason?

`number`

## Returns

`void`
