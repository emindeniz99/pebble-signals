# signal-piu documentation

Fine-grained reactive UI — Solid-style signals + JSX, no VDOM — for Pebble
watches on Moddable XS/Piu. Every claim in these docs carries an on-device
receipt (screenshot or measurement); that discipline is [Rule 2](../CLAUDE.md).

## Start here

| I want to… | go to |
|---|---|
| get something on the emulator in minutes | [Getting started](getting-started.md) |
| learn the library step by step | [Tutorial: build a watchface](../tutorials/build-a-watchface/README.md) (3 parts) → [The complete watchface](../tutorials/complete-watchface/README.md) (6 parts) |
| use signal-piu in **my own project** (npm) | [Packaging & consuming](packaging.md) |
| understand the model (signals, run-once components) | [Core concepts](concepts.md) |
| see what it can do | [Examples gallery](examples.md) · flagship: `pulse` |
| fix something that broke | [Debugging & troubleshooting](debugging.md) |
| quick answers | [FAQ](faq.md) |
| the 24 numbered gotchas + the full measured ledger | [Handbook](handbook.md) — the old front page, moved here 2026-07-31 |

## Guides & reference

- [API parity with React/Solid](api-parity.md) — what exists, what's skipped, why
- [Generated API reference](api/) — `pnpm run docs` regenerates; CI fails if it drifts.
  The full public surface at a glance:
  - **runtime/signals** — [`useState`](api/signals/functions/useState.md) ·
    [`signal`](api/signals/functions/signal.md) ([`Signal`](api/signals/interfaces/Signal.md)) ·
    [`computed`](api/signals/functions/computed.md) ([`ReadonlySignal`](api/signals/interfaces/ReadonlySignal.md)) ·
    [`effect`](api/signals/functions/effect.md) · [`batch`](api/signals/functions/batch.md) ·
    [`untrack`](api/signals/functions/untrack.md) · [`track`](api/signals/functions/track.md) ·
    [`dispose`](api/signals/functions/dispose.md) · [`createRoot`](api/signals/functions/createRoot.md) ·
    [`useMemo`](api/signals/functions/useMemo.md) · [`useRef`](api/signals/functions/useRef.md) ·
    [`useReducer`](api/signals/functions/useReducer.md) · [`onMount`](api/signals/functions/onMount.md) ·
    [`onCleanup`](api/signals/functions/onCleanup.md) · [`createContext`](api/signals/functions/createContext.md) ·
    [`useContext`](api/signals/functions/useContext.md) · [`createResource`](api/signals/functions/createResource.md) ·
    [`createStore`](api/signals/functions/createStore.md) · [`romTable`](api/signals/functions/romTable.md)
  - **runtime/jsx-runtime** — [`render`](api/jsx-runtime/functions/render.md) ·
    [`ErrorBoundary`](api/jsx-runtime/functions/ErrorBoundary.md) ·
    [`screen`](api/jsx-runtime/variables/screen.md) · [`appendChild`](api/jsx-runtime/functions/appendChild.md) ·
    types [`JSXNode`](api/jsx-runtime/type-aliases/JSXNode.md) ·
    [`Component`](api/jsx-runtime/type-aliases/Component.md) · [`AppDict`](api/jsx-runtime/type-aliases/AppDict.md)
  - **runtime/flow** — [`Show`](api/flow/functions/Show.md) · [`For`](api/flow/functions/For.md) ·
    [`VirtualList`](api/flow/functions/VirtualList.md) · [`Navigator`](api/flow/functions/Navigator.md) ·
    [`Move`](api/flow/functions/Move.md) · [`animate`](api/flow/functions/animate.md)
- [Changelog](../CHANGELOG.md) — versioned releases, each with an **Upgrading** section
- [Component lifecycle](lifecycle.md) — mount/dispose/ownership
- [Migration from classic Piu/Alloy](migration.md) — one screen at a time
- [Custom fonts, images, settings pages, persistence](../tutorials/complete-watchface/README.md) — the feature guides live as tutorial parts, each device-verified

## The platform (read before fighting it)

- [The XS heap playbook](xs-heap-playbook.md) — the 32KB arena, the ~150-symbol
  boot floor, the 384-slot value stack, and every measured trick against them
- [Memory map](memory-map.md) · [Performance & battery](perf-battery.md)
- [The navreactive stack postmortem](postmortem-navreactive-stack.md) — how a
  boot death was hunted to the value stack

## Engineering notebook (internals — how we know what we know)

- [Design journey](design-journey.md) — why not React/VDOM/plain Solid; the
  alternatives, compared and measured
- [Field notes](field-notes.md) — the raw measurement rounds, corrections included
- [Review findings ledger](review-findings.md) — the 30-finding adversarial review
- [Device smokes](device-smokes.md) — the on-emulator verification catalog
- [Upstream issue](upstream-issue.md) — 13 documented firmware/toolchain asks
- [Roadmap](roadmap.md) · [xst setup](xst-setup.md) (for `pnpm run test:xs`)
