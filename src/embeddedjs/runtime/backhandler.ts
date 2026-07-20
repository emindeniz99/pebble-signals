// useBackHandler — route the Back button to an in-app action: the opt-in
// `runtime/backhandler` module (React Native `BackHandler` analog). OPT-IN &
// ZERO-COST: an app that never imports it never ships it (the manifest prunes to
// the import closure — README tree-shaking), so it costs non-users nothing.
//
// WHAT (Rule 2 — no new substrate): a tiny adapter over the jsx-runtime
// `onPressBack` button event. It returns a handler BAG `{ onPressBack }` to SPREAD
// on a FOCUSED node; on each Back press the node's behavior invokes it, and its
// return value decides whether Back is CONSUMED (stay in app — e.g. pop a
// Navigator screen) or bubbles (the firmware's default: leave the app). The
// canonical use is a nested Navigator: pop when there's depth, exit at the root.
//
// THE CONSUME CONTRACT (jsx-runtime HandlerBehavior): the generated onPressBack
// delegate returns `handler(content) !== false` — truthy consumes, `false`
// bubbles. To match RN's BackHandler exactly (return TRUE to prevent default,
// anything else allows it) this module normalizes with `=== true`: ONLY an
// explicit `true` from the caller's handler consumes Back; `false`/`undefined`
// let it exit. The handler is read on EVERY press, so it may consult live state
// (nav.canPop()).
//
// HONEST DEVICE CAVEAT (Rule 2): consuming `onPressBack` is proven to stop Piu's
// internal event bubbling; whether it also prevents the FIRMWARE app-exit (vs the
// window manager exiting regardless) is UNVERIFIED under QEMU. The in-app pop /
// intercept is the build-now, screenshot-verifiable core. A GUARANTEED exit
// override would need pebble/button's window_set_overrides_back_button
// (device-gated — see docs/components.md "device-gated"). Do not claim
// exit-prevention as proven.
//
// NO STATE, NO MODULE SCOPE: the hook owns no signal, node or timer — it just
// closes over the caller's handler — so there is nothing to clean up and the one
// export is a `function` declaration.

/** The handler-bag {@link useBackHandler} returns — spread it on a focused node. */
export interface BackHandlerBag {
	/** The Back-button handler for the focused node (returns truthy to consume Back). */
	onPressBack: () => boolean;
}

/**
 * useBackHandler(handler) — intercept the Back button: the RN `BackHandler`
 * analog. Returns a bag to SPREAD on a FOCUSED node; `handler` runs on each Back
 * press and returns `true` to CONSUME it (stay in the app) or `false` to let Back
 * do its default (leave the app / bubble).
 *
 *   <Container focus {...useBackHandler(() => {
 *     if (nav.canPop()) { nav.pop(); return true; }  // consumed — pop instead of exit
 *     return false;                                   // at root — allow exit
 *   })}>…</Container>
 *
 * Matches RN semantics: ONLY an explicit `true` consumes Back; `false`/`undefined`
 * allow the default. The handler is read on every press so it can consult live
 * state. See the module header for the honest device caveat (in-app intercept is
 * proven; firmware exit-prevention is not).
 *
 * @param handler called on each Back press; return `true` to consume, else allow exit
 * @returns a {@link BackHandlerBag} to spread on a focusable node
 */
export function useBackHandler(handler: () => boolean): BackHandlerBag {
	// `=== true` normalizes to RN semantics through the HandlerBehavior `!== false`
	// delegate: only an explicit true consumes; false/undefined let Back exit.
	return { onPressBack: () => handler() === true };
}
