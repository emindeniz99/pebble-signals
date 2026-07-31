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
emery** at the matrix runs (13/13 each; `pulse` joined after, then
`sectionlist` on 2026-07-28 → the 15 apps tabulated below — see their
receipts; `sectionlist` is verified on BOTH platforms, including the
DOWN-×3 scroll drive on each). Emery receipts for the newer examples are
committed (`screenshots/*-emery.png`); the emery run found ZERO
platform-specific failures — `screen.width/round` adaptation carried every app
unchanged.

> **✅ RESOLVED (2026-07-21, later the same day — see
> [`review-findings.md` D1](review-findings.md)):** the round-twelve `flow.ts`
> batch had re-broken the two boot canaries (`fxAbort JavaScript stack
> overflow` at boot on HEAD). Fixed by DEFERRING the Navigator's initial swap
> onto `onDisplaying` — both canaries verified live again on gabbro
> (qemu-monitor screendump: navmany "Screen #1 + tick", navreactive "depth 1 +
> ping"), plus `multilazy`.
>
> **✅ RE-STAMPED GREEN — 14/14 on gabbro (same day, after D1 + S9 both
> landed).** The whole catalog was re-run app-by-app with the reset-per-app +
> qemu-monitor screendump recipe, and **every frame was READ, not size-checked**
> (Rule 3): `counter` "Count: 0" · `autothunk` "Count: 0" · `movebox` "x=0" +
> box · `loadms` "press select" · `deviceinfo` "screen 260x260 / round panel /
> color" + clock · `rootapp` "root 0" · `config` "no config yet" · `fontface`
> serif clock + "Serif, from a TTF" · `kvprobe` "kv works boot=1" · `devlog`
> "sent 0 / UP throws, SELECT logs" · `dictate` "SELECT starts dictation" ·
> `pulse` serif clock + date/secs · `navmany` "Screen #1 + tick" ·
> `navreactive` "depth 1 + ping". The four live apps (deviceinfo, pulse,
> navmany, navreactive) showed 3/3 DISTINCT frames = animating. Scope note
> (Rule 12): this pass verified **boot + paint** for all 14; the button-drive
> assertions in the table below were NOT re-driven, because the `pebble logs`
> heartbeat channel was dead in this session and the screendump path replaced
> the runner's log-based one.
>
> **emery (rect) canaries also green** — the two Navigator canaries plus a
> control were re-run on the 200×228 panel to prove D1's deferred swap and S9's
> `S.get` change are not gabbro-specific: `navmany` "Screen #1 + tick 37" and
> `navreactive` "depth 1 + ping 37" (3/3 distinct frames each = live),
> `counter` "Count: 0". The remaining 11 apps were not re-run on emery — their
> emery receipts predate these fixes and both changes are platform-independent
> (value-stack depth + signal identity), so the canaries are the meaningful
> guard.
>
> **✅ emery canaries re-green POST-D4-DIET (2026-07-28):** after the
> jsx/flow/signals slot diet and the SectionList standalone rewrite, the
> rect panel was re-proven with reset-per-app + screendump: `navmany`
> "Screen #1 + tick 50" then SELECT ×3 → "Screen #4 + tick 66" (the
> once-fatal repeated pushes, live on emery too), `navreactive` "depth 1 +
> ping 55" (distinct frames = animating), and `sectionlist` boot + DOWN ×3
> scroll (Carrot highlighted past the Veg header) — identical behavior to
> gabbro.
>
> **2026-07-28 (round 13) — fresh gabbro receipts on HEAD:** `navmany`
> "Screen #1 + tick 52→103" (15/15 alive samples over 30 s, then a verified
> push to "Screen #2"), `navreactive` "depth 1 + ping" (3/3 distinct frames),
> `dialog` "Alert / Battery low / SELECT ok" (the round-13 nested message
> Column renders; the multi-line wrap itself has no example on-device yet).
> **New finding while re-driving buttons: navmany's SECOND push dies —
> `fxAbort memory full` (review-findings D4).** The catalog row above is
> boot+tick; treat repeated Navigator pushes as over-budget on HEAD until the
> D4 diet lands. Also MEASURED this round: the `instruments:` heartbeats DO
> stream through `pebble logs` when the capture attaches to a LIVE pypkjs and
> the app is then relaunched with a foreground `pebble install` — that is how
> D4's slot/chunk numbers were read (the direct-transport enable that
> `tools/memtest.py` uses was not honored this session; the pebble-logs route
> is the reliable one).

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

## Receipt staleness — the dated matrix

A PASS proves boot + paint **on the day it ran**, and nothing above says which
day that was. That is how the status block at the top of this file drifted from
"the full catalog was green on gabbro AND emery" into "…at the matrix runs,
boot+paint only, button drives not re-driven" while still reading green to a
skimmer. The runner now records every run, dated:

- [`smoke-matrix.json`](smoke-matrix.json) — one
  `{app, platform, date, result, receiptPath}` row per app per run,
  **append-only**. Old rows are never dropped or rewritten: the history is the
  evidence, and a matrix that prunes it cannot be used to argue freshness.
- [`smoke-matrix.md`](smoke-matrix.md) — the table, regenerated FROM that json:
  newest run per app/platform, the AGE of each receipt in its own column, and a
  ⚠️ on anything older than 30 days. It is a generated view — never hand-edit it.

```bash
node tools/device-smoke.mts --apps counter --platform gabbro  # run → record → re-render
node tools/device-smoke.mts --matrix                          # re-render the table only
node tools/device-smoke.mts --dry-run --apps counter          # record/render path, NO device
```

`--dry-run` writes its json/md to `/tmp/signal-piu-smoke-matrix/` on purpose: a
row no device produced must never become the newest row of the committed matrix.
It exists so `tests/smokematrix.test.mts` can prove the merge and the table
render on a box with no emulator at all.

Two things changed in the runner alongside the record (both CLAUDE.md Rule 3,
both already measured — this only stops them being applied by hand):

- **Reset-per-app.** Every app now starts from `tools/reset-emulator.sh`, not
  only the ones that already failed. The screenshot/install transport rots after
  ~4–8 installs in a session and a rotted capture returns a STALE frame that
  passes every size check, so only the first app after a reset is trustworthy.
  **Trade-off (Rule 12, say it out loud):** the reset wipes the PERSIST dir too,
  so `kvprobe` now paints `kv works boot=1` on every run — the row above still
  passes (it boots and paints), but its *persists across launches* claim is no
  longer exercised by the runner. Install it twice with no reset in between to
  check that by hand.
- **A 40 s post-install settle** (it was 8 s, which was right mid-session). On a
  freshly-reset emulator the FIRMWARE cold-boots ~30 s before the app loads, so
  the old window would now catch a boot frame and zero heartbeats. 40 s = the
  documented ≥32 s cold-boot floor plus the ~8 s of heartbeats the `≥3
  instruments:` assert was tuned for. A full-catalog run is that much slower per
  app; that is the price of a receipt that means something.

Receipts land in `screenshots/smoke/<app>-<plat>.png` — a SUBDIR, so a smoke run
can never overwrite the committed catalog receipts in `screenshots/` that the
docs point at (the runner refuses a `--receipts` aimed at that directory).

## The catalog

| app | buttons | a human should see | why it's here |
|---|---|---|---|
| `navmany` | none | "Screen #1" + live tick | **depth-audit canary** — 100-screen Navigator, boots ~1 slot from the 384 value-stack wall. Button pushes verified through Screen #4 + pop×2 + push×2 after the D4 slot diet (see review-findings **D4**; pre-diet the SECOND push died on the arena ceiling) |
| `navreactive` | none | "depth 1" + live ping | **depth-audit canary** — Navigator over a reactive screen, the OTHER near-wall shape |
| `counter` | UP ×2 | count = 2 | the smallest useState + handler loop |
| `autothunk` | UP ×2 | "Count: 2" | the LOWERED bare `string={"…"+count()}` binding updates live |
| `movebox` | UP ×2 | "x=40", box shifted right 40px | `<Move>` applies moveBy deltas post-mount |
| `loadms` | SELECT | "load _n_ms acc=247700" | importNow of a lazy module loads and runs |
| `deviceinfo` | none | size/round/color + ticking clock | host surface probe; first-boot sanity for new hardware |
| `rootapp` | UP ×2 | "root 2" | root-component entry mounts via the generated shim |
| `config` | none | "no config yet" | `pebble/message` channel opens at boot (the full settings round-trip needs pypkjs alive — drive it manually with `tools/config-drive.py`) |
| `fontface` | none | serif clock + "serif clock, from a TTF" / "subset to 0-9 and :" (Gothic) | a shipped `.ttf` face, SUBSET to `0123456789:` (370,196 → 8,968 B), loads into a Style and renders — the committed screenshot predates the subset and still shows the old serif caption |
| `kvprobe` | none | "kv works boot=_n_" | `device.keyValue` persists a counter across launches |
| `devlog` | SELECT | "sent 1" | `report()` → AppMessage bridge (the `pkjs>` line needs the log capture — kept manual) |
| `dictate` | none | "SELECT starts dictation" | dictation probe — boot-only ON PURPOSE (SELECT opens the system UI, BACK exits to the launcher) |
| `pulse` | UP | serif clock + date/secs + accent dot turns green | the flagship showcase watchface (TTF + persisted theme + config greeting + lazy boot) |
| `sectionlist` | DOWN ×3 | boot: "Fruit" header + "Apple" highlighted; after: window scrolled, "Carrot" highlighted (Veg header skipped) | grouped recycled window — keep-in-view scroll + header-skipping selection (first device render 2026-07-28, post standalone rewrite; verified gabbro + emery incl. the drive; see review-findings D3) |

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
