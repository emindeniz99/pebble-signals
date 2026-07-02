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
# app uses bitmaps — otherwise every app's archive would carry the .bm4
# assets. The resource list is DERIVED from the app's own `new Texture("x.png")`
# references (each mapped to assets/x), so an app bundles exactly the bitmaps
# it names and nothing else. manifest.json is build-generated (gitignored).
cp src/embeddedjs/manifest.base.json src/embeddedjs/manifest.json
APP_SRC="src/tsx/examples/$APP.tsx" python3 - <<'PY'
import json, os, re
names = re.findall(r'new\s+Texture\(\s*["\']([^"\']+?)(?:\.png)?["\']',
                   open(os.environ["APP_SRC"]).read())
if names:
	seen, res = set(), []
	for n in names:
		if n not in seen:
			seen.add(n); res.append("../../assets/" + n)
	p = "src/embeddedjs/manifest.json"; m = json.loads(open(p).read())
	m["resources"] = {"*": res}
	open(p, "w").write(json.dumps(m, indent="\t") + "\n")
PY
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
