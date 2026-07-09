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

## Core (signals.ts) — ALL RESOLVED

| # | sev | finding | status |
|---|---|---|---|
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
