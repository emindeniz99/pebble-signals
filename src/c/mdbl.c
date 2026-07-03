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
  //  - CAVEAT / re-measure (Rule 2): upstream coredevices/PebbleOS `main`
  //    (src/fw/applib/moddable/moddable.c) DOES honor stack/slot/chunk — it
  //    maps them onto xsCreation (stackCount/initialHeapCount/initialChunkSize),
  //    all-or-nothing. So a NEWER firmware than our 4.17 emulator may allow a
  //    LARGER arena than 32KB from here — a potential heap unlock. Retest when
  //    the SDK updates; the "ignored" result above is specific to 4.17.
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
