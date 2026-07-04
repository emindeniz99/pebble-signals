# Packaging — consuming signal-piu as a library (C11)

signal-piu is developed inside an app template (this repo is itself a buildable
Pebble app), but it packs as a real npm library: `npm pack` produces a tarball
a separate project can install and get the **typed runtime + the build tools**.

## What the package exports

```jsonc
"exports": {
  "./signals":     { "types": ".../runtime-types/signals.d.ts",     "default": ".../runtime/signals.ts" },
  "./jsx-runtime": { "types": ".../runtime-types/jsx-runtime.d.ts", "default": ".../runtime/jsx-runtime.ts" },
  "./flow":        { "types": ".../runtime-types/flow.d.ts",        "default": ".../runtime/flow.ts" },
  "./runtime/*":   ".../runtime/*",   // raw sources (a consumer build copies these)
  "./tools/*":     "./tools/*",       // lower, gen-manifest, treeshake, fontcheck, xstest…
  "./build.mts":   "./build.mts"      // the orchestrator itself
}
```

- **Types are generated, not hand-written** (`prepack` → `npm run build:types` →
  `tsc --declaration` from the runtime source; B6). The tarball ships whatever
  the source says — `signal<T>`, `ReadonlySignal<T>`, `ForProps<T>`, the typed
  `ByteStore` — so consumer DX equals in-repo DX.
- **`default` points at the .ts source, deliberately.** There is no generic
  "dist" build that makes sense off-device: the runtime must be minified and
  manifest-mapped per app by the device build. Consumers' bundlers/tsc read the
  source; the DEVICE build path is the tools (below), not a prebuilt bundle.
- Verified end-to-end: a fresh project that `npm install`s the tarball
  typechecks `import { signal } from "signal-piu/signals"` with full generics,
  and `// @ts-expect-error` on a computed write still bites (the consumer smoke
  in this repo's history).

## Distribution model: SOURCE, not minified

The tarball deliberately ships readable `.ts` source, **never** a minified
bundle. Minification is a per-app DEVICE-BUILD step, not a library format:
`build.mts` minifies the runtime into `runtime-min/` for each app because the
mod archive rides a ~15.9KB startup ceiling (gotcha 15) and per-app
tree-shaking decides which modules ship at all. A pre-minified library would
be un-tree-shakeable, un-debuggable, and would still have to be re-processed
per app — all cost, no benefit. (Property names in the source ARE kept short —
`S.sig`, `store.b` — because esbuild's minifier mangles locals but NOT property
names; a property name survives verbatim into the shipped bytes and becomes an
XS ID + ROM string on device. Short properties are the source-level part of the
size budget that minify cannot do for us.)

## The lowering tool is a consumer feature — and it's OPTIONAL

`tools/lower/cli.mts` ships in the tarball (`signal-piu/tools/*`) and runs on
the CONSUMER's app code — that is its whole purpose: rewriting *their*
`useState`/`signal`/`computed` call sites to the packed `S` API and
auto-thunking *their* JSX props. `build.mts` runs it by default;
`--no-lower` / `LOWER=0` skips it. Skipping is SAFE but costs:

| Without lower | Effect |
|---|---|
| object API stays | each useState/signal keeps its closures/Signal object (~4 slots each — measured 2x cost of packed) |
| no auto-thunk | bare reactive props (`string={count()}`) bind as static values — write thunks by hand (`string={() => count()}`) |

So: correctness never depends on lower; the 32KB budget usually does.

## Pitfall log (learned the hard way)

- **Do not add `"type": "module"` to a consuming app's package.json** (or this
  one). The Pebble SDK's waf generates a CommonJS `webpack.config.js` under
  `build/` at build time; a root ESM package type makes Node reject it
  (`require is not defined in ES module scope`) and `pebble build` fails.
  Tried and reverted here (commit ece030f). The library exports don't need it —
  they point at `.ts` sources consumed by the consumer's own tooling.
- **Node refuses to type-strip `.mts` under node_modules**
  (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, a deliberate Node policy) —
  a consumer literally cannot run `node_modules/signal-piu/build.mts`. That is
  WHY the tarball ships a compiled `dist/` (prepack → `tsconfig.dist.json`,
  with `rewriteRelativeImportExtensions` turning the `.mts` import specifiers
  into `.mjs`): consumers run `dist/build.mjs`; in-repo dev keeps running the
  `.mts` sources directly. The same scripts serve both layouts by resolving
  the package root with a walk-up (`tools/pkg-root.mts`) and their sibling
  tools SCRIPT-relatively — never with hard-coded `../..` depths.

## What a consuming app project looks like — E2E VERIFIED

`examples/consumer/` is the living, DEVICE-VERIFIED reference: a standalone
project that installs the tarball and builds a running watch app from it
(screenshots/consumer-e2e-t0.png → -t5.png show the reactive tick advancing on
the QEMU emulator). The flow:

1. Scaffold a Pebble Moddable app — run the `create-signal-piu` CLI, which
   generates `examples/consumer/`'s shape (the `pebble` field in
   package.json, `wscript`, `src/c/mdbl.c`, `src/embeddedjs/manifest.base.json`,
   a device `tsconfig.json`, `src/pkjs/`) into a fresh directory:
   `npx -p signal-piu create-signal-piu my-watch`, or, once the package is
   installed, `node node_modules/signal-piu/dist/tools/create-app.mjs
   my-watch`. In-repo, `node tools/create-app.mts my-watch` runs the same
   scaffold from source.
2. `npm install signal-piu typescript esbuild` (tarball or registry once
   published; tsc + esbuild are the build's tools, brought by the consumer).
3. Author `src/tsx/examples/<app>.tsx` with DEVICE specifiers
   (`import { render } from "runtime/jsx-runtime"` — the mod manifest maps
   `runtime/*` on the watch). Editor/typecheck resolves the same names into
   the installed package via `paths` (see `examples/consumer/
   tsconfig.check.json`), including real Piu host JSX typed by the vendored
   Moddable typings that ship in the tarball.
4. Build: `node node_modules/signal-piu/dist/build.mjs --app <app>` — the
   COMPILED orchestrator detects the consumer project by its `pebble` field,
   takes app sources/manifest/scaffold from the PROJECT and the runtime/tools
   from the PACKAGE, and drives `pebble build` to a `.pbw`.

## Not in v1 (explicit non-goals, so nobody assumes)

- **Registry publish** — `private: true` stays; `npm pack` is the
  distribution unit. The `create-signal-piu` scaffold CLI (shipped, above)
  works the same against a packed tarball as it would against a registry
  install — publishing to the registry is a separate, still-unplanned step.
- **Prebuilt runtime in the tarball** — wrong by design (see above): minify +
  manifest mapping are per-app, on-device concerns.

## Maintenance rules

- `files` in package.json is the allowlist — check `npm pack --dry-run` when
  adding tool/doc files a consumer needs.
- Never hand-edit `src/embeddedjs/runtime-types/` (gitignored, generated).
- The consumer smoke (install tarball → tsc a typed usage file) is the gate
  for exports-map changes; re-run it when touching `exports`/`files`.
