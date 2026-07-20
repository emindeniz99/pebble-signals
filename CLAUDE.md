# Claude Rules — signal-piu

Project-specific rules for AI assistants working in `projects/signal-piu/`.
Root `CLAUDE.md` still applies.

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
