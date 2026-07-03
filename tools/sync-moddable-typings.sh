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
# Piu base + Pebble ambient globals + the internal deps they /// -reference or
# import (MC.d.ts references ../easing.d.ts and imports commodetto/Poco).
FILES="piu/MC.d.ts piu/MC-types.d.ts pebble/global.d.ts pebble/piu.d.ts \
       pebble/poco.d.ts commodetto/Poco.d.ts commodetto/Bitmap.d.ts easing.d.ts"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "Fetching @moddable/typings@${VERSION} ..."
tarball="$(npm pack "@moddable/typings@${VERSION}" --pack-destination "$tmp" 2>/dev/null | tail -1)"
tar xzf "$tmp/$tarball" -C "$tmp"       # -> $tmp/package/
mkdir -p "$DEST"
for f in $FILES; do
	if [ -f "$tmp/package/$f" ]; then
		mkdir -p "$DEST/$(dirname "$f")"; cp "$tmp/package/$f" "$DEST/$f"; echo "  vendored $f"
	else
		echo "  WARN: $f not in tarball (layout changed?)" >&2
	fi
done
echo "$VERSION" > "$DEST/.version"
echo "Done -> $DEST (pinned $VERSION)"
