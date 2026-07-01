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
  //  - The size fields are then IGNORED: instrumentation reports the same
  //    arena (chunk 8192 initial, ~8176B slots, 6144B stack, 32KB static
  //    total) for slot=16K/chunk=16K and slot=32K/chunk=32K alike. The JS
  //    machine is cloned from the firmware's built-in creation config
  //    ("static": 32768 in the Moddable pebble device manifest); only
  //    .flags takes effect. The values below match that real config.
  ModdableCreationRecord cr = {
    .recordSize = sizeof(cr),
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
