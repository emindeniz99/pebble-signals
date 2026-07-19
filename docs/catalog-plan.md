# Catalog expansion plan — closing the react-pebble gap

Goal: give signal-piu the breadth react-pebble advertises (26 components,
65+ hooks) WITHOUT losing its runtime-reactive model and WITHOUT charging any
app for a feature it does not import. This is the design + phasing plan; each
phase ships independently with tests + a device receipt (Rule 2).

## The zero-cost invariant (why this is safe to add)

**A new catalog entry must cost ZERO boot symbols, ZERO arena bytes, and ZERO
archive size for an app that does not import it.** The architecture already
guarantees this — the plan only has to stay inside it:

- **Per-app tree-shaking** (`tools/treeshake.mts`): the manifest ships only the
  runtime modules an app's static closure imports (`neededModules`). A new
  component in its OWN module is pruned from any app that never imports it.
- **Rule: new catalog code goes in NEW modules, never in the always-shipped
  core** (`runtime/signals`, `runtime/jsx-runtime`, `runtime/flow`). Adding a
  `<StatusBar>` to `flow.ts` would ship it to every Navigator app; adding it as
  `runtime/ui/statusbar` ships it only to importers. The 384-slot boot wall and
  32KB arena are the reason (Rule 4) — core stays lean.
- **Corollary:** each new module must itself be lean (no top-level
  `function`/`class` in a preloaded module — gotcha 13; `const` arrows only).

**Verification gate for every phase:** build an app that does NOT use the new
feature and confirm its symbol count + archive size are byte-identical to
before (the `tools/host-symbols.py` + `mc.xsa` size A/B, same method as the
boot-cost matrix). If a non-user pays anything, the module boundary is wrong.

## Module layout (new namespaces)

```
runtime/
  signals, jsx-runtime, flow        # CORE — unchanged, always shipped
  ui/                               # NEW: opt-in Pebble UI-kit components
    statusbar, actionbar, card, badge, menu, numberwindow
  draw/                             # NEW: opt-in drawing primitives (Port-based)
    circle, line, arc, path, canvas
  sensors/                          # NEW: opt-in hardware hooks (need real
    battery, accel, compass, health, vibration, light, location, dictation
  data/                             # NEW: phone/data hooks
    message, fetch, websocket, datalog
  anim/                             # NEW: animation hooks + easing
config/                            # NEW: pkjs-side config-page builder (phone)
timeline/                          # NEW: server-side timeline web API
```

Every leaf is independently tree-shakeable. Types are erased (zero device cost),
so rich TS surfaces are free.

## Gap inventory + priority

Priority = (how often a real watch app needs it) × (how cleanly it fits our
model). P1 first.

### P1 — high-value, clean fit
- **Drawing primitives** `Circle / Line / Arc / Path` — `runtime/draw/*`, each a
  thin `Port` custom-draw wrapper (we already do vector via SVGImage/slothvec;
  a `Port` + `onDraw` is the immediate-mode analog). `Canvas` = a raw `Port`
  exposing the draw context. Reactive props via the existing bind path.
- **Pebble UI-kit** `StatusBar / ActionBar / Card / Badge` — `runtime/ui/*`,
  Piu Container compositions. Card/Badge already prototyped conceptually in the
  tutorials; formalize as modules.
- **`useLocalStorage` / persisted state** — a signal backed by the existing
  `Store`/KV path; the most-requested missing hook.

### P2 — valuable, needs real Moddable module shapes (research-gated)
Per CLAUDE.md Rule 1: find the shape in the Pebble SDK/firmware FIRST (NOT in
react-pebble — its published 0.1.1 REMOVED these for the same reason). Each is a
`sensors/*` module wrapping the real API, exposed as a signal.
- `useBattery, useAccelerometer, useCompass, useHealth*, useVibration,
  useLight, useLocation` — one device-proven module at a time (the `dictate`
  probe is the template: prove reachable on QEMU, then wrap).
- **Menus** `MenuLayer / SimpleMenu / ActionMenu / NumberWindow` —
  `runtime/ui/menu`; builds on `VirtualList` (already runtime-dynamic) +
  Navigator (WindowStack ≈ our Navigator).

### P3 — phone/data + system (mostly pkjs-side, orthogonal to render)
- **`useFetch` (pebbleproxy) / `useMessage` / `useWebSocket`** — `data/*`; we
  already have `createResource` + the pkjs bridge + config research. `useFetch`
  can borrow react-pebble's *published* pebbleproxy wiring (that part IS in
  their code and readable).
- **Config-page builder** `ConfigPage/Section/Toggle/...` — `config/*`, pkjs +
  HTML generation; we have the Clay config research to build on.
- **Animation hooks** `useAnimation / Sequence / Spawn` + easing — `anim/*`,
  built on the existing `Move`/tween ticker (already ~30fps shared timer).

### P4 — advanced system (defer until asked)
- Timeline web API, AppGlance, Wakeup, Workers (we have the worker experiment),
  i18n (`defineTranslations/useTranslation`), Notifications, Smartstrap.

## Phasing (each phase = one PR, independently shippable)

1. **P1 draw primitives** (`runtime/draw/*`) + a `drawdemo` example + gabbro
   receipt + zero-cost A/B on a non-user app.
2. **P1 UI-kit** (`runtime/ui/statusbar|actionbar|card|badge`) + `uikit`
   example + receipts.
3. **P1 `useLocalStorage`** + test + device round-trip.
4. **P2 menus** (`runtime/ui/menu`, over VirtualList/Navigator) + example.
5. **P2 sensors** — one module per PR, each research-gated + device-proven.
6. **P3 data/config/anim** — as demand dictates.
7. **P4** — on request.

## Non-negotiables per phase (the definition of done)
- New code in a NEW opt-in module (never core).
- Node tests + 100% runtime coverage held.
- A gabbro (and where layout differs, emery) screenshot receipt.
- **Zero-cost A/B**: a non-user app's symbol count + archive size unchanged.
- CHANGELOG + docs/api regen + an example app in the smoke catalog.

## What we deliberately will NOT copy
- react-pebble's **compile-time snapshot** model (it cannot do runtime-dynamic
  structure — the bench failure). Our components stay runtime-reactive.
- Their **removed** sensor hooks as-is — we find the real module shapes
  ourselves (Rule 1), we do not inherit their fictional-global stubs.

Prior art + the model tradeoff: `docs/design-journey.md`. The measured
comparison that motivates this: `projects/react-pebble-bench/`.
