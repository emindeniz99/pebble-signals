# worker-demo

A Pebble watch app built on [pebble-signals](https://www.npmjs.com/package/pebble-signals) —
fine-grained reactive signals + JSX (no VDOM) for Pebble/Moddable XS, scaffolded
by `create-pebble-signals`.

## Layout

| File | Role |
|---|---|
| `package.json` | `pebble` field (Moddable project) + `npm run build` |
| `wscript`, `src/c/mdbl.c` | Pebble build glue + XS machine bootstrap |
| `src/embeddedjs/manifest.base.json` | mod manifest (maps `runtime/*`) |
| `tsconfig.json` | DEVICE transpile (src/tsx → src/embeddedjs/app, noCheck) |
| `tsconfig.check.json` | STRICT typecheck against the installed `pebble-signals` package |
| `src/tsx/examples/main.tsx` | the app — device `runtime/*` imports + Piu JSX |
| `src/pkjs/index.js` | phone-side fetch proxy glue |

## Build & run

```sh
npm install pebble-signals typescript esbuild @moddable/pebbleproxy
npm run build            # = node node_modules/pebble-signals/dist/build.mjs --app main
pebble install --emulator gabbro
```

`build.mjs` (the compiled build orchestrator that ships in the `pebble-signals`
package) detects this project by its `pebble` field: app sources/manifest
come from HERE, the reactive runtime and compile tools from the installed
package.

## Notes

- `main.tsx` is deliberately counter-class LEAN (one style, one label): the
  32KB XS arena currently OOMs at boot for clock-class apps (2+ styles/labels)
  — see pebble-signals's `docs/roadmap.md` issue #29 before adding more UI.
- `pebble install --emulator gabbro` requires the Pebble SDK on `PATH`.

## Background worker (this example's whole point)

`worker_src/c/worker.c` is a Pebble background worker: C-only, **10.5KB** RAM
budget, keeps running when the app exits (verified: heartbeats logged for
100+ seconds across app switches). It communicates with the app through the
SHARED persist storage (the "KV": `persist_write_int` in the worker,
readable by the app) and via `APP_LOG` (visible in `pebble logs`). The app
launches it with `app_worker_launch()` in `src/c/mdbl.c`.

Two things it can NOT do (measured, not just documented):
- **No XS/JS**: `pebble_worker.h` does not declare the Moddable API —
  `moddable_createMachine` in a worker fails to compile
  (`error: unknown type name 'ModdableCreationRecord'`), and the machine
  loads bytecode from app resources, which workers can't read. pebble-signals
  UIs stay in the foreground app; workers are for sensors/counters.
- **It does not add JS RAM**: the XS arena is firmware-fixed at 32KB
  regardless — the worker's 10.5KB is a separate, C-only budget. Use it to
  OFFLOAD background work (step counting, accel batching into persist), not
  to expand the UI heap.
