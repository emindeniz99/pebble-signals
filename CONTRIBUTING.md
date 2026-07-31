# Contributing to signal-piu

> **Status: pre-1.0 (`0.1.0`), QEMU-verified, single maintainer.** Everything
> here is measured on the SDK 4.17 **QEMU emulators** — gabbro (Pebble Round 2,
> round 260×260) and emery (Pebble Time 2, rect 200×228). There are no hardware
> receipts yet. APIs can still move before 1.0, review is one person (so
> latency is days, not hours), and **nothing gets deleted without a relabel
> first** — a PR that removes a public name is a PR that gets a "deprecate it
> instead" comment.

Thanks for being here. This page is the whole contribution surface: how to get
the repo running, what a claim has to carry before it lands, and the gates your
PR meets before it is reviewed. The library-level "why" lives in the
[README](README.md) and the [handbook](docs/handbook.md); this is the process.

## Where this lives

signal-piu is one project inside the `emindeniz99/playground` monorepo, at
`projects/signal-piu/`. It is a **standalone pnpm workspace** — you install and
run everything from this directory, not the repo root. Issues and PRs go to the
monorepo tracker: <https://github.com/emindeniz99/playground/issues>. Templates
that ask for the right receipts are staged in
[`.github-templates/ISSUE_TEMPLATE/`](.github-templates/ISSUE_TEMPLATE/README.md)
— read that dir's README for why they are not live yet.

## Dev setup

```sh
git clone https://github.com/emindeniz99/playground
cd playground/projects/signal-piu
pnpm install
pnpm run verify                   # SDK-free gates — the ones your PR must pass
```

`pnpm install` and `pnpm run verify` need **Node ≥ 24 and pnpm ≥ 11** and
nothing else. Everything that touches a watch — `dev`, `smoke:device`,
`test:mem` — additionally needs the **Pebble tool v5 + SDK 4.17** with its QEMU
emulators; install steps are in [getting started](docs/getting-started.md). You
can contribute real work with no SDK at all: the runtime is unit-tested under
Node, and the maintainer runs the device gates before merge.

With the SDK, the inner loop is one command:

```sh
pnpm run dev -- --app watchface   # build + install + live logs
pnpm run dev -- --app pulse --watch
```

**Success looks like** the gabbro emulator showing the face while the terminal
streams `instruments:` heartbeats about once a second. Zero heartbeats is a
**dead log transport, not a quiet app** — that distinction has eaten whole
debugging days; see [debugging](docs/debugging.md) before you chase it.

### The verify chain

| Command | What it gates | Needs |
|---|---|---|
| `pnpm run typecheck` | four tsconfigs — the JSX prop contracts, the runtime build, `tools/`, and the phone-side `pkjs/` | — |
| `pnpm run coverage` | the Node suites at **100 % lines / branches / functions** | — |
| `pnpm run test:consumer` | `npm pack` → install the tarball → typecheck a real consumer project | — |
| **`pnpm run verify`** | **the three above — the bar for every PR** | — |
| `pnpm run check` | biome lint + format check (tabs; `pnpm run format` writes) | — |
| `pnpm run test:xs` | the XS conformance laws on the real engine | `xst` ([setup](docs/xst-setup.md)) |
| `pnpm run verify:full` | `verify` + `test:xs` | `xst` |
| `pnpm run smoke:device` | the 15-app on-emulator catalog | SDK + emulator |

Run `pnpm run verify` before you push. `pnpm run test` is the faster inner loop
(same suites, no coverage thresholds) while you iterate.

## Rule 2 — measured numbers or it didn't happen

This is the house rule the project is actually built on
([`CLAUDE.md`](CLAUDE.md) Rule 2), and it applies to contributors, not just to
agents: **every claim about memory, size or on-device behavior comes with the
measurement that produced it, and says where it came from.**

A receipt is:

- an `instruments:` log line (slot/chunk used + avail, stack peak) captured
  around a foreground install — that is where every arena number in the docs
  comes from;
- a count you can re-run — `stat -c%s build/mods/gabbro/mc.xsa` for the
  archive, `python3 tools/xsa-symbols.py build/mods/gabbro/mc.xsa` for the boot
  symbols, and the before/after A/B that shows what your change cost;
- a framebuffer capture you **read**, not size-checked. `pebble screenshot` or
  `python3 tools/drive.py gabbro d:shot`. An empty-home frame, a stale frame
  from the previous app, and the `render() threw` crash screen all pass
  "is the PNG bigger than 800 bytes?".

A receipt is **not**: "should be fine", "roughly", a number from a previous
round quoted without re-measuring after the code changed, or a green Node suite
standing in for a device claim. The Node suites prove the library is correct;
they cannot prove an app still boots, because the three fixed budgets only
exist on the firmware.

The other half of Rule 2 is **corrections are loud**. When a measurement
overturns something the docs assert, fix the doc in the same PR and say it was
overturned — the handbook's corrections (the fetch reversal, the SVGImage saga)
are kept visible on purpose. Silently editing a number to match a new result
destroys the only thing that makes the rest of them trustworthy.

Same rule in the negative direction: if you skipped a gate, say so in the PR.
"Tests pass" is wrong if any were skipped (Rule 12). A PR that says
"typecheck + coverage green, no device run — I have no SDK" is a good PR. One
that implies a device run that did not happen is the one thing that wastes
everyone's time twice.

## The coverage bar — 100 %

```sh
pnpm run coverage
```

Node's own test runner, thresholds `--test-coverage-lines=100
--test-coverage-branches=100 --test-coverage-functions=100`, scoped to the
compiled runtime (`src/embeddedjs/runtime-build/**`). It is not a stretch goal;
it is the merge bar for runtime code, and it is at 100 % today (2,153 tests,
`all files 100.00 | 100.00 | 100.00`). If your branch drops it, the per-file
table in the failure output says where — but the uncovered line is usually a
real branch you did not think about, so write the test rather than reaching for
`/* node:coverage disable */`. That escape hatch is used exactly twice in the
repo, both in `tools/`, both wrapping the `import.meta.main` CLI shim that
cannot run in-process under the test runner — and both carrying a comment
saying so, next to a test that SPAWNS the file to cover it anyway.

Two honest notes on the shape of the gate:

- **Tool code is outside the coverage include.** `tools/**` is exercised by
  `tests/tools.test.mts` but its percentage is not enforced. New tool code
  still needs a test — the gate just will not catch you.
- **Tests must encode WHY, not only WHAT.** A test that cannot fail when the
  business rule changes is not coverage, it is decoration. The suites here open
  with a comment saying which real failure they pin; match that — the reader
  six months from now needs to know what breaks if they "simplify" your code.

## Device work — use the recipes, do not rediscover them

Every emulator failure mode you are about to hit has already been paid for
once, in hours. Before touching QEMU, read
[`CLAUDE.md`](CLAUDE.md) **Rule 3** (log capture in ONE shell invocation, the
reset script, the qemu-monitor screendump bypass, the ≥ 32 s cold-boot wait)
and [device smokes](docs/device-smokes.md) (the 15-app catalog, what a PASS
does and does not prove, and the manual recipe the runner encodes).

The three that bite first:

1. **`pebble logs` printing nothing does not mean the app is silent.** Attach
   the capture and install in the same shell invocation, in the foreground.
2. **The screenshot transport rots within a session** (~4–8 installs), and a
   reset does not clear it. Reset-per-app, or bypass it with the qemu monitor —
   `tools/drive.py` already does.
3. **A wedged emulator gets `tools/reset-emulator.sh <platform>`**, once, then
   one retry. Do not chase it with flash-only deletes.

Two constraints that produce silent, error-free wrongness on device, so check
them before blaming the runtime:

- **Fonts must name a real system face at that exact size AND weight**, or the
  label renders nothing at all — no error (handbook gotcha 20;
  `tools/fontcheck.mts` rejects the known-bad strings at build time). Verified
  strings for examples: `18px Gothic`, `bold 24px Gothic`, `bold 28px Gothic`,
  `bold 42px Bitham`.
- **Position/size props are static.** A reactive `left`/`top`/`width` is
  rejected at bind time; reposition by swapping the node (gotcha 22).

## Adding a runtime module

The catalog is **opt-in and zero-cost**: an app that never imports a module
pays zero boot symbols, zero arena bytes, zero archive size for it. That
property is enforced by per-app tree-shaking, and it only holds if new code
lands in a **new** `runtime/<name>.ts` module rather than in the always-shipped
core (`runtime/signals`, `runtime/jsx-runtime`, `runtime/flow`). Adding to core
charges every app on the platform, forever — expect that to be the whole
review.

A new module needs, in the same PR:

1. `src/embeddedjs/runtime/<name>.ts` — the module itself.
2. A line in `src/embeddedjs/manifest.base.json`
   (`"runtime/<name>": "./runtime-min/<name>"`) so the device build can resolve
   it, and a line in `typedoc.json` `entryPoints` so `pnpm run docs` documents
   it. Both files are hand-maintained lists; a module missing from either is
   the classic "works in Node, missing on the watch" PR.
3. `tests/<name>.test.mts` carrying it to 100 %.
4. A row in [`docs/components.md`](docs/components.md) and a device receipt —
   the catalog's claim is that every entry is verified on both shapes, and that
   claim is only as good as its weakest row.

Remember the budgets while you design (they are the design —
[XS heap playbook](docs/xs-heap-playbook.md)): **26,624 B usable arena**,
**~150 boot symbols**, a **384-slot value stack**. Trade CPU for RAM freely:
recompute instead of caching, bytes instead of objects, indices instead of
references.

## Commit conventions

Conventional Commits, **scope mandatory** — the monorepo rules in the root
[`CLAUDE.md`](../../CLAUDE.md) and [`CONVENTIONS.md`](../../CONVENTIONS.md)
apply here verbatim. For this project the scope is **`signal-piu`**, optionally
with a sub-area:

```
feat(signal-piu): add useBattery hook as an opt-in runtime module
fix(signal-piu): defer Navigator's initial swap onto onDisplaying
docs(signal-piu): correct the arena ceiling after the D4 re-measure
chore(repo): …                 # root-level files, not this project
```

The hard parts, restated because they are the ones that get bounced:

- **Never `feat: …` without a scope.** Imperative mood, lowercase first letter,
  no trailing period, header ≤ 72 chars.
- **One commit per project.** A diff that touches `projects/signal-piu/` and
  another project gets split into two commits — never one.
- Write a body when the *why* is not in the diff: the constraint, the
  measurement, the obvious approach you rejected and what it cost.
- Breaking changes get `!` after the scope **and** a `BREAKING CHANGE:` footer
  with the migration.
- Add a `Co-Authored-By:` trailer for the AI assistant if one helped.

[`CHANGELOG.md`](CHANGELOG.md) is hand-maintained here (Keep a Changelog, and
no release automation runs on this project yet): user-visible changes get a
bullet under `## [Unreleased]`, and anything that touches a scaffold-owned file
a consumer project owns — `wscript`, `src/c/`, the tsconfigs, the manifest —
gets a line in that release's **Upgrading** subsection too. It is the one file
that conflicts on every parallel branch, so if you would rather leave it to the
maintainer, put your entry in the PR description and say so.

## Pull requests

- **Small and scoped.** Every changed line should trace to the thing you set
  out to do. Do not reformat, rename, or "improve" adjacent code on the way
  past — matching the existing style beats improving it, even when you are
  right (root `CLAUDE.md` Rule 3 / Rule 11).
- **Nothing gets deleted.** Renaming, deprecating and relabelling are fine;
  removing a public name is a maintainer decision, not a PR one. If you find
  dead code, say so in the PR — leave it in place.
- **State what you ran.** Paste the `verify` result. If you ran the device
  gates, attach the receipts; if you could not, say which ones you skipped and
  why.
- **New behavior comes with a test that would fail without it.**
- Expect review latency measured in days, not hours. One maintainer.

## Reporting issues

Use the staged templates in
[`.github-templates/ISSUE_TEMPLATE/`](.github-templates/ISSUE_TEMPLATE/README.md)
as a checklist and file at
<https://github.com/emindeniz99/playground/issues>. A device bug is
unactionable without: **which platform** (gabbro / emery, SDK version), the
**four budgets context** (the `instruments:` line, `mc.xsa` size, symbol count,
stack peak — whichever you have), and a **screenshot receipt**. The crash
screen is a legitimate receipt: the default `render()` error boundary paints
escaped errors on the watch itself, and `pebble screenshot` captures it.

Security-sensitive reports go through the monorepo's
[`SECURITY.md`](../../SECURITY.md) instead of the public tracker.

## Code of Conduct

Participation is subject to the monorepo
[Code of Conduct](../../CODE_OF_CONDUCT.md). Be kind, be patient, assume good
faith — and bring receipts.
