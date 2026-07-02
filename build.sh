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
