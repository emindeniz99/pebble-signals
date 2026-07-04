# original

A Pebble watchapp/watchface written in C using the Pebble SDK.

**Scaffolded exactly as a newcomer would get it**: `pebble new-project original
--c` (Pebble Tool v5.0.39, SDK v4.17) — no hand-recreation needed, the CLI
scaffold worked offline. The only edit on top of the generated skeleton is the
app logic itself: `src/c/original.c` was expanded from the generated
single-screen click-handler stub into a small, realistic 2-screen app (a
counter screen + a SELECT-pushed detail screen, BACK pops back) — see
`docs/migration.md` in the signal-piu package root for why: this is the
**before** half of the migration story, and
[`examples/migration/integrated/`](../integrated/) is the **same app** ported
to [signal-piu](https://www.npmjs.com/package/signal-piu).

## Building & running

```sh
pebble build                          # build for all targetPlatforms
pebble install --emulator emery       # install on the emery emulator
pebble install --phone <ip>           # install to a paired phone
```

## Target platforms

`targetPlatforms` in `package.json` controls which watches you build for. The
modern Pebble hardware is **emery** (Pebble Time 2), **gabbro** (Pebble Round
2), and **flint** (Pebble 2 Duo); the original Pebble platforms (aplite,
basalt, chalk, diorite) are included by default for backwards compatibility.

## Project layout

```
src/c/           C source for the watchapp
src/pkjs/        PebbleKit JS (phone-side) source, if any
worker_src/c/    Background worker source, if any
resources/       Images, fonts, and other bundled resources
package.json     Project metadata (UUID, platforms, resources, message keys)
wscript          Build rules — usually no need to edit
```

By default this project is configured as a watchapp. To make it a watchface,
set `pebble.watchapp.watchface` to `true` in `package.json`.

## Documentation

Full SDK docs, tutorials, and API reference: <https://developer.repebble.com>
