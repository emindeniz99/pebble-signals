# Market notes — what Pebble users & devs want (researched 2026-07-29)

Web research snapshot (two independent sweeps: user demand from the relaunched
appstore/community, developer demand from the SDK ecosystem), mapped to
signal-piu (renamed **pebble-signals**, 2026-08-06 — this dated note keeps the
original name in its narration). Sources are linked inline; heart counts are
apps.repebble.com
lifetime figures at research time. This is a strategy note, not a measured
device doc — treat numbers as directional.

## The landscape

- Pebble relaunched under Core Devices (Eric Migicovsky); **Core 2 Duo** and
  **Pebble Time 2** shipped 2025–2026. Community services run on
  [Rebble](https://rebble.io); the official SDK site is
  [developer.repebble.com](https://developer.repebble.com).
- The new official JS SDK ("Alloy") IS the stack this library targets:
  Moddable XS + Piu on-watch. CloudPebble returned; a Spring-2026 dev contest
  drew 500+ submissions ([results](https://repebble.com/blog/spring-2026-dev-contest-results)).
- The store lists ~2,000 apps / ~10,000 watchfaces; watchfaces are the
  dominant category.

## What USERS heart (top demand → signal-piu status)

| Want | Evidence | signal-piu |
|---|---|---|
| Data-rich WEATHER faces | YWeather 18.8K / Real Weather 15.9K / TimeStyle 15.4K hearts — the #1 category | PARTIAL — face primitives (clock/draw/fonts/config) covered; needs the phone data channel (useMessage/useFetch; fetch is device-gated, gotcha 18a) |
| Minimalist typography faces | Modern 11.9K, DIN Time 5.4K; e-paper praised always-on | COVERED — the library's sweet spot (ultraface/pulse are exactly this) |
| Sleep tracking + smart alarms | Misfit 18.7K, Morpheuz 6.8K | MISSING — no health JS API on the port (verified absent); accel+vibes exist but all-night logging in 32KB is a stretch |
| Music control | Music Boss 9.1K; a 2026 contest winner | INFEASIBLE on-port — no media-session bridge exposed to mods |
| Battery insight | Battery+ 6.4K; battery is THE purchase driver | COVERED — useBattery + storage + draw |
| Timers / interval timers | Timer+ 6K; active 2026 entries | COVERED — the strongest "build this first" demo category |
| Simple games (buttons+accel) | Pixel Miner 8K, Tiny Bird 3.8K; contest winners Pebbal/PBL-7 | PARTIAL — input/draw covered; 32KB rules out asset-heavy titles |
| Populated Timeline | Reviews: timeline "mostly empty" | INFEASIBLE on-port today — no timeline-pin JS surface (upstream ask) |
| Retro/nostalgia faces | Mario Time 8K, 91 Dub 9.8K | PARTIAL — sprites via reactive-variant Image; tiny assets only |

## What DEVELOPERS want (→ signal-piu status)

- TypeScript, a component model, and RN/Solid-familiar ergonomics — **covered**
  (the library's whole thesis: JSX + signals + 50+ bound components/hooks).
- Tooling: emulator recipes, config pages, asset pipeline, tree-shaking,
  memory diagnostics — **covered** (build.mts passes, device-smoke catalog,
  browser preview, xs-heap-playbook).
- The 32KB heap is the loudest platform complaint — **this repo's entire
  measured-diet discipline is the answer** (and the upstream preload ask #5).
- Prior art note: a "react-pebble" VDOM claim that mods have "only ~3KB heap"
  circulates; our measured arena is 26.6KB usable of 32KB (instruments,
  docs/memory-map.md) — fine-grained signals (no VDOM) is why this library
  fits where a VDOM does not.

## Strategic takeaway

The most-hearted categories that are FULLY in reach today: config-driven
minimalist/data faces, timers, battery utilities, menu-driven list apps.
The single highest-leverage unlock for the #1 category (weather faces) is
device-proving the phone data channel — **demonstrated same day
(2026-07-29): the `weather` example renders a driven city/temp/condition
payload over the proven config channel on gabbro
(`screenshots/weather-gabbro.png`); the remaining production step is
phone-side only (swap the driver for a real pkjs fetch)**. Health/timeline/
music need firmware-side JS surface — tracked as upstream asks, not library
gaps.

## Competitive landscape (researched 2026-07-31, 19 projects examined)

Full three-agent analysis (competitor sweep → own-surface inventory → hard
verdict); the distilled result. **Engineering verdict: signal-piu is ahead of
every project in the field, and the gap is not close. The real deficits are
COMMERCIAL — distribution, not code.**

- **The only code-level rival is `react-pebble`** (eddiemoore): compile-time
  Preact — JSX rendered ONCE in Node, reactivity INFERRED by perturbing hook
  values and diffing draw logs, zero framework on-watch. 3 stars, single
  author, idle since 2026-05-30, 126 npm downloads/30d. Its load-bearing
  claim — "Alloy mods get ~3 KB of runtime heap, no VDOM possible" — is
  corroborated by NO official source (developer.repebble.com leaves the
  emery/gabbro budget blank), while our instrumented number is 26.6 KB
  usable of a 32 KB arena, and our 10.9 KB runtime + live signal graph
  boots and paints on both shapes with PNG receipts. Their animation
  degrades to 1 fps (Piu Timeline "not yet emitted"); unsupported patterns
  fail SILENTLY (inference, not semantics). They beat us on exactly one
  axis: they are on npm and we are not.
- **The official Alloy SDK is our substrate, not a competitor** — we are the
  layer the Developer Preview does not ship (no state, no components, no
  reactive bindings). Keep riding `pebble build`; never fork it.
- **The channel signal:** the highest-traction third-party tool is Core
  Devices' own watchface AGENT SKILL (68★) — distribution now flows through
  agent skills, not npm packages. Adjacent non-rivals: strata (Figma-style
  editor, cannot yet emit a working clock — be its export target),
  pebbleface-studio (hosted C builder — proof hosted-and-listed beats
  capable-and-invisible), rossng/pebble-watchfaces (closest peer on
  toolchain hygiene; best first-adopter candidate), Clay (interop target —
  react-pebble shipped a declarative page builder, we have not),
  Pebble.js's 462 dead stars (the TAM evidence).

**Ordered gaps (from the verdict):**

| # | Gap | Severity/Effort | Call |
|---|---|---|---|
| 1 | Not on npm — documented quickstart is a 404 | blocking / S | Publish — owner set the version to **0.1.0** (2026-07-31); read-syntax decision below is made, so nothing blocks it |
| 2 | No discoverable home (subdir of a scratch monorepo) | blocking / S | ✅ DONE (2026-08-06) — standalone repo <https://github.com/emindeniz99/pebble-signals>; rebble community-tools listing still open |
| 3 | Zero adoption evidence | blocking / M | Ship 2-3 signal-piu watchfaces to the store |
| 4 | No agent-skill distribution | important / S | Package the gotchas/lints/font-tables as a skill — our docs ARE the asset |
| 5 | No live network round-trip receipt (gotcha 18b) | important / M | Make fetch-over-message the named, receipted API; useFetch STAYS (owner: delete nothing) — relabeled device-gated, not removed |
| 6 | Two read syntaxes (`count()` vs `.value`) | important / M | **DECIDED (owner, 2026-07-31): keep both, delete nothing** — lint-reads makes the mix-up build-time-fatal; callable-everywhere stays a measurable ADDITIVE option |
| 7 | No declarative Clay page builder | important / M | Typed TSX→Clay page emitter sharing messageKey types with useConfig |
| 8 | 63 KB README wall | important / S | ~200-line front page; move the ledger to docs/ |
| 9 | No hardware receipts | important / — | Do NOT hold publish for it; the honest QEMU label is a credibility asset |
| 10 | Conformance parity documented, not executed | important / S | ✅ DONE (2026-07-31) — solid-js + @preact/signals-core are devDeps (Node-side only, never on the device); 28 of 30 laws replay a LIVE reference, 2 are documented-only with their reason pinned in the test. React stays documented (no headless core) |
| 11 | TTF subsetting (react-pebble has it) | nice / S | Add characterRegex subsetting to gen-manifest |
| — | Nix pin, Python tooling, `pebble package` channel, static compiler | — | DO NOTHING (measured/reasoned no) |
