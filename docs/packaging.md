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
  "./tools/*":     "./dist/tools/*",  // COMPILED lower, gen-manifest, treeshake, fontcheck…
  "./build.mjs":   "./dist/build.mjs" // the compiled orchestrator
}
```

- **Tool subpaths resolve to `dist/` (compiled `.mjs`), not the `.mts`
  source.** Node refuses to type-strip under `node_modules`, so a source
  mapping was a subpath consumers could resolve but never run (codex P2).
  Import tools as `signal-piu/tools/<name>.mjs`; the sources still ship in
  the tarball for reading.

- **Types are generated, not hand-written** (`prepack` → `pnpm run build:types` →
  `tsc --declaration` from the runtime source; B6). The tarball ships whatever
  the source says — `signal<T>`, `ReadonlySignal<T>`, `ForProps<T>`, the typed
  `ByteStore` — so consumer DX equals in-repo DX.
- **`default` points at the .ts source, deliberately.** There is no generic
  "dist" build that makes sense off-device: the runtime must be minified and
  manifest-mapped per app by the device build. Consumers' bundlers/tsc read the
  source; the DEVICE build path is the tools (below), not a prebuilt bundle.
- **Support surface: bundler/tsc-only — bare Node cannot import the runtime.**
  Because `default` resolves to `.ts` under `node_modules`, a plain
  `node -e 'import("signal-piu/signals")'` fails (Node refuses to type-strip
  inside `node_modules` by design). That path is out of scope: the supported
  consumers are a bundler/tsc toolchain (typechecking, editors, tests via the
  repo's vm harness pattern) and the device build. If a real consumer ever
  needs bare-Node imports, the move is compiling the runtime to `dist/` JS
  and pointing `default` there — deliberately NOT done today (one more build
  artifact to keep in sync, no consumer needs it; consumer-smoke covers the
  supported path).
- Verified end-to-end: a fresh project that `npm install`s the tarball
  typechecks `import { signal } from "signal-piu/signals"` with full generics,
  and `// @ts-expect-error` on a computed write still bites (the consumer smoke
  in this repo's history).

## Distribution model: SOURCE, not minified

The tarball deliberately ships readable `.ts` source, **never** a minified
bundle. Minification is a per-app DEVICE-BUILD step, not a library format:
`build.mts` minifies the runtime into `runtime-min/` for each app because the
mod archive rides a hard boot slot/symbol floor (README gotcha 15
correction; playbook "The boot floor") and per-app
tree-shaking decides which modules ship at all. A pre-minified library would
be un-tree-shakeable, un-debuggable, and would still have to be re-processed
per app — all cost, no benefit. (Property names in the source ARE kept short —
`S.sig`, `store.b` — because esbuild's minifier mangles locals but NOT property
names; a property name survives verbatim into the shipped bytes and becomes an
XS ID + ROM string on device. Short properties are the source-level part of the
size budget that minify cannot do for us.)

## The lowering tool is a consumer feature — and it's OPTIONAL

`tools/lower/cli.mts` ships compiled in the tarball
(`signal-piu/tools/lower/cli.mjs` via the `./tools/*` → `dist/tools/*`
export) and runs on
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

- **Registry publish** — not done; `npm pack` is the distribution unit. The
  package is otherwise PUBLISH-READY: `prepack`
  already builds the generated types + compiled dist, `files` is a curated
  allowlist, and the consumer smoke gates the exact artifact a registry
  install would deliver. When the owner wants it public, the entire remaining
  work is: `npm login`, `npm publish` — nothing in the artifact itself needs
  to change (the name `signal-piu` was still unclaimed on
  registry.npmjs.org, checked 2026-07-29). Until then
  `create-signal-piu` + the tarball behave identically to a registry install
  — with one honest caveat: the README/getting-started `npx -p signal-piu`
  quickstart and the scaffold template's `"signal-piu": "^1.0.0"` dependency
  BOTH resolve from the registry, so that documented path only starts working
  at the first publish.
  **There is no `private: true` guard** (an earlier draft of this file claimed
  one — it was never in package.json), so an accidental `npm publish` from
  this directory would go through. Add one if the door should be bolted until
  the owner is ready.
- **Prebuilt runtime in the tarball** — wrong by design (see above): minify +
  manifest mapping are per-app, on-device concerns.

## Upgrades: what a scaffolded project gets automatically — and what it owns

When a consumer bumps signal-piu (`npm install signal-piu@next` /
newer tarball), two very different things happen:

**Upgrades automatically** (lives in `node_modules`, used at build time):
the runtime (signals/jsx-runtime/flow — every fix and feature), the whole
compile pipeline (`dist/build.mjs`, lowering, pruning, treeshake,
fontcheck, manifest gen), the generated types, the vendored Piu typings.
A rebuild after the bump IS the upgrade.

**Frozen copies the project OWNS** (scaffolded once by `create-signal-piu`,
never touched by an upgrade): `wscript`, `src/c/*` (mdbl.c and any native
code they add), `manifest.base.json`, the two tsconfigs, `src/pkjs/`,
package.json. This is the standard scaffold trade-off (create-react-app,
create-vite — same deal): those files are the consumer's freedom surface,
so we never overwrite them. If a future signal-piu needs a scaffold-file
change, that's a documented migration note in the release, not magic.

**The freedom guarantee**: the consumer is never boxed in. wscript is
theirs (custom build steps), `src/c` compiles ALL their .c files (their
native code beside mdbl.c — sensors, workers, FFI), `worker_src/` works
(see examples/worker), resources/media/fonts are theirs, and every build
gate has an escape flag (--no-lower, --no-prune, --no-squash,
--no-check-c, --skip-fontcheck). signal-piu is helpers on top of a normal Pebble
project, not a cage around one.

## Maintenance rules

- `files` in package.json is the allowlist — check `npm pack --dry-run` when
  adding tool/doc files a consumer needs. A path pulled in by `files` can NOT
  be excluded again by .gitignore/.npmignore (measured: adding `__pycache__/`
  to .gitignore left `tools/__pycache__/*.pyc` in the tarball); the only lever
  is a `"!…"` entry in `files` itself.
- Never hand-edit `src/embeddedjs/runtime-types/` (gitignored, generated).
- The consumer smoke (install tarball → tsc a typed usage file) is the gate
  for exports-map changes; re-run it when touching `exports`/`files`.
