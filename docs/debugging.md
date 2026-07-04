# Debugging on the watch — triage guide

Device errors are terse (XS gives no stack traces or line numbers on the
Pebble port), so debugging is pattern-matching against known failure shapes.
This is the collected triage table — every entry has a receipt in this repo's
history. Start with `npm run dev -- --app <name>` (build → install → live
logs in one command; `--watch` rebuilds on save).

## `fxAbort memory full:` at boot (app bounces to the watchface)

The 32KB XS arena ran out DURING boot. Checklist, in order:

1. **Mod size.** `stat -c%s build/mods/gabbro/mc.xsa` — the boot arena floor
   tracks runtime size; measured threshold ≈ **14.5–14.9KB**. Post-pruning
   builds sit ~10–13KB, so a modern build over 14KB means something is off.
2. **Is pruning on?** The build should print `prune: … demoted N exports`
   lines. If it printed a treeshake SKIP (dynamic import in the app), pruning
   self-disabled with it — every runtime export ships. Avoid dynamic
   `import()` in app code unless you need it (see multilazy).
3. **App class.** Post-pruning, clock-class UIs (2 styles / 3 labels /
   interval) boot fine (measured). If a much heavier tree dies, apply the
   heap playbook: fewer live nodes (VirtualList recycling), byte store for
   data, one screen at a time (Navigator).

## `fxAbort memory full:` at RUNTIME (app dies on interaction)

Steady-state leak or spike: usually a subtree swap allocating before the old
side is freed (prefer `keepAlive` on Show), a collection kept as JS objects
(use `createStore` — bytes not slots), or effects leaking (since the 2026-07
running-owner round, `effect()` auto-registers with the innermost owner —
running effect or root — so nested effects no longer accumulate; a TOP-LEVEL
effect with no owner is still yours to `dispose()`).

## App installs but never appears / bounces instantly with NO logs

- Boot abort happened before the log listener attached. Re-run with
  `npm run dev` (logs attach right after install) or use the screenshot
  verdict: black screen = app, gray watchface = it died (tools/drive.py
  `d:<name>` dumps a frame; the brightness heuristic in the repo history
  separates them cleanly).
- A WATCHFACE build (`watchapp.watchface: true`) has no launcher entry — it
  appears as the active face, not in the menu. Check which you built.

## Effect errors (not aborts)

A throwing effect does NOT kill the machine: the runtime routes subscriber
exceptions to `globalThis.__spError` (XS would otherwise abort the app on an
uncaught throw). Define it early in the app for visibility:

```js
globalThis.__spError = (e) => trace("effect error: " + e.message + "\n");
```

## Emulator misbehaving (installs hang, buttons drop)

- Rule 3: `tools/reset-emulator.sh gabbro`, then retry the first cold-boot
  install once. `npm run dev` already does this automatically.
- NEVER run `pebble logs` while an install is in flight — the channel races
  and the install times out (measured repeatedly; dev.mts sequences them).
- Button/menu driving: kill pypkjs first (`pkill -9 -f '[p]ypkjs'` — the qemu
  port is single-client), then `tools/drive.py gabbro b:select s:1 d:shot`.
- The 4.17 instrumentation stream not attaching (memtest "no instrumentation
  received") is a known open issue — heap numbers come from boot logs
  (`instruments:` lines) when they appear, not from memtest, until fixed.

## What we cannot give you (yet)

- **Line numbers / stack traces on device** — the port strips them; XS debug
  builds need `kModdableCreationFlagDebug` + a BT debugger connection the
  emulator setup here doesn't provide. Node-side reproduction is the tool:
  the same runtime runs under `npm test`'s vm sandbox and `npm run test:xs`
  (real XS!) — reproduce the logic there, where you have real errors.
