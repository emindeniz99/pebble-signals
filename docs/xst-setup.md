# xst — running the conformance laws on the real XS engine

The fast test suite (`pnpm test`, 240+ tests, 100% coverage) runs the runtime in
a Node `vm.SourceTextModule` sandbox — that is **V8**, not the **XS** engine the
watch actually ships. V8 and XS agree on the ECMAScript spec but not on every
edge (freeze semantics, ROM aliasing, error behavior), so the pure-signal
conformance laws also run on real XS as a slower, high-fidelity gate:

```sh
pnpm run test:xs
```

This builds the runtime (`tsc`), locates an XS engine binary, and runs
`tests/xs/laws.js` — the pure-reactivity subset of `tests/conformance.test.mts`
(19 laws) — directly on XS. Verified passing on **XS 17.9.1** (2026-07).

## Installing the engine (do it this way)

The one-liner, via [jsvu](https://github.com/GoogleChromeLabs/jsvu) (Google's
JS-engine installer; the path `tools/xstest.mts` auto-detects):

```sh
npx jsvu --engines=xs --os=linux64      # macOS: --os=mac64 / mac64arm
```

That downloads the prebuilt binary from the official
[moddable-xst releases](https://github.com/Moddable-OpenSource/moddable-xst/releases)
into `~/.jsvu/engines/xs/xs`. No Moddable SDK, no compiler needed.

Alternatives, in order of preference:

1. **jsvu** (above) — prebuilt, seconds, auto-detected.
2. **Prebuilt binary by hand** — download from moddable-xst releases, put it on
   `PATH` as `xst` (auto-detected) or point `XS_BIN=/path/to/xst` at it.
3. **Build from source** (only if you need a specific XS revision):
   ```sh
   git clone --depth 1 https://github.com/Moddable-OpenSource/moddable
   cd moddable/xs/makefiles/lin && make        # mac: makefiles/mac
   # binary lands in moddable/build/bin/lin/release/xst
   ```

`tools/xstest.mts` resolution order: `$XS_BIN` → `~/.jsvu/engines/xs/xs` →
`xst`/`xs` on PATH. If none is found it exits 1 with these instructions —
an explicitly requested XS gate never silently skips (rule 12).

## What runs on xst — and what deliberately does not

**Runs:** every law that exercises only the reactive core (`signals.js` is
dependency-free): tracking, computed memoization, batch, untrack, ownership,
cleanup, error isolation (`__spError` — an XS-motivated hook, since an uncaught
throw aborts the machine on device), the pinned diamond/nesting divergences,
and the `useState` functional-update contract the packed lowering rides on.

**Does not run:** the Piu-dependent suites (jsx factory, Show/For/VirtualList/
Navigator, screen stubs) and coverage. Reasons, so nobody "fixes" this later:

- The Piu host classes exist only under the firmware/emulator. Running flow
  tests on xst means porting the stub layer — then you are testing our stubs
  on a second engine, not testing XS.
- xst has no `node:test`, no `node:assert`, no V8 coverage. The full suite's
  runner, assertions, and the 100%-coverage gate are Node-only by design.
- Real-device behavior (preload/ROM freeze, the 32KB arena, Piu layout
  crashes) is covered by the QEMU emulator path (`tools/drive.py`,
  `tools/memtest.py`), which xst cannot simulate anyway.

So the test architecture is three tiers, each catching what the others cannot:

| Tier | Engine | Speed | Catches |
|---|---|---|---|
| `pnpm test` (vm sandbox) | V8 | ~1s, 100% cov | logic bugs, regressions |
| `pnpm run test:xs` | **XS** | ~1s, laws only | engine-semantics divergence |
| QEMU emulator (`drive.py`) | XS + firmware | minutes | ROM/heap/Piu port reality |
