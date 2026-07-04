#include <pebble_worker.h>

// Background-worker experiment: a heartbeat that proves the worker RUNS even
// with the app closed. Ticks once per second, logs, and persists the count
// (persist storage is SHARED between app and worker — the "KV" observable).
#define KEY_BEATS 42

static int s_beats = 0;

static void tick_handler(struct tm *tick_time, TimeUnits changed) {
  s_beats++;
  persist_write_int(KEY_BEATS, s_beats);
  if (s_beats % 5 == 0) {
    APP_LOG(APP_LOG_LEVEL_INFO, "worker heartbeat %d", s_beats);
  }
}

int main(void) {
  s_beats = persist_exists(KEY_BEATS) ? persist_read_int(KEY_BEATS) : 0;
  APP_LOG(APP_LOG_LEVEL_INFO, "worker started at beat %d", s_beats);
  tick_timer_service_subscribe(SECOND_UNIT, tick_handler);
  worker_event_loop();
}
