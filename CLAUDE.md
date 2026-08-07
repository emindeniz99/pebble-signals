# Claude Rules — pebble-signals

Rules for AI assistants working in this repository.

## Rule 1 — Read the official docs FIRST, then verify against source

**Before debugging any Pebble/Alloy/Piu/Moddable behavior, read the official
docs at <https://developer.repebble.com> (guides + examples) properly — the
EXAMPLES especially — and only then cross-check the SDK source.**

This is a hard rule with a receipt: the SVGImage/PDC "invisible circle" bug
burned many debugging rounds (bytes diffed, bundling probed, validation
proved, color/positioning/transform-trigger all guessed at) when the docs'
examples already showed the answer implicitly — every official example
applies transforms POST-mount inside behavior callbacks. Reading the docs
example first and asking "why does theirs differ from ours?" would have
found `PiuSVGImageBind` clobbering `cx/cy` in minutes, not hours.

Method, in order:
1. Find the relevant guide AND a working example on developer.repebble.com
   (or Moddable-OpenSource/pebble-examples).
2. Mirror the example's exact usage pattern first; make it work unchanged.
3. Only then diverge, one variable at a time.
4. Use the SDK source (`$SDK/toolchain/moddable/`) to explain *why* the
   pattern is required — source explains docs, it does not replace them.

## Rule 2 — Measured numbers or it didn't happen

Every claim about memory/limits in README must come from an on-device (QEMU)
measurement, and say so. When a prior conclusion is overturned (it happens —
see gotcha 16, the fetch correction, the SVGImage saga), correct the README
explicitly rather than silently.

## Rule 3 — Recovering a wedged emulator

When `pebble install --emulator` starts hanging/failing and
`/tmp/pb-emulator.json` shows an empty platform entry, the per-platform
PERSIST dir is corrupt (not just the SPI flash). Run
`tools/reset-emulator.sh [platform]` — it hard-kills qemu+pypkjs and wipes
the whole state dir; `pebble` re-extracts a clean one on next install.
Retry the first cold-boot install once. Do NOT chase it with flash-only
deletes — that was the multi-hour red herring.

**Log capture recipe (2026-07 deep dive — do NOT rediscover this):**
`pebble logs` printing nothing does NOT mean the app is silent. pebble-tool
spawns pypkjs with stdout/stderr → devnull, and captures split across
separate shell invocations die with their processes. Capture in ONE shell
invocation, install in the FOREGROUND:

```bash
pebble logs --emulator gabbro > /tmp/cap.txt 2>&1 &
sleep 3
pebble install --emulator gabbro      # foreground — relaunches the app
sleep 10
kill %1; grep instruments /tmp/cap.txt   # heartbeats = capture worked
```

A capture with zero `instruments:` lines is a dead transport, not a quiet
app — reset (above) and retry; `pebble install -v` prints the qemu/pypkjs
command lines and often succeeds where piped/backgrounded installs
misleadingly "fail". Know the channels: on RELEASE firmware, JS
`trace`/`console.log` from a mod is a NO-OP (never reaches `pebble logs`);
what you CAN see is C-side APP_LOG (instruments, fxAbort + stack) and
`pkjs>` lines (PKJS-side console). Route diagnostics through
`globalThis.__spError` or the UI, not trace — and remember the DEFAULT
render() error boundary already paints escaped errors on the watch
itself (crash screen; `pebble screenshot` captures it as a receipt).

**Screenshot capture recipe (2026-07 — do NOT rediscover this):** two failure
modes bite when capturing catalog receipts, both MEASURED on gabbro:

1. **Cold-boot timing.** After `tools/reset-emulator.sh`, the FIRMWARE itself
   cold-boots for ~30 s BEFORE the installed app loads. A `pebble screenshot`
   taken at the old ~18 s settle grabs a firmware-boot / empty
   "Install an app to continue" frame, not the app. **Wait ≥ 32 s** after
   `pebble install` on a freshly-reset emulator before the first screenshot.
2. **Within-session transport rot.** pypkjs/libpebble2's screenshot transport
   degrades as a session accumulates installs: after ~4–8 it starts returning
   `libpebble2.exceptions.TimeoutError` (0-byte) OR a STALE frame (the last
   app that actually rendered — a size check does NOT catch this). A hard
   reset does NOT clear it (it is process/session state, not the persist dir;
   both gabbro AND emery rot together). The FIRST app after a reset is the
   reliable capture, so the robust pattern is **reset-per-app**:
   `reset → install ONE app → sleep 34 → screenshot (retry a few times)`. Even
   so it lands only intermittently (~1 in 5 once rotted); a fresh SESSION
   (new container) is the only full fix.

**BYPASS the rotted screenshot transport with the qemu MONITOR screendump
(MEASURED 2026-07-21 — do NOT forget this).** `pebble screenshot` and `pebble
logs` both ride the pypkjs/libpebble2 transport that rots; the qemu MONITOR is
a separate localhost TCP socket that keeps working. Read the monitor port from
`/tmp/pb-emulator.json` (`<plat>.<ver>.qemu.monitor`), connect, send
`screendump /path.ppm\n`, then convert the PPM with PIL — this dumped a real
260×260 framebuffer when `pebble screenshot` was 100% dead (0/10). `tools/
drive.py` already uses exactly this. TWO catches: (a) it captures whatever is
ON SCREEN, so the app must be launched first — and `pebble install` (the launch
path) ALSO rides pypkjs and eventually stops landing (~1 in 5, then 0), so you
still need an install to land to get the app up; (b) a monitor `system_reset`
reboots qemu but does NOT relaunch a watchface (boots to the launcher). Net: the
screendump makes the *capture* reliable, but launching the app still needs a
pypkjs install to land — so it extends a session's usable captures, it does not
fully replace a fresh container. It also catches CRASH-to-launcher: install →
dump-immediately caught the sloth face, then repeated dumps showed the launcher
= the watchface rendered then died (the D2 OOM receipt in review-findings.md).

**Reading the XS memory instruments (MEASURED 2026-07-28 — the D4 route).**
The per-second `instruments:` lines (chunk used/avail, slot used/avail, stack,
GC count, keys) stream through `pebble logs` ONLY when the log capture is
attached to a LIVE pypkjs BEFORE the app's XS machine is created — attach
`pebble logs` first, then relaunch with a foreground `pebble install`, then
drive buttons with `pebble emu-button` (which composes with pypkjs; drive.py's
serial buttons need pypkjs DEAD instead, and its monitor screendump composes
with either). The direct-transport enable `tools/memtest.py` sends is NOT
reliably honored (same class as the drive.py `listen:` caveat). Column map
for the numeric line: …,[7] chunk used,[8] chunk avail,[9] slot used,[10]
slot avail,[11] stack peak,[12] stack total (6144),[13] GC runs,[14] keys.
Slot+chunk avail together track the 26624 B arena budget (32768 − 6144).

**ALWAYS pass `--no-open` to `pebble screenshot`.** Without it every capture
auto-opens in the host's image viewer and steals the owner's window focus —
a 14-frame burst threw 14 Preview windows onto the owner's desktop
(2026-08-06). Agents cannot close them afterwards either (macOS blocks
Apple events to Preview), so the only fix is not opening them at all.

**ALWAYS verify a captured PNG by READING it** (not just a size check): the
empty-home frame, a stale previous-app frame, and a `render() threw` crash
screen all pass `size > 800 B`. A crash-screen capture is a genuine receipt of
a DEVICE BUG (it caught `bold 30px Bitham` → `font not found: Bitham-Bold-30`,
now rejected by fontcheck) — but it is NOT the component's render receipt.

## Rule 4 — The XS heap is the scarcest resource

The JS heap ("arena") is firmware-fixed at 32KB and every design decision
bends around it. Trade CPU for RAM freely — recompute, don't cache; bytes,
not objects; indices, not references. See README "gotchas" and
`docs/xs-heap-playbook.md` for the current trick inventory.

## Rule 5 — Commits and merging (carried from the monorepo at graduation)

Conventional Commits with a **mandatory area scope** — the full convention
with examples lives in [CONTRIBUTING.md](./CONTRIBUTING.md) "Commit
conventions". The parts that get bounced when skipped:

- `<type>(<scope>): <subject>` — scope names the AREA (`runtime`, `flow`,
  `build`, `lower`, `docs`, `handbook`, `site`, `examples`, `templates`,
  `tests`, `ci`, `repo`), never bare `feat: …` and never the package name
  (post-graduation `pebble-signals` as a scope carries zero information).
- Imperative mood, lowercase, no trailing period, header ≤ 72 chars; body
  explains the WHY (constraint, measurement, rejected alternative) — never a
  restatement of the diff. One commit = one reason.
- AI-assisted work is disclosed with a `Co-Authored-By:` trailer naming the
  MODEL that actually did it (`Co-Authored-By: Claude Opus 5
  <noreply@anthropic.com>`) — never a fixed string, and the same trailer on
  every surface: commits, PR bodies, and substantive PR/issue comments. No
  emoji "generated with" footers.
- **Merging is always a real merge commit** — never squash, never
  rebase-merge. Per-commit history is the record of how the work was built;
  squashing on `main` destroys it irreversibly. The only exception is the
  repo owner explicitly asking for a squash on that specific PR.
