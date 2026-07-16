# Getting started — zero to a face on the emulator

The missing prerequisites page: everything the Quick start assumes, with the
install commands. Two paths — hacking inside this repo, or consuming the npm
package in your own project.

## 1. Prerequisites (once per machine)

- **Node.js ≥ 24** and **pnpm ≥ 11** (`corepack enable` activates the version
  pinned in package.json).
- **Pebble tool v5 + SDK 4.17** — the modern toolchain from the rePebble
  project. Follow the official install guide at
  <https://developer.repebble.com> (SDK → install), then:

  ```bash
  pebble sdk list          # expect: 4.17 (active)
  ```

  The SDK bundles the QEMU emulators for both target watches: `gabbro`
  (Pebble Round 2, 260×260 round color) and `emery` (Pebble Time 2, 200×228
  rect color). No physical watch needed for anything in these docs.
- Linux/macOS. (All measurements in this repo were made on Linux + QEMU.)

Optional, only for the XS conformance suite (`pnpm run test:xs`): the
Moddable `xst` binary — see [xst-setup.md](xst-setup.md).

## 2. In-repo path (this repository)

```bash
git clone <this-repo> && cd playground/projects/signal-piu
pnpm install                              # standalone pnpm workspace
pnpm run dev -- --app watchface           # build + install + live logs, one command
```

**Success looks like:** the gabbro emulator window opens (or the existing one
relaunches) showing a black face with a large HH:MM, a seconds line ticking
every second, and a date line — the `watchface` example
([screenshot](../screenshots/)). The terminal streams `instruments:`
heartbeat lines about once a second; a capture with ZERO heartbeats is a
dead transport, not a quiet app ([debugging](debugging.md)).

Build without installing, or target the rect watch:

```bash
APP=counter node build.mts                # build only (both platforms)
pebble install --emulator emery           # sideload on the rect watch
pnpm run smoke:device                     # the full 14-app verification matrix
```

Sanity gates that need no SDK at all: `pnpm run verify` (typecheck + tests at
100% coverage + consumer smoke).

## 3. Your-own-project path (npm)

```bash
npx -p signal-piu create-signal-piu my-watch
cd my-watch && npm install && node node_modules/signal-piu/build.mjs
```

Full details — exports map, upgrade rules, what the scaffold owns vs what the
package owns — in [packaging.md](packaging.md); a worked consumer project
lives at [examples/consumer/](../examples/consumer/).

## 4. Where next

- New to the model? [Core concepts](concepts.md), then the
  [3-part tutorial](../tutorials/build-a-watchface/README.md).
- Shipping a real face? [The complete watchface](../tutorials/complete-watchface/README.md)
  (fonts, images, settings page, persistence, .pbw).
- Something broke? [Debugging & troubleshooting](debugging.md) — the failure
  shapes here are terse; that page pattern-matches them for you.
