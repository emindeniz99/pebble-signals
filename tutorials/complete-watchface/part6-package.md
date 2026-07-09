# Part 6 — package & install

Goal: the artifact. Everything before this produced a face; this part makes
it a thing you can put on watches.

## The .pbw

Every `node build.mts` run already ends with the installable bundle:

```
build/signal-piu.pbw
```

It contains BOTH platform builds (gabbro 260×260 round, emery 200×228 rect)
plus the phone-side pkjs — one file, every target. `pebble install
--emulator <platform>` sideloads exactly this artifact; a real watch takes
the same file through the phone app's developer mode or
`pebble install --phone <ip>`.

## App identity & the watchface flag

The app's identity lives in `package.json` (`pebble` section: uuid,
displayName, version). Two fields matter most:

- **`watchapp.watchface: true`** turns the app into a real FACE — launcher
  sets it as the active face, no button needed to run it. Device-verified by
  the `lazyauto` example, which boots as the active face and self-loads its
  40KB module afterwards. A watchface also loses button input (BACK exits is
  the system's) — the host even blocks `pebble/button` for faces, so design
  faces glanceable and put interaction in a companion app or the config page
  (part 4).
- **uuid** — generate a fresh one per app you ship; two apps sharing a uuid
  replace each other on install.

## Verify the bundle, not just the build

The repo's habit transfers: a green build proves compilation, not the face.
Before calling any face done, run it through the smoke recipe (install with
log capture — ≥3 heartbeats, no `fxAbort` — then a screenshot;
`tools/device-smoke.mts` automates it) on BOTH platforms; round vs rect
layout bugs are the most common last-mile surprise, and `screen.round` /
`screen.width` exist precisely so a face can adapt (the `deviceinfo` example
shows everything the host reports).

## Publishing

Distribution for today's Pebble ecosystem runs through the
[Rebble appstore](https://apps.rebble.io) — a developer account, the .pbw,
listing art, and per-platform screenshots (`pebble screenshot` produces
store-quality PNGs; this repo's receipts are made the same way). We have not
published one of these tutorial faces, so this part stops at the honest
boundary: the .pbw above is the exact artifact a store listing takes, and
sideloading it on real hardware is the same `pebble install` you've been
running all series.

— series end —
