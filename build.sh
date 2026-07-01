#!/bin/sh
# Transpile JSX (src/tsx -> src/embeddedjs/app) then run the Pebble build.
# Requires tsc >= 5.5 on PATH (for --noCheck); no npm runtime dependencies.
set -e
cd "$(dirname "$0")"
rm -rf src/embeddedjs/app
tsc -p tsconfig.json
pebble build
