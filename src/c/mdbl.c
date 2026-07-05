#include <pebble.h>

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  // Pass a ModdableCreationRecord to turn on XS instrumentation logging
  // (slot/chunk/stack usage streams into `pebble logs` once per second).
  // All memory numbers reported for this project come from those logs.
  //
  // Measured findings on SDK 4.17 firmware (gabbro/emery emulators):
  //  - stack/slot/chunk must ALL be nonzero or the record is rejected with
  //    "moddable.c:79 invalid ModdableCreationRecord" and no machine starts.
  //  - On THIS 4.17 firmware the size fields had NO measured effect: the arena
  //    read the same (chunk 8192 initial, ~8176B slots, 6144B stack, 32KB
  //    static total) whether we passed slot=16K/chunk=16K or 32K/32K. The 4.17
  //    machine appears cloned from the firmware's built-in creation config
  //    ("static": 32768); only .flags took effect.
  //  - RE-TESTED 2026-07 with the STRONGEST probe (prompted by the official
  //    piu/apps/words example, which ships .stack=5120 .slot=31744 .chunk=19456
  //    for emery): set THOSE exact numbers here (mdbl.c IS compiled — verified
  //    build/src/c/mdbl.c.17.o via arm-none-eabi-gcc) AND added the matching
  //    manifest `config.creation` block, then booted emery. Machine BYTE-
  //    IDENTICAL to default: StackAvail stayed 6144 (not 5120), SlotAvail 19440
  //    unchanged. Stack does not grow, so StackAvail directly reflects the
  //    creation .stack — 6144 proves the field is ignored, via BOTH the C call
  //    and the manifest. §1 confirmed, not overturned.
  //  - SOURCE vs BINARY (Rule 2, 2026-07 — honest, partly unresolved): the
  //    CURRENT PebbleOS source (both `main` AND the `v4.17.0` tag) HONORS the
  //    record — creation.stackCount = stack/16, initialHeapCount = slot/16,
  //    initialChunkSize = chunk; and if (stack+slot+chunk) EXCEEDS staticSize it
  //    sets staticSize = 0 → XS mallocs a machine LARGER than the 32KB static
  //    arena. BUT our shipped emery_sdk_debug.elf is odd: its version string is
  //    "v4.17.0" and its __moddable_createMachine DOES load cr->stack/slot/chunk
  //    (disasm ldr [r6,#4]/[#8]/[#12]), yet the machine still comes out DEFAULT
  //    (measured: StackAvail 6144≠5120 AND SlotAvail-initial 8176≠31744 on the
  //    real words build). It also lacks main's "evaluating creation record" log.
  //    Per coredevices/pebble-tool, the SDK core is a "patched version 4.3" — so
  //    the QEMU firmware likely isn't a clean v4.17.0 build, which may explain
  //    the mismatch. NOT fully reconciled. What's CERTAIN (measured): on THIS
  //    emulator the sizes are a no-op. What's OPEN: whether a current firmware /
  //    real device honors them live (untested — no newer QEMU image was
  //    obtainable). So the 32KB wall + 384-slot stack are the operative limit on
  //    our emulator; a current-firmware build MAY lift them (words' numbers
  //    numbers target exactly this). Retest when the SDK emulator updates.
  //    Other configurables on `main`: .flags (the two below only — Instrument +
  //    Debug, and both are no-ops without a BT log listener) and .fxBuildFFI
  //    (custom native bindings). Sizes below match the measured 4.17 config.
  ModdableCreationRecord cr = {.recordSize = sizeof(cr),
                               .stack = 6144,
                               .slot = 8192,
                               .chunk = 8192,
                               .flags = kModdableCreationFlagLogInstrumentation
#ifdef PBL_DEBUG
                                        | kModdableCreationFlagDebug
#endif
  };
  moddable_createMachine(&cr);

  window_destroy(w);
}
