# watchface

A Pebble watch app built on [signal-piu](https://www.npmjs.com/package/signal-piu) —
fine-grained reactive signals + JSX (no VDOM) for Pebble/Moddable XS, scaffolded
by `create-signal-piu`.

## Layout

| File | Role |
|---|---|
| `package.json` | `pebble` field (Moddable project) + `npm run build` |
| `wscript`, `src/c/mdbl.c` | Pebble build glue + XS machine bootstrap |
| `src/embeddedjs/manifest.base.json` | mod manifest (maps `runtime/*`) |
| `tsconfig.json` | DEVICE transpile (src/tsx → src/embeddedjs/app, noCheck) |
| `tsconfig.check.json` | STRICT typecheck against the installed `signal-piu` package |
| `src/tsx/examples/main.tsx` | the app — device `runtime/*` imports + Piu JSX |
| `src/pkjs/index.js` | phone-side fetch proxy glue |

## Build & run

```sh
npm install signal-piu typescript esbuild @moddable/pebbleproxy
npm run build            # = node node_modules/signal-piu/dist/build.mjs --app main
pebble install --emulator gabbro
```

`build.mjs` (the compiled build orchestrator that ships in the `signal-piu`
package) detects this project by its `pebble` field: app sources/manifest
come from HERE, the reactive runtime and compile tools from the installed
package.

## Notes

- `main.tsx` is deliberately counter-class LEAN (one style, one label): the
  32KB XS arena currently OOMs at boot for clock-class apps (2+ styles/labels)
  — see signal-piu's `docs/roadmap.md` issue #29 before adding more UI.
- `pebble install --emulator gabbro` requires the Pebble SDK on `PATH`.
