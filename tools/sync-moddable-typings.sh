#!/usr/bin/env sh
# Vendor a pinned subset of @moddable/typings into types/moddable/. These are
# Moddable's OWN Piu/Pebble TypeScript declarations (the real host-class types),
# so we reference them instead of hand-writing `declare const Label: any`.
#
# Re-run after bumping VERSION to track the SDK (the typings version follows the
# Moddable SDK, which follows the Pebble firmware/SDK). Requires: npm, tar.
# The package's package.json `types` field is broken (an array), so there is no
# auto-resolution — tsconfig.check.json lists the vendored .d.ts in `include`.
set -eu
VERSION="8.2.3"                         # <-- pin; bump to update
DEST="$(dirname "$0")/../types/moddable"
# We vendor the WHOLE Pebble/Piu-relevant surface (not a subset) so every host
# API — sensors, dictation, storage, transitions, image/font decode — is typed
# and ready without a second sync. DIRS are copied wholesale; TOP are loose
# top-level files. We skip only the clearly-irrelevant microcontroller ports
# (esp/esp32/etc. live in other dirs and aren't pulled in).
DIRS="pebble embedded piu commodetto"
TOP="easing.d.ts"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "Fetching @moddable/typings@${VERSION} ..."
tarball="$(npm pack "@moddable/typings@${VERSION}" --pack-destination "$tmp" 2>/dev/null | tail -1)"
tar xzf "$tmp/$tarball" -C "$tmp"       # -> $tmp/package/
mkdir -p "$DEST"
n=0
for d in $DIRS; do
	if [ -d "$tmp/package/$d" ]; then
		mkdir -p "$DEST/$d"
		# copy every .d.ts under the directory, preserving sub-paths
		( cd "$tmp/package/$d" && find . -name '*.d.ts' -print ) | while IFS= read -r f; do
			mkdir -p "$DEST/$d/$(dirname "$f")"; cp "$tmp/package/$d/$f" "$DEST/$d/$f"
		done
		c="$(find "$tmp/package/$d" -name '*.d.ts' | wc -l | tr -d ' ')"
		echo "  vendored $d/ ($c files)"; n=$((n + c))
	else
		echo "  WARN: dir $d not in tarball (layout changed?)" >&2
	fi
done
for f in $TOP; do
	[ -f "$tmp/package/$f" ] && { cp "$tmp/package/$f" "$DEST/$f"; echo "  vendored $f"; n=$((n + 1)); }
done
echo "$VERSION" > "$DEST/.version"
echo "Done -> $DEST (pinned $VERSION, $n files)"
