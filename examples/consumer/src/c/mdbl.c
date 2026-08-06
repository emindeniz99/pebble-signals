#include <pebble.h>

// Minimal Moddable bootstrap for a pebble-signals app: create the XS machine with
// the measured 4.17 sizes (all three must be nonzero or the record is
// rejected). Instrumentation flag streams slot/chunk/stack into `pebble logs`.
int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  ModdableCreationRecord cr = {.recordSize = sizeof(cr),
                               .stack = 6144,
                               .slot = 8192,
                               .chunk = 8192,
                               .flags = kModdableCreationFlagLogInstrumentation};
  moddable_createMachine(&cr);

  window_destroy(w);
}
