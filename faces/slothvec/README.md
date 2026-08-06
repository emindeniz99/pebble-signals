# Sloth

A Pebble watch app built on
[pebble-signals](https://github.com/emindeniz99/pebble-signals#readme) —
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
npm install pebble-signals   # typescript + esbuild arrive as peerDependencies,
                             # @moddable/pebbleproxy as a regular dependency
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
