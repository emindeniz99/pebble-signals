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
cp "src/tsx/examples/$APP.tsx" src/tsx/main.tsx
# Generate the mod manifest from the base; add image resources ONLY when the
# app uses bitmaps (Texture) — otherwise every app's archive would carry the
# ~10KB of .bm4 assets. manifest.json is build-generated (gitignored).
cp src/embeddedjs/manifest.base.json src/embeddedjs/manifest.json
if grep -q "Texture" "src/tsx/examples/$APP.tsx"; then
	python3 - <<'PY'
import json
p = "src/embeddedjs/manifest.json"; m = json.loads(open(p).read())
m["resources"] = {"*": ["../../assets/ball0", "../../assets/ball1"]}
open(p, "w").write(json.dumps(m, indent="\t") + "\n")
PY
fi
rm -rf src/embeddedjs/app src/embeddedjs/runtime-min
mkdir -p src/embeddedjs/runtime-min
for f in src/embeddedjs/runtime/*.js; do
	out="src/embeddedjs/runtime-min/$(basename "$f")"
	npx -y esbuild@0.25 "$f" --minify --format=esm --outfile="$out" \
		--log-level=error 2>/dev/null || cp "$f" "$out"
done
tsc -p tsconfig.json
for f in src/embeddedjs/app/*.js; do
	npx -y esbuild@0.25 "$f" --minify --format=esm --outfile="$f" \
		--allow-overwrite --log-level=error 2>/dev/null || true
done
pebble build
