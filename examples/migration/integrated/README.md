# integrated

The **after** half of the migration story in
[`docs/migration.md`](../../../docs/migration.md) — the exact same app as
[`../original/`](../original/) (a stock Pebble C project: counter screen +
SELECT-pushed detail screen, BACK pops it), rebuilt on
[pebble-signals](https://www.npmjs.com/package/pebble-signals). Same `uuid` and
`displayName` as `../original/package.json` — this is a migration, not a new
app.

## What changed vs. `../original/`

| | original (stock C) | integrated (pebble-signals) |
|---|---|---|
| `pebble.projectType` | (unset → native) | `"moddable"` |
| `pebble.enableMultiJS` | unset | `true` |
| UI code | `src/c/original.c` (2 `Window`s, `TextLayer`s, click handlers) | `src/tsx/examples/main.tsx` (JSX + signals) |
| Screen navigation | `window_stack_push`/pop (WindowStack default) | `<Navigator>` push/pop (`runtime/flow`) |
| `src/c/` | the whole app | `mdbl.c` only — the XS machine bootstrap |
| `wscript` | unchanged | unchanged (still compiles `src/c/**/*.c`) |
| `uuid` / `displayName` | `92aaf2c6-8bd8-454b-8372-a280ad2edef3` / `original` | same |

## Layout

| File | Role |
|---|---|
| `package.json` | `pebble` field (now `projectType: "moddable"`) + `npm run build` |
| `wscript`, `src/c/mdbl.c` | Pebble build glue + XS machine bootstrap |
| `src/embeddedjs/manifest.base.json` | mod manifest (maps `runtime/*`) |
| `tsconfig.json` | DEVICE transpile (src/tsx → src/embeddedjs/app, noCheck) |
| `tsconfig.check.json` | STRICT typecheck against the installed `pebble-signals` package |
| `src/tsx/examples/main.tsx` | the ported app — counter + detail screen via `<Navigator>` |
| `src/pkjs/index.js` | phone-side fetch proxy glue |

## Build & run

```sh
npm install --no-save <path-to>/pebble-signals-1.0.0.tgz typescript@6 esbuild@0.28 @moddable/pebbleproxy
node node_modules/pebble-signals/dist/build.mjs --app main --no-check-c
pebble install --emulator gabbro
```

Verified: this exact sequence produces `build/integrated.pbw`, and
`./node_modules/.bin/tsc -p tsconfig.check.json` exits 0.

## Notes

- `--no-check-c` skips the clang-format gate — this example doesn't ship
  `.clang-format`-checked native code beyond the template's `mdbl.c`.
- See `docs/migration.md` for the step-by-step this port followed, and "what
  stays yours" (wscript, extra `src/c/`, resources, worker_src all survive
  a migration untouched).
