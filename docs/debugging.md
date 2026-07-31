# Debugging on the watch — triage guide

Device errors are terse (XS gives no stack traces or line numbers on the
Pebble port), so debugging is pattern-matching against known failure shapes.
This is the collected triage table — every entry has a receipt in this repo's
history. Start with `pnpm run dev -- --app <name>` (build → install → live
logs in one command; `--watch` rebuilds on save).

**Jump by symptom:** app bounces to watchface at boot → [memory full at
boot](#fxabort-memory-full-at-boot-app-bounces-to-the-watchface) · dies on
interaction → [memory full at runtime](#fxabort-memory-full-at-runtime-app-dies-on-interaction)
· boots on Node but not the watch → [stack overflow](#fxabort-javascript-stack-overflow-at-boot-not-memory-full)
· installs but never appears → [silent boot](#app-installs-but-never-appears--bounces-instantly-with-no-logs)
· `TypeError: call: not a function` → [an escaped useState accessor](#typeerror-call-not-a-function-an-escaped-usestate-accessor)
· a binding shows nothing → handbook gotchas 16/20 (blank font, width-less
container, `.value` misuse — the build's fontcheck + lint-reads catch most) ·
need a live log line → [the dev-log bridge](#emulator-misbehaving-installs-hang-buttons-drop).

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

## `fxAbort JavaScript stack overflow:` at boot (NOT memory full)

A DIFFERENT limit than the arena — the mod's fixed JS value stack (the mod
cannot grow it; creation is ignored). The render→effect call chain went too
DEEP, not too wide. This is finite recursion hitting a low ceiling, so it
reproduces on device but NOT under Node (`pnpm test`, huge host stack) — do
not expect the sandbox to catch it. Distinguish it from `memory full` by
reading the actual abort line in the boot log, not by symbol counts.

Checklist:
1. **Read the abort reason.** `fxAbort JavaScript stack overflow` ≠
   `fxAbort memory full`. Symbol/byte diets (`--no-crash-ui`, flow diet,
   symbol-rename) do NOTHING for a stack-overflow — they remove code and
   symbols, not call frames.
2. **Nested `createRoot`?** `Navigator.swap()` opens a second owner scope
   INSIDE render's own build, ~doubling the deepest chain. A deep reactive
   tree under a Navigator is the classic offender (navreactive, Round 7
   field-note). A flatter tree, or fewer Navigator levels live at once,
   buys depth back.
3. **Marginal is the norm.** The budget is small enough that a couple of
   extra frames (a new wrapper fn in the render path) tips an app that
   booted yesterday. Bisect by reading the abort reason on each side, not
   heartbeat counts — a crash screen ALSO emits `instruments:` heartbeats,
   so "8 heartbeats" is not proof of a healthy boot; screenshot to confirm
   real content vs the crash UI.

## `TypeError: call: not a function` (an escaped useState accessor)

A callback reached through an object turned out to be `undefined`. The
historical cause (the pulse incident): passing a `useState` getter/setter as
a VALUE — `boot({ setName })` — while the lowering rewrote the pair and
removed the binding, leaving `setName` dangling. Two guards now stand between
you and this crash, so on a current build you should never see it:

1. **Build time:** lint-reads rule 5 fails the build on any accessor escape
   (`[setter-as-value]` / `[getter-as-value]`) and names the fix — wrap it:
   `boot({ setName: (v) => setName(v) })`.
2. **Compile time:** even with the lint bypassed (`LINT_READS=0`), the
   lowering now SEES shorthand/export escapes and bails the pair to the heap
   object API instead of miscompiling (device-verified:
   `screenshots/rule5-escape-bail-gabbro.png` boots the once-fatal shape).

If you still hit this error, the failing callee is your own object plumbing
(a ctx field never assigned, a lazy module loaded before its wiring ran) —
not the reactive pair. Prefer the wrap over the bypass regardless: a bailed
pair costs arena bytes (Rule 4).

## App installs but never appears / bounces instantly with NO logs

- Boot abort happened before the log listener attached. Re-run with
  `pnpm run dev` (logs attach right after install) or use the screenshot
  verdict: black screen = app, gray watchface = it died (tools/drive.py
  `d:<name>` dumps a frame; the brightness heuristic in the repo history
  separates them cleanly).
- A WATCHFACE build (`watchapp.watchface: true`) has no launcher entry — it
  appears as the active face, not in the menu. Check which you built.

## Effect errors: the crash screen (default) and the ladder

An escaped reactive error does NOT vanish. The report() ladder (2026-07
redesign) decides what happens, in order:

1. `globalThis.__spError` installed → the handler owns the policy — contain
   by returning, escalate by rethrowing (dev strict mode). It also owns
   logging: report() prints nothing for it.
2. Else the FULL error is logged — ALWAYS, even when a boundary is about to
   catch it (owner decision: a caught error is still worth a log line;
   visible in Node/xsbug, a free no-op on release firmware where JS `trace`
   is dead). Then:
   - the nearest **`<ErrorBoundary>`** in scope catches it: its
     `fallback(err, reset)` renders in place of the subtree, the rest of
     the app keeps running, `reset` re-runs the children. Inner boundaries
     catch before outer ones; a fallback that throws escalates outward.
   - else `render()`'s DEFAULT boundary paints a **crash screen**: the whole
     tree is disposed and the actual error (name/message/stack, newlines
     packed to `" ~ "`) is drawn on the watch with
     `[select: retry · back: exit]`. SELECT re-runs the app build under a
     fresh root (component state resets); BACK rethrows the original error
     → fxAbort with stack in the log → the host exits the mod.
     Drive-verified loop: `screenshots/crash-boundary-gabbro.png` →
     `crash-retry-gabbro.png` → `crash-exit-gabbro.png`.
   - `render(build, dict, {boundary: false})` (strict): log, then PROPAGATE
     — first-render errors abort module load, re-run errors escape the
     setter (fxAbort). Dead but loud.
   - No boundary at all (bare core, unit tests): log and contain — the node
     keeps its last good value.

For a custom dev channel, define the hook early in the app:

```js
globalThis.__spError = (e) => trace("effect error: " + e.message + "\n");
```

## Emulator misbehaving (installs hang, buttons drop)

- Rule 3: `tools/reset-emulator.sh gabbro`, then retry the first cold-boot
  install once. `pnpm run dev` already does this automatically.
- NEVER run `pebble logs` while an install is in flight — the channel races
  and the install times out (measured repeatedly; dev.mts sequences them).
- Button/menu driving: kill pypkjs first (`pkill -9 -f '[p]ypkjs'` — the qemu
  port is single-client), then `tools/drive.py gabbro b:select s:1 d:shot`.
- The 4.17 instrumentation stream not attaching (memtest "no instrumentation
  received") is a known open issue — heap numbers come from boot logs
  (`instruments:` lines) when they appear, not from memtest, until fixed.
- **Live log LINES from release firmware — use the dev-log bridge** (the
  `devlog` example): watch-side `trace`/`console.log` never reach `pebble
  logs`, but AppMessage does. Send `"spdev: …"` strings through
  `pebble/message` (key `"log"`) and the pkjs tap prints them phone-side —
  visible as `pkjs> … spdev: …` lines (device-verified). Wire
  `globalThis.__spError` to it and contained errors ship too. Needs pypkjs
  ALIVE (it hosts pkjs) — the opposite of button driving above.

## What we cannot give you (yet)

- **Line numbers / stack traces on device** — the port strips them; XS debug
  builds need `kModdableCreationFlagDebug` + a BT debugger connection the
  emulator setup here doesn't provide. Node-side reproduction is the tool:
  the same runtime runs under `pnpm test`'s vm sandbox and `pnpm run test:xs`
  (real XS!) — reproduce the logic there, where you have real errors.
