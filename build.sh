#!/bin/sh
# Transpile JSX (src/tsx -> src/embeddedjs/app), minify the runtime into
# src/embeddedjs/runtime-min (the manifest ships THAT copy — the mod
# archive has a hard ~15.9KB startup ceiling, README gotcha 15, and
# minifying module-scope identifiers buys back ~370B of it), then run the
# Pebble build. Requires tsc >= 5.5 on PATH (for --noCheck); no npm
# runtime dependencies. If esbuild is unavailable the runtime ships
# unminified — correctness is identical either way.
set -e
cd "$(dirname "$0")"
# APP=<name> builds src/tsx/examples/<name>.tsx as the app (default: list,
# the shipping demo). One example = one standalone app — several prebuilt
# reactive screens in ONE mod exceed the 32KB arena at boot (README, M11).
APP="${APP:-list}"
# NOTE: we no longer copy the entry to main.tsx — that displaced an example's
# relative imports and broke MULTI-FILE apps. Instead tsc compiles every
# example in place and esbuild --bundle stitches the chosen entry (with its
# local ./imports) into app/main.js below, runtime/* left external.
# Generate the mod manifest from the base; add image resources ONLY when the
# app uses bitmaps — otherwise every app's archive would carry the .bm4
# assets. The resource list is DERIVED from the app's own `new Texture("x.png")`
# references (each mapped to assets/x), so an app bundles exactly the bitmaps
# it names and nothing else. manifest.json is build-generated (gitignored).
cp src/embeddedjs/manifest.base.json src/embeddedjs/manifest.json
APP_SRC="src/tsx/examples/$APP.tsx" python3 - <<'PY'
import json, os, re
src = open(os.environ["APP_SRC"]).read()
p = "src/embeddedjs/manifest.json"; m = json.loads(open(p).read())
changed = False
# bitmaps: derive resources from `new Texture("x.png")` (png2bmp pipeline)
tex = re.findall(r'new\s+Texture\(\s*["\']([^"\']+?)(?:\.png)?["\']', src)
if tex:
	seen, res = set(), []
	for n in tex:
		if n not in seen:
			seen.add(n); res.append("../../assets/" + n)
	m["resources"] = {"*": res}; changed = True
# vector: bundle any referenced `*.pdc` file verbatim as `data`, read on the
# watch via `new Resource("x.pdc")` (SVGImage path route).
pdc = re.findall(r'["\']([^"\']+?\.pdc)["\']', src)
if pdc:
	seen, data = set(), []
	for n in pdc:
		if n not in seen:
			seen.add(n); data.append("../../assets/" + n)
	m["data"] = {"*": data}; changed = True
if changed:
	open(p, "w").write(json.dumps(m, indent="\t") + "\n")
PY
# Per-app runtime tree-shaking. The runtime modules are frozen into ROM by
# `preload`, and every preloaded module still costs a few XS aliases at boot.
# An app that never imports runtime/flow (a pure-signal watchface) does not
# need it preloaded OR mapped — prune the manifest to the transitive closure of
# the runtime modules the app actually imports. Verified by the on-boot install:
# a pruned app that still boots proves the drop was safe (the dropped module was
# genuinely unreferenced).
#
# DEFAULT ON (TREESHAKE=1), best-practice self-disabling: if the app pulls a
# runtime module INDIRECTLY — via a dynamic `import()`/`importNow()` the static
# scan can't resolve — pruning could drop a module that IS reached at runtime,
# so we SKIP pruning and say why (a silent over-prune would boot-crash). Set
# TREESHAKE=0 to force the full runtime; TREESHAKE=1 (explicit) to override the
# self-disable and prune anyway.
TREESHAKE="${TREESHAKE:-1}"
# Self-disable: a default run backs off when it sees a dynamic import() the
# static import scan can't follow — pruning could drop a module reached at
# runtime, which boot-crashes. TREESHAKE_FORCE=1 prunes anyway.
if [ "$TREESHAKE" = "1" ] && grep -Eq 'import(Now)?\s*\(' "src/tsx/examples/$APP.tsx" 2>/dev/null && [ "${TREESHAKE_FORCE:-0}" != "1" ]; then
	echo "treeshake: SKIPPED — $APP.tsx uses a dynamic import() the static scan can't follow;" >&2
	echo "           pruning could drop a runtime module reached at runtime. TREESHAKE_FORCE=1 to override." >&2
	TREESHAKE=0
fi
if [ "$TREESHAKE" = "1" ]; then
	APP_SRC="src/tsx/examples/$APP.tsx" python3 - <<'PY'
import json, os, re
src = open(os.environ["APP_SRC"]).read()
p = "src/embeddedjs/manifest.json"; m = json.loads(open(p).read())
# runtime dependency graph (intra-runtime imports)
deps = {
	"runtime/signals": set(),
	"runtime/jsx-runtime": {"runtime/signals"},
	"runtime/flow": {"runtime/signals", "runtime/jsx-runtime"},
}
seed = set(re.findall(r'from\s+["\'](runtime/[a-zA-Z0-9_-]+)["\']', src))
need, stack = set(), list(seed)
while stack:
	mod = stack.pop()
	if mod in need or mod not in deps:
		continue
	need.add(mod)
	stack.extend(deps[mod])
keep = {"main"} | need
before = set(m.get("modules", {}))
m["modules"] = {k: v for k, v in m["modules"].items() if k in keep}
m["preload"] = [x for x in m.get("preload", []) if x in need]
open(p, "w").write(json.dumps(m, indent="\t") + "\n")
dropped = sorted(before - keep)
print("treeshake: kept " + ",".join(sorted(need)) + ("; dropped " + ",".join(dropped) if dropped else "; nothing to drop"))
PY
fi
# Font sanity check (gotcha 20): an invalid font string renders NOTHING —
# blank text, no error, hours lost. Validate every `font:` literal in the app
# source against the Pebble system-font table at COMPILE time and fail loud.
# Escape hatch for custom/new fonts: SKIP_FONTCHECK=1.
if [ "${SKIP_FONTCHECK:-0}" != "1" ]; then
	APP_SRC="src/tsx/examples/$APP.tsx" python3 - <<'PY'
import os, re, sys
src = open(os.environ["APP_SRC"]).read()
# Pebble system fonts reachable via piu "['bold '][N]px Family" strings.
# (family, size, bold?) — from the official FONT_KEY_* table.
VALID = set()
for n in (14, 18, 24, 28):
	VALID.add(("gothic", n, False)); VALID.add(("gothic", n, True))
VALID |= {("bitham", 30, True), ("bitham", 42, True), ("bitham", 42, False),
	("roboto", 21, False), ("roboto", 49, True), ("droid", 28, True)}
bad = []
for m in re.finditer(r'font:\s*["\'](?:(bold)\s+)?(\d+)px\s+([A-Za-z]+)["\']', src):
	bold, size, fam = m.group(1) is not None, int(m.group(2)), m.group(3).lower()
	if (fam, size, bold) not in VALID:
		bad.append(m.group(0))
if bad:
	print("FONTCHECK FAIL (gotcha 20 — invalid font renders BLANK, no error):", file=sys.stderr)
	for b in bad:
		print("  " + b + "  <- not a Pebble system font key", file=sys.stderr)
	print("  valid: [bold] 14|18|24|28px Gothic, bold 30px Bitham, [bold] 42px Bitham,", file=sys.stderr)
	print("         21px Roboto, bold 49px Roboto, bold 28px Droid  (SKIP_FONTCHECK=1 to override)", file=sys.stderr)
	sys.exit(1)
PY
fi
# Minify (DCE + identifier mangling) is DEFAULT ON — it buys back ~370B of the
# ~15.9KB startup ceiling (gotcha 15) and dead-code-eliminates unused runtime
# branches. MINIFY=0 ships readable modules for debugging (correctness is
# identical either way — the runtime is behavior-equivalent minified or not).
# Self-disabling: if esbuild is missing or errors, each file falls back to a
# verbatim copy rather than failing the build.
MINIFY="${MINIFY:-1}"
rm -rf src/embeddedjs/app src/embeddedjs/runtime-min
mkdir -p src/embeddedjs/runtime-min
for f in src/embeddedjs/runtime/*.js; do
	out="src/embeddedjs/runtime-min/$(basename "$f")"
	if [ "$MINIFY" = "1" ]; then
		npx -y esbuild@0.25 "$f" --minify --format=esm --outfile="$out" \
			--log-level=error 2>/dev/null || cp "$f" "$out"
	else
		cp "$f" "$out"
	fi
done
tsc -p tsconfig.json
# Bundle the chosen entry into ONE app/main.js — this is what makes MULTI-FILE
# apps work: the entry's local imports (./foo, ./widgets/bar) are inlined so
# the manifest only needs to map `main`, while `runtime/*` is left EXTERNAL so
# those modules stay preloaded (frozen in flash/ROM, ~free) instead of being
# pulled into main (the heap). Single-file apps bundle to themselves (no-op).
#
# BUNDLE STRATEGY (developer choice):
#   BUNDLE=all      (default) — inline the app's own submodules into main.js.
#                   main.js loads into the 32KB heap at boot; app code counts
#                   against the arena. Simplest; every submodule is live/reactive.
#   BUNDLE=preload  — for apps with a large STATIC shared submodule (a widget
#                   library reused across screens): leave it a separate module,
#                   map+preload it into ROM like the runtime. See the multilazy
#                   example for the device-verified realization of this strategy
#                   (lazy importNow of a preloaded screen). Eager auto-preload of
#                   arbitrary app submodules is UNVERIFIED on this XS build
#                   (emulator-blocked, Rule 2) — build.sh prints a pointer rather
#                   than silently shipping an unmeasured path.
BUNDLE="${BUNDLE:-all}"
if [ "$BUNDLE" = "preload" ]; then
	echo "bundle: 'preload' strategy — see src/tsx/examples/multilazy.tsx (device-verified" >&2
	echo "        lazy-import of a preloaded screen). Falling back to BUNDLE=all for this build." >&2
fi
# --tree-shaking=true is explicit (DCE unreferenced app exports/branches during
# the bundle) even without --minify, so BUNDLE stays lean when MINIFY=0.
npx -y esbuild@0.25 "src/embeddedjs/app/examples/$APP.js" --bundle \
	--external:'runtime/*' --format=esm --tree-shaking=true \
	--outfile=src/embeddedjs/app/main.js \
	--allow-overwrite --log-level=error
# Stage-2/3 lowering on the bundled entry: rewrite `useState`/`signal`/
# `computed` + call sites to the packed API (S.sig/get/set/put/computed) so the
# per-state closures and the Signal object never exist at runtime. AST-based
# (TypeScript compiler API): every rewrite is decided on the resolved binding
# SYMBOL, so shadowing / aliasing are correct by construction and only genuine
# call sites change; anything ambiguous bails to the object API. A prod run
# re-lowers its own output and refuses to write if it is not a fixed point.
# Guarded by `node tools/lower.mjs --selftest`.
node tools/lower.mjs src/embeddedjs/app/main.js
if [ "$MINIFY" = "1" ]; then
	npx -y esbuild@0.25 src/embeddedjs/app/main.js --minify --format=esm \
		--outfile=src/embeddedjs/app/main.js --allow-overwrite --log-level=error 2>/dev/null || true
fi
pebble build
