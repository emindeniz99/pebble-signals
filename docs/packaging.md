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

## What a consuming app project looks like

Today (v1 packaging), a watch app still needs the Pebble project scaffold
(`package.json` `pebble` field, `manifest.base.json`, `src/c/mdbl.c`, wscript
glue) — that part is TEMPLATE, not library. The flow:

1. Scaffold a Pebble Moddable app (copy this repo's shape, or `pebble new` +
   the `pebble.projectType: "moddable"` field).
2. `npm install signal-piu` (tarball or registry once published).
3. Author `src/tsx/*.tsx` importing from `signal-piu/signals` etc. — full types.
4. Build with the packaged orchestrator/tools: point the build at
   `node_modules/signal-piu/build.mts` (or copy it) — it transpiles JSX, runs
   the lowering (`tools/lower/cli.mts`), minifies the runtime from
   `node_modules/signal-piu/src/embeddedjs/runtime/`, and maps the manifest.

## Not in v1 (explicit non-goals, so nobody assumes)

- **`create-signal-piu` scaffold CLI** — the real fix for step 1. Roadmapped;
  it turns "copy the template" into `npm create signal-piu@latest my-watch`.
- **Registry publish** — `private: true` stays until the scaffold story exists;
  `npm pack` is the distribution unit meanwhile.
- **Prebuilt runtime in the tarball** — wrong by design (see above): minify +
  manifest mapping are per-app, on-device concerns.

## Maintenance rules

- `files` in package.json is the allowlist — check `npm pack --dry-run` when
  adding tool/doc files a consumer needs.
- Never hand-edit `src/embeddedjs/runtime-types/` (gitignored, generated).
- The consumer smoke (install tarball → tsc a typed usage file) is the gate
  for exports-map changes; re-run it when touching `exports`/`files`.
