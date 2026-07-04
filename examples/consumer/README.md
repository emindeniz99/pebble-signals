# signal-piu consumer example — a FULL, device-verified app

Dogfoods the packaging (`docs/packaging.md`): a standalone Pebble app project
that consumes signal-piu as an **installed npm library** (the tarball `npm
pack` produces — never this repo's source tree via relative imports) all the
way to a **running watch app on the QEMU emulator**. Proof:
`screenshots/consumer-e2e-t0.png` → `-t5.png` (the reactive tick advancing).

## Layout — the consumer scaffold

| File | Role |
|---|---|
| `package.json` | `pebble` field (Moddable project) + `npm run build` |
| `wscript`, `src/c/mdbl.c` | Pebble build glue + XS machine bootstrap |
| `src/embeddedjs/manifest.base.json` | mod manifest (maps `runtime/*`) |
| `tsconfig.json` | DEVICE transpile (src/tsx → src/embeddedjs/app, noCheck) |
| `tsconfig.check.json` | STRICT typecheck against `node_modules/signal-piu` |
| `src/tsx/examples/main.tsx` | the app — device `runtime/*` imports + Piu JSX |
| `src/app.tsx` | typecheck-only demo of the `signal-piu/*` exports-map style |
| `src/pkjs/index.js` | phone-side fetch proxy glue |

## Run it

From the signal-piu root, `npm run test:consumer` packs a fresh tarball,
installs it here, strict-typechecks both import styles, and runs the packaged
`dist/tools/lower/cli.mjs` on a scratch file (CI-safe — no emulator needed).

For the full device path (needs the Pebble SDK + emulator):

```sh
cd examples/consumer
npm install --no-save <path-to>/signal-piu-1.0.0.tgz typescript esbuild @moddable/pebbleproxy
npm run build            # = node node_modules/signal-piu/dist/build.mjs --app main
pebble install --emulator gabbro
```

`build.mjs` (the COMPILED orchestrator — Node refuses to type-strip `.mts`
under node_modules, see docs/packaging.md pitfall log) detects this project by
its `pebble` field: app sources/manifest/scaffold come from HERE, the runtime
and compile tools from the package. Artifacts were verified byte-identical to
an in-repo build of the same source.

## Third-party npm packages work

`main.tsx` imports [`just-capitalize`](https://www.npmjs.com/package/just-capitalize)
(a tiny, zero-dependency, pure-JS registry package — no DOM/node APIs, so it
runs fine on XS) and runs the label text through it. `npm install --no-save
just-capitalize` here, then it Just Works as a normal `node_modules` import —
no signal-piu-specific glue needed. This proves the general case: **any**
zero/small-dependency, XS-safe (no DOM, no Node builtins) npm package can be
used in app code the same way.

Bundling-wise, esbuild only externalizes `runtime/*` (the preloaded signal-piu
runtime) — a `node_modules` import like this one INLINES straight into the
built `src/embeddedjs/app/main.js`. Verified: after `npm run build`, `main.js`
contains the package's own source, e.g. its error string:

```sh
grep -o "just-capitalize expects a string argument" src/embeddedjs/app/main.js
```

They bundle into `main.js` and count against the app's ~32KB heap budget the
same as your own code — keep them small and XS-safe (no DOM, no Node
builtins, no big dependency trees).

## Notes

- `main.tsx` is deliberately counter-class LEAN (one style, one label): the
  32KB arena currently OOMs at boot for clock-class apps — measured during
  this example's bring-up, tracked as issue #29 in `docs/roadmap.md`.
- The scaffold is still copy-the-shape; `create-signal-piu` (roadmapped) turns
  it into `npm create`.
