# signal-piu consumer example

Dogfoods the C11 packaging (`docs/packaging.md`): proves signal-piu works as
an **installed npm library**, not just as an in-repo source tree.

## What this proves

- `npm pack` at the repo root produces a tarball that installs cleanly
  outside the repo (`npm install --no-save`, no workspace/`paths` trickery).
- The exports map (`signal-piu/signals`, `signal-piu/flow`, `signal-piu/jsx-runtime`,
  …) resolves to real, generated `.d.ts` files (`npm run build:types` via the
  package's `prepack` hook) — `src/app.tsx` typechecks with full generics
  (`useState`, `computed`, `createResource`, `Show`, `VirtualList`) exactly
  like an external consumer would see them.
- The packaged build tool (`signal-piu/tools/lower/cli.mts`) runs correctly
  from inside `node_modules` — not just from the repo's own `tools/` — proving
  `"./tools/*"` in the exports map ships a working, standalone tool.

This package has no `dependencies` entry for `signal-piu` on purpose: the
smoke script installs whatever tarball `npm pack` *currently* produces, so
this example always tests the real, current packaging — not a stale pinned
version.

## How to run

From the `signal-piu` repo root:

```sh
npm run test:consumer
```

This packs the repo, installs the tarball into `examples/consumer/node_modules`,
typechecks `src/app.tsx` against it, and runs the packaged lowering tool
against a throwaway snippet to confirm it rewrites `useState` correctly.

## What this does NOT cover

- **A full device build.** A real watch app also needs the Pebble/Moddable
  project scaffold (the `pebble` field in `package.json`, `manifest.base.json`,
  `src/c/mdbl.c`, wscript glue) and the vendored Piu host typings
  (`types/moddable/`) wired into its own tsconfig — that's the "app template"
  half of packaging, explicitly out of scope for v1 packaging (see
  `docs/packaging.md`, "Not in v1"). The roadmapped `create-signal-piu`
  scaffold CLI is the intended fix for that gap; until then, copy this repo's
  shape as the starting template.
- Because of the above, `src/app.tsx` never touches a real Piu host element
  (`Label`/`Container`/…) — it only typechecks signal-piu's own API surface.
