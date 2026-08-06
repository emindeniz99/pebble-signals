#include <pebble.h>

// Stock 2-screen Pebble C watchapp — the "found it on the internet, wrote a
// classic counter + detail view" starting point for the pebble-signals migration
// story (see docs/migration.md). Two screens, two windows, the classic
// Pebble window-stack navigation pattern: SELECT on the counter pushes a
// detail window, BACK pops it (default WindowStack behavior — no handler
// needed). This is exactly what examples/migration/integrated/ ports to
// pebble-signals's <Navigator> push/pop.

// ---- screen 1: counter -----------------------------------------------------
static Window *s_window;
static TextLayer *s_count_layer;
static int s_count = 0;

// ---- screen 2: detail ------------------------------------------------------
static Window *s_detail_window;
static TextLayer *s_detail_title_layer;
static TextLayer *s_detail_count_layer;
static char s_detail_count_buf[16];

static void prv_update_count_text(void) {
  static char s_count_buf[16];
  snprintf(s_count_buf, sizeof(s_count_buf), "Count: %d", s_count);
  text_layer_set_text(s_count_layer, s_count_buf);
}

static void prv_detail_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_detail_title_layer = text_layer_create(GRect(0, 52, bounds.size.w, 30));
  text_layer_set_text(s_detail_title_layer, "Details");
  text_layer_set_text_alignment(s_detail_title_layer, GTextAlignmentCenter);
  text_layer_set_font(s_detail_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  layer_add_child(window_layer, text_layer_get_layer(s_detail_title_layer));

  snprintf(s_detail_count_buf, sizeof(s_detail_count_buf), "Count: %d", s_count);
  s_detail_count_layer = text_layer_create(GRect(0, 92, bounds.size.w, 20));
  text_layer_set_text(s_detail_count_layer, s_detail_count_buf);
  text_layer_set_text_alignment(s_detail_count_layer, GTextAlignmentCenter);
  layer_add_child(window_layer, text_layer_get_layer(s_detail_count_layer));
}

static void prv_detail_window_unload(Window *window) {
  text_layer_destroy(s_detail_title_layer);
  text_layer_destroy(s_detail_count_layer);
}

static void prv_select_click_handler(ClickRecognizerRef recognizer, void *context) {
  // Push the detail screen. BACK pops it — WindowStack's default behavior,
  // no click config needed on the detail window.
  window_stack_push(s_detail_window, true /* animated */);
}

static void prv_up_click_handler(ClickRecognizerRef recognizer, void *context) {
  s_count++;
  prv_update_count_text();
}

static void prv_down_click_handler(ClickRecognizerRef recognizer, void *context) {
  s_count--;
  prv_update_count_text();
}

static void prv_click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_select_click_handler);
  window_single_click_subscribe(BUTTON_ID_UP, prv_up_click_handler);
  window_single_click_subscribe(BUTTON_ID_DOWN, prv_down_click_handler);
}

static void prv_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_count_layer = text_layer_create(GRect(0, 72, bounds.size.w, 20));
  text_layer_set_text_alignment(s_count_layer, GTextAlignmentCenter);
  layer_add_child(window_layer, text_layer_get_layer(s_count_layer));
  prv_update_count_text();
}

static void prv_window_unload(Window *window) {
  text_layer_destroy(s_count_layer);
}

static void prv_init(void) {
  s_detail_window = window_create();
  window_set_window_handlers(s_detail_window, (WindowHandlers) {
    .load = prv_detail_window_load,
    .unload = prv_detail_window_unload,
  });

  s_window = window_create();
  window_set_click_config_provider(s_window, prv_click_config_provider);
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  const bool animated = true;
  window_stack_push(s_window, animated);
}

static void prv_deinit(void) {
  window_destroy(s_detail_window);
  window_destroy(s_window);
}

int main(void) {
  prv_init();

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p", s_window);

  app_event_loop();
  prv_deinit();
}
