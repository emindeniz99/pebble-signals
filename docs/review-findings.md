# Deep-review findings ledger (2026-07) — verified defects & their fix plans

A three-agent adversarial review (signals core / jsx+flow / build pipeline)
plus owner-driven analysis. Every finding here was VERIFIED (traced in source
and, where marked, reproduced by a failing test or on-disk receipt) — this is
not a list of maybes. Status legend: ✅ FIXED (commit) · ⏳ OPEN (fix plan
written, not yet applied) · 🔬 NEEDS-DEVICE (requires an emulator/hardware
measurement before or after the fix).

**Depth-audit rule (learned the hard way, commit 06b9f9f):** any fix touching
a function on the deep render/creation chain (jsx → createHost → effect →
track → run → unsubscribe → S.get/Signal.get, or flow's swap/mountChildren)
must be stack-frame-neutral — try/catch scaffolding and extra locals in those
frames tipped navmany over the 384-slot value stack even with all tests green.
Boot-verify navmany AND navreactive after every runtime-touching change.

> **D1 — REGRESSION (session 2026-07-21, gabbro QEMU, ROOT-CAUSED):** BOTH
> `navmany` AND `navreactive` `fxAbort JavaScript stack overflow` at boot (2
> instrument heartbeats then abort) on HEAD — shallow apps (`clock`, `ultraface`)
> boot fine (15+ hb) in the same session, so it is the DEEP-nav render tree over
> the firmware-fixed 384-slot value stack, not the arena/environment (a full
> emulator wipe + firmware re-extract reproduced it — deterministic). **Bisected
> to the round-twelve `flow.ts` batch:** restoring the ENTIRE `7e88ad4`
> `src/embeddedjs/runtime/flow.ts` onto HEAD boots both canaries (17 hb, 144
> archive symbols); HEAD's `flow.ts` (148 symbols) overflows. The delta is the
> Navigator changes `14d07ca` (anchored-screen wrapper — an intermediate `const
> wdims` value-stack local, live in the swap frame during the deep `build(nav)`
> recursion) + `6dc015e` (push-boundary restore: `getBoundary`/`withBoundary`/
> `report` imports + `navBoundary`) + `9fb63c4`/`33c9490` — together they add ≥1
> value-stack slot on the deep initial-swap chain, and the canaries sat ~1 slot
> from the wall. Inlining the `wdims` dict alone did NOT recover it (measured),
> so the slot is spread across the batch. **FIX (needs reliable device iteration
> — this session's transport rotted + 2-min command caps made per-change bisection
> unreliable):** reimplement the `14d07ca` concrete-box wrapper (INLINE the dict,
> no `wdims` local) AND the `6dc015e` boundary restore in a strictly
> value-stack-neutral form vs `7e88ad4` (captured closure vars are heap, not
> stack; keep try/catch OUT of the initial-swap frame), boot-verifying navmany +
> navreactive after EACH sub-change. Interim option if a clean fix stalls: revert
> `flow.ts` to `7e88ad4` + re-apply the inlined concrete box, accepting the loss
> of the niche push-boundary-routing (`6dc015e`) + sync-throw-routing (`33c9490`)
> fixes until the depth-neutral version lands — a booting Navigator outranks niche
> error routing. CONSEQUENCE: the S9 gate below is currently **unclearable**
> (needs navreactive to boot), so S9 stays deferred; its `pullComputed` extraction
> was written + Node-tested (150 pass) and discarded unshipped pending the gate.
>
> **UPDATE (same session, further bisection):** the two canaries split. **`navmany`
> is the round-twelve regression and is FIXABLE:** restoring `7e88ad4`'s `flow.ts`
> Navigator (lean `swap()`, no in-arrow boundary/try) + re-applying only the
> inlined concrete-box wrapper boots it (MEASURED 15 hb, 0 abort). Incremental
> reverts did NOT recover it (reverting just the wrapper, or just 6dc015e's
> boundary, or moving the boundary to the push/pop call sites all still overflowed
> — the added value-stack depth is spread across the round's `flow.ts` changes,
> only the whole `7e88ad4` Navigator is lean enough). **`navreactive` is DEEPER:**
> it overflows even with the `7e88ad4`-structure `flow.ts` (the concrete wrapper is
> value-neutral for it), so it is over the 384-slot wall in THIS firmware
> INDEPENDENT of round twelve — its "~1 slot from the wall" margin is negative
> here. So the full "both canaries boot" goal needs actual render-DEPTH reduction
> for navreactive (structural — fewer frames per nested reactive screen), not just
> a `flow.ts` revert. FIX COST for the navmany-only revert is high: it reverts the
> shipped `6dc015e`/`9fb63c4`/`33c9490` Navigator correctness fixes + their
> `flow.test.mts` cases + the `navboundary` example's expected behavior — a whole
> round, best done in a reliable-device session. Left at HEAD (not shipped) pending
> that: a booting Navigator is the goal, but a half-revert that breaks the test
> suite and still fails navreactive is worse than the documented regression.

> **D2 — DEVICE OOM (session 2026-07-21, gabbro QEMU, FIXED by revert):** the
> 3-frame `sloth` watchface (`slothblink.png`, open/half/closed, 420×140, mod
> archive **88.6KB**) RENDERS ONCE then crashes back to the launcher within
> ~10s. Measured receipt via the qemu-monitor screendump (see CLAUDE.md Rule 3
> note): a dump right after install caught the face (`18:39:49`), then 14
> consecutive dumps over the next ~10s all showed "Install an app to continue".
> A trivial control (`counter`, 13KB) stayed put in the same session, and the
> 2-frame `sloth` (63KB) was stable earlier the same session — so it is
> memory, not transport. ROOT CAUSE: the "build-verified 88.6KB < ~116.8KB
> install edge" claim was INCOMPLETE — it counted only the archive, not the
> archive + the *decoded* multi-frame texture coexisting in the shared ~130KB
> native pool (`archive + app-heap ≤ ~130,768`, xs-heap-playbook). The 3rd
> 140px frame's resident pixels tipped it over once the animation allocated.
> FIX (shipped): reverted `sloth` to the proven 2-frame sheet (63KB, snap
> blink); the smooth multi-frame blink now lives ONLY in the vector `slothvec`
> (PDCS, ~20KB archive, near-zero pixel RAM — the OOM-safe home for rich
> animation). LESSON: a bitmap watchface's memory cost is archive + Σ(resident
> frame pixels), not archive alone; a frame count that builds can still OOM.

## Core (signals.ts) — one OPEN (S9), rest resolved

| # | sev | finding | status |
|---|---|---|---|
| S9 | MINOR 🔬 NEEDS-DEVICE | lazy-computed pull in `S.get` drains the computed's prior-run cleanups (`unsubscribe(e)`) BEFORE switching `current`/`owner` to `e`, and never restores the computed's captured boundary (`g.c`) the way `run()` does (round 9). So a computed read cross-boundary drains its `onCleanup`/nested-effects under the READER's owner+boundary: a throwing cleanup routes to the wrong ErrorBoundary and any trackable created during cleanup attaches to the wrong subtree (codex round-16 finding, PR #43 thread `…SF-tz`; deferred — task #90) | FIX PLAN: mirror `run()` — save `current`/`owner`/`g.c` (=pb), set `current=owner=e` and `g.c=(g.z&&g.z[e])||null` BEFORE `unsubscribe(e)`, move `unsubscribe` inside the `try`, restore all three in `finally`. GATE: `S.get` is the deepest hot path (see depth-audit rule above) — adding a local + boundary save/restore risks the 384-slot wall where `navreactive` sits ~1 slot away; MUST boot-verify navmany AND navreactive on gabbro before shipping, and add a conformance test (computed with a throwing `onCleanup`, read from a different boundary, routes to the computed's boundary). Very narrow trigger — no shipped example hits it. |
| S1 | CRITICAL | disposed computed's forward-id reuse resurrects recompute + wipes the reusing effect's subs | ✅ e9f8492 (dispose clears cx fn) |
| S2 | MAJOR | throwing computed stamps itself valid → 2nd read serves stale silently | ✅ e9f8492 + depth-neutral 06b9f9f (ok-flag in finally) |
| S3 | MAJOR | useState functional update reads prev TRACKED → self-dep → unbounded settle | ✅ e9f8492 (raw s.v read; matches lowered S.set) |
| S4 | MAJOR | track()/onCleanup after self-dispose parks on dead id → leak + stale fire on reuse | ✅ e9f8492 (dead-owner → dispose now) |
| S5 | MINOR | cleanups drained with caller's tracking live → spurious subscription | ✅ e9f8492/06b9f9f (drainDisposables: current=-1) |
| S6 | MINOR | createResource success = two unbatched writes → observable half-state | ✅ e9f8492 (batch) |
| S7 | MINOR | throwing cleanup aborts the drain → sibling disposables orphaned live | ✅ e9f8492/06b9f9f (per-item contain + report) |
| S8 | MINOR ✅(this round) | `Store.save()` builds the string via one whole-blob `fromCharCode.apply` — the exact shape the romTable comment records as fxAbort-prone on this port | ✅ save() now chunks ≤128B slices (justified by the EXISTING measured receipts: the romTable whole-blob fxAbort + Store.get's 255B cap); >128B round-trip unit-tested. Optional: on-device re-measure of a large save when convenient |

Regression tests: signals.test.mts R1–R7 (8 checks, failed pre-fix).

## UI runtime (jsx-runtime.ts / flow.ts) — ALL RESOLVED (fixed or measured-cleared)

| # | sev | finding | fix plan |
|---|---|---|---|
| U1 | MAJOR  ✅(4b15f98) | react-jsx hoists the JSX `key` attribute into jsx()'s THIRD argument, which our factory doesn't accept — `<For key={...}>` (README's documented usage!) silently loses keyed reconcile and falls back to identity keys → full row churn per update | add `key?: unknown` third param to jsx(); for component types re-inject `props.key ??= key`. Depth note: jsx frames do NOT nest (children evaluate before the outer call) → +1 param is one live slot, safe; still boot-verify |
| U2 | MAJOR  ✅(4b15f98) | tickAll splices by stale index: a tween's completion write that (via a subscriber) stops another tween below it makes `a.splice(i,1)` remove the WRONG tween — it freezes forever | re-resolve before removal: `const j = a.indexOf(r); if (j >= 0) a.splice(j, 1)` (mirrors stop()); off-chain, depth-safe |
| U3 | MAJOR  ✅(this round) | `nav.push()`/`pop()` during a screen BUILD re-enters swap() while disposeTop is null → double-mount + the pushed screen's root leaks permanently | after createRoot returns in swap: if the stack top moved or disposeTop was set by a re-entrant call, dispose the just-built root and bail (same shape as mount()'s panicked check). ON-CHAIN — keep to plain locals, boot-verify both nav apps |
| U4 | MAJOR  ✅(this round) | ErrorBoundary: creation-time BINDING throw inside the fallback tears the boundary down before `disposer` is assigned → the in-flight fallback root finishes building with no owner → undisposable leak; reproduced re-crashing a successfully-retried app | `dead` flag set by the tracked cleanup; after createRoot in onError (and mountChildren for symmetry): `if (dead) { r[1](); return; }`. ON-CHAIN (creation path) — depth-audit |
| U5 | MINOR  ✅(4b15f98) | second render() leaks the previous root and cross-wires the old app's crashes onto the new app | at render() start: `if (rootDispose) { rootDispose(); rootDispose = null; }` |
| U6 | MINOR  ✅(4b15f98) | `focus` in a post-mount flow build parks the node on pendingFocus forever (retention) and stale-focuses on the NEXT mount | `pendingFocus = null` at mount() start; doc line for the retention in single-render apps |
| U7 | MINOR  ✅(4b15f98) | For: a contained mid-reconcile throw (custom `__spError` / bare mode) leaves a recorded-but-unmounted row; the next sweep's `host.remove` throws piu "content not in container" | guard the sweep like the position pass: `if (rn[x].container) host.remove(rn[x])` |
| U8 | MINOR ✅CLEARED | Show/EB side wrappers use raw props.width/height while the HOST gets screen-size defaults — a height-only Show yields width-less wrappers (gotcha 16: measures 0) | ✅ CLEARED by measurement (2026-07): a height-only Show renders its children fine on gabbro (probe screenshot: 'INSIDE-SHOW' visible between siblings) — the analytical concern does not reproduce on device; no code change needed |
| U9 | MINOR  ✅(this round) | NaN key (bad data) never matches indexOf → For silently rebuilds every row every pass | normalize NaN in keyOf or document; low priority |
| U10 | MINOR  ✅(this round) | a user-supplied `behavior` prop is silently clobbered when onTap/button props also present | fail loud (throw) on the conflict per Rule 12 |

## Build pipeline (build.mts / tools) — ALL FIXED except P10 (documented)

| # | sev | finding | fix plan |
|---|---|---|---|
| P1 | CRITICAL  ✅(62e5c64) | treeshake + the dynamic-import safety scan read ONLY the entry .tsx; esbuild bundles the entry's whole relative-import graph — a helper importing `runtime/flow` (or calling importNow) is invisible → runtime module pruned from the manifest → SILENT boot death | compute the transitive relative-import closure (entry + ./** + lazy) and feed it to BOTH scans; or scan the bundled main.js post-bundle. Add a multifile regression test |
| P2 | MAJOR  ✅(62e5c64) | gen-manifest derives Texture/pdc/romTable resources from the ENTRY only — lazy screens/ helpers ship without their assets → on-device "Texture not found" throw on first screen load | extend gen-manifest CLI to accept the same multi-source closure as P1 |
| P3 | MAJOR  ✅(62e5c64) | runtime keep-sets read from PRE-MINIFY main.js: lower's orphaned import specifiers keep dead runtime exports alive (on-disk receipt: watchms ships CLUT16/RGB332 = useState/computed wrappers imported by NOTHING) — the exact +9-symbol class import-prune-min was built to kill | run import-prune-min on main.js right after lower (and on lazy/pure files post-minify), BEFORE emitRuntime |
| P4 | MAJOR  ✅(2955dbc) | import-prune-min's CLI guard is `argv[1].endsWith(".mts")` — in a consumer install it runs as dist/*.mjs → guard false → SILENT NO-OP → every consumer build ships the +540B/+9-symbol regression | one-liner: `if (import.meta.main)` (all other tools already use it) |
| P5 | MAJOR  ✅(62e5c64) | symdiet rewrites named imports only; `import * as sig from "runtime/signals"` keeps property names while exports get renamed → `sig.effect` undefined on device, build green | scan shipped files for namespace/`export *` importers of each runtime module and drop that module's wires from the rename map (mirror importScan's "all") |
| P6 | MAJOR  ✅(62e5c64) | lazy screen modules esbuild-bundle their RELATIVE imports as a second copy → split-brain module state (entry reacts to copy A, screen writes copy B) | detect relative imports in lazy files and fail loud (same rule PRELOAD_PURE v1 already enforces) |
| P7 | MINOR  ✅(2955dbc) | gen-manifest scans RAW source — a commented-out `new Texture(...)` creates a phantom resource (build failure or silently shipped bytes) | apply the same comment-strip the lazy scan uses |
| P8 | MINOR  ✅(62e5c64) | deriveResources ASSIGNS `m.resources`/`m.data` wholesale — a consumer base manifest's hand-added entries are clobbered | union with existing "*" lists |
| P9 | MINOR  ✅(62e5c64) | treeshake's hard-coded DEPS map silently PRUNES a runtime module it doesn't know (fail-open) — a 4th runtime module would boot-die | keep unknown seeds (fail-safe) or derive DEPS from sources |
| P10 | MINOR | `--no-crash-ui` is silently ignored when MINIFY=0 (define only applied in the minify call) | document, or apply the define in the fallback copy path |
| P11 | MINOR  ✅(62e5c64) | the "esbuild missing → unminified fallback" comment is unreachable: esbuild is imported statically, so a missing install dies at module load (loud, but the doc lies) | dynamic import with try/catch, or fix the comment |
| P12 | MINOR  ✅(62e5c64) | lint-reads only VISITS the root files; a footgun inside a bundled ./helper is type-resolved but never reported | also visit program source files under the app's directory |

## Cleared by the review (traced, NOT bugs)

Bit math at id 31/32/63 boundaries; growStride row preservation; quarantine
lifecycle; settle turn draining incl. mid-turn grow; batch nesting/exception
safety; owner save/restore paths; root-disposer idempotency; appendChild
falsy handling (0/"" render); showCrash retry/kill state machine; EB main
catch paths (a)–(i); For sweep/position-pass node discipline; VirtualList
windowing; animate timer lifecycle (single shared timer, self-releasing);
classify-module purity (sufficient because mods can't preload — nothing is
ROM-frozen); prune fixpoint seeding; importScan vs minified emission;
squash bail-outs; tryEsbuild degradation path.
