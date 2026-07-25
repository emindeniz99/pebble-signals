# Device smokes — the on-emulator verification catalog

The SDK-free gates (`pnpm run verify`: typecheck + 100% coverage + consumer
smoke) prove the LIBRARY is correct. (`pnpm run verify:full` adds the XS
conformance laws — those need the `xst` binary; see [xst setup](xst-setup.md).)
They cannot They cannot
prove an app still BOOTS on the firmware — the three fixed budgets (slot
heap, boot symbols, the 384-slot value stack) only exist on-device, and a
runtime change that is green everywhere else can still tip a canary over the
wall (it happened: commit 06b9f9f). This file is the catalog of on-device
smokes and the manual recipe behind each; `tools/device-smoke.mts` automates
the whole table.

## Run it

```bash
pnpm run smoke:device                                  # whole catalog, gabbro
node tools/device-smoke.mts --apps navmany,navreactive   # just the canaries
node tools/device-smoke.mts --platform emery              # rect watch
```

**Both-platform status (2026-07): the full catalog was green on gabbro AND
emery** at the matrix runs (13/13 each; `pulse` joined after → the 14 apps
tabulated below — see its receipts). Emery receipts for the newer examples are
committed (`screenshots/*-emery.png`); the emery run found ZERO
platform-specific failures — `screen.width/round` adaptation carried every app
unchanged.

> **✅ RESOLVED (2026-07-21, later the same day — see
> [`review-findings.md` D1](review-findings.md)):** the round-twelve `flow.ts`
> batch had re-broken the two boot canaries (`fxAbort JavaScript stack
> overflow` at boot on HEAD). Fixed by DEFERRING the Navigator's initial swap
> onto `onDisplaying` — both canaries verified live again on gabbro
> (qemu-monitor screendump: navmany "Screen #1 + tick", navreactive "depth 1 +
> ping"), plus `multilazy`. A full 14-app matrix re-run in a fresh session is
> still the clean way to re-stamp "full catalog green" (only the canaries +
> multilazy were re-proven here).

Requires the Pebble SDK and a bootable emulator. Each app: build → `pebble
logs` capture attached around a foreground install (~8s of heartbeats — the
proven Rule-3 recipe; a fresh direct-qemu client's log-shipping enable is NOT
reliably honored, measured) → assert alive (≥3 heartbeats, no fxAbort) → kill
pypkjs → `tools/drive.py` (cataloged buttons + qemu-monitor screendump) →
assert painted → PNG receipt (default `/tmp/signal-piu-smoke/`). A dead
transport (0 heartbeats) triggers one `tools/reset-emulator.sh` + retry
(Rule 3). Exit 1 on any failure.

## What a PASS means (and what it can't)

- **≥3 `instruments:` heartbeats, no `fxAbort`** — the XS machine is alive
  and did not die on any of the three boot budgets.
- **≥100 non-background pixels** — the app PAINTED a frame.
- The pixel assert cannot read the text: a crash screen also paints. The
  crash screen never comes with a healthy silent log, so heartbeats + no
  fxAbort covers the realistic failure modes — but eyeball the receipts when
  it matters (that is why they are saved).

## The catalog

| app | buttons | a human should see | why it's here |
|---|---|---|---|
| `navmany` | none | "Screen #1" + live tick | **depth-audit canary** — 100-screen Navigator, boots ~1 slot from the 384 value-stack wall |
| `navreactive` | none | "depth 1" + live ping | **depth-audit canary** — Navigator over a reactive screen, the OTHER near-wall shape |
| `counter` | UP ×2 | count = 2 | the smallest useState + handler loop |
| `autothunk` | UP ×2 | "Count: 2" | the LOWERED bare `string={"…"+count()}` binding updates live |
| `movebox` | UP ×2 | "x=40", box shifted right 40px | `<Move>` applies moveBy deltas post-mount |
| `loadms` | SELECT | "load _n_ms acc=247700" | importNow of a lazy module loads and runs |
| `deviceinfo` | none | size/round/color + ticking clock | host surface probe; first-boot sanity for new hardware |
| `rootapp` | UP ×2 | "root 2" | root-component entry mounts via the generated shim |
| `config` | none | "no config yet" | `pebble/message` channel opens at boot (the full settings round-trip needs pypkjs alive — drive it manually with `tools/config-drive.py`) |
| `fontface` | none | serif clock + "Serif, from a TTF" | a shipped `.ttf` face loads into a Style and renders |
| `kvprobe` | none | "kv works boot=_n_" | `device.keyValue` persists a counter across launches |
| `devlog` | SELECT | "sent 1" | `report()` → AppMessage bridge (the `pkjs>` line needs the log capture — kept manual) |
| `dictate` | none | "SELECT starts dictation" | dictation probe — boot-only ON PURPOSE (SELECT opens the system UI, BACK exits to the launcher) |
| `pulse` | UP | serif clock + date/secs + accent dot turns green | the flagship showcase watchface (TTF + persisted theme + config greeting + lazy boot) |

Adding an entry: one line in `SMOKES` in `tools/device-smoke.mts` (app name,
drive.py actions, the human-readable expectation). Keep boot-only canaries
first — if they fail, everything after them is noise.

## The manual recipe the runner encodes

For when the runner itself is in question (all measured, see
`../CLAUDE.md` Rule 3 and docs/debugging.md):

```bash
APP=<name> node build.mts
pebble logs --emulator gabbro > /tmp/cap.txt 2>&1 &
sleep 3
pebble install --emulator gabbro          # foreground — relaunches the app
sleep 10
kill %1
grep -c instruments /tmp/cap.txt          # 0 = dead transport, NOT a quiet app
grep fxAbort /tmp/cap.txt                 # any hit = boot death, read the line
pkill -9 -f pypkjs                        # free the single-client qemu port
python3 tools/drive.py gabbro b:up s:1 d:shot   # buttons + screendump
```

A zero-heartbeat capture means the transport died: run
`tools/reset-emulator.sh <platform>` and retry once — do not chase it with
flash-only deletes.
