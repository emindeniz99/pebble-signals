# Market notes — what Pebble users & devs want (researched 2026-07-29)

Web research snapshot (two independent sweeps: user demand from the relaunched
appstore/community, developer demand from the SDK ecosystem), mapped to
signal-piu. Sources are linked inline; heart counts are apps.repebble.com
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
device-proving the phone data channel (useFetch / useMessage round-trip on
hardware). Health/timeline/music need firmware-side JS surface — tracked as
upstream asks, not library gaps.
