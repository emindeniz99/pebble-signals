#!/bin/sh
# Recover a wedged QEMU Pebble emulator.
#
# Symptom: `pebble install --emulator <p>` starts hanging or returns
# "App install failed" / TimeoutError, and /tmp/pb-emulator.json shows an
# empty platform entry (`{"emery": {}}`) or a dead pid. Fresh boots then
# freeze at the firmware progress bar.
#
# ROOT CAUSE (measured, this environment): it is NOT the SPI flash alone —
# the whole per-platform PERSIST dir (app_cache / localstorage /
# timeline.db, alongside qemu_spi_flash.bin) gets corrupted and freezes
# first boot. Removing just the flash is not enough; the entire persist
# dir must go. `pebble` re-extracts a pristine one on next install.
#
# Usage: tools/reset-emulator.sh [platform]   (default: emery; "all" = both)
# Then: pebble install --emulator <platform>  (first attempt after a cold
# boot may still fail once — just run it again).
set -e
PLAT="${1:-emery}"
SDK="$HOME/.local/share/pebble-sdk/4.17"

# 1. hard-kill every emulator process (SIGKILL — they ignore TERM when hung)
pkill -9 -f 'qemu-pebble' 2>/dev/null || true
pkill -9 -f 'pypkjs'      2>/dev/null || true
sleep 2

# 2. wipe ALL emulator state
if [ "$PLAT" = "all" ]; then
	rm -rf "$SDK/emery" "$SDK/gabbro"
else
	rm -rf "$SDK/$PLAT"
fi
rm -f /tmp/pb-emulator.json
rm -rf /tmp/signal-piu-drive /tmp/signal-piu-memtest.ppm

echo "reset-emulator: killed all emulators, wiped state for '$PLAT'."
echo "  next: pebble install --emulator ${PLAT%all}  (retry once if the first"
echo "        cold-boot install fails; pkill -9 -f '[p]ypkjs' before driving)"
