# NOTICE — provenance of the vendored Moddable typings

Everything under `types/moddable/` (except `all.d.ts`, `.version` and this
file, which are generated/maintained here) is vendored **unmodified** from
[`@moddable/typings@8.2.3`](https://www.npmjs.com/package/@moddable/typings),
published on npm by Moddable Tech's maintainers.

Provenance facts, stated without legal conclusions:

- The npm package metadata declares license **ISC**.
- The `.d.ts` files themselves carry "Moddable SDK Tools" **GPL-3.0** header
  boilerplate (e.g. `piu/CombTransition.d.ts`), unchanged in the package as
  of `@moddable/typings@9.0.0`.
- The files are vendored **unmodified** and pinned by
  [`tools/sync-moddable-typings.sh`](../../tools/sync-moddable-typings.sh)
  (the pin is recorded in `.version`). Vendoring — rather than depending on
  the package — is a technical necessity: the package's `types` field exposes
  no per-surface entry points, and TypeScript cannot glob `node_modules`, so
  the only way to activate this typing surface is checked-in files plus the
  generated `all.d.ts` barrel.
- These are **compile-time-only type declarations**: no code from them ships
  in any build artifact or runs anywhere.

These files are third-party material and are **not** covered by this
repository's MIT license (see [`LICENSE`](../../LICENSE)); their terms are
whatever Moddable published them under. Questions about the ISC-vs-GPL
header discrepancy belong upstream with
[Moddable](https://github.com/Moddable-OpenSource/moddable).
