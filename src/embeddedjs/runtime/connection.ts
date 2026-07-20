// useConnection() — reactive bluetooth / phone-link state, the opt-in
// `runtime/connection` module (the React-Native `NetInfo` analog for Pebble's
// phone connection). OPT-IN & ZERO-COST: an app that never imports it never
// ships it (the manifest prunes to the import closure — README tree-shaking),
// it constructs NO host module and calls NO importNow, so it adds nothing to
// the boot floor for anyone.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/global/{global.js,pebble-global.c}):
//   * `watch` is the BARE Pebble compartment global (global.js — `class Pebble`
//     installed as `watch`, like `screen`/`Skin`). Referenced DIRECTLY — no
//     import, no importNow (contrast the sensor/battery hooks' importNow).
//   * watch.connected  (get connected() -> xs_global_connected,
//     pebble-global.c:45-54) builds a FRESH { app, pebblekit } object on EVERY
//     read, each field a boolean peek: `app` =
//     connection_service_peek_pebble_app_connection() (the phone Pebble app link
//     over bluetooth), `pebblekit` = ...peek_pebblekit_connection() (a companion
//     PebbleKit app). So a re-read ALWAYS reflects the current state.
//   * watch.addEventListener("connected", cb) / removeEventListener (global.js):
//     the callback is a ConnectedCallback — it takes NO ARGUMENT. On the FIRST
//     "connected" listener the host calls connected(true) ->
//     connection_service_subscribe (pebble-global.c:55-60); on the LAST removal
//     connected(false) -> connection_service_unsubscribe (:62-63). The native
//     handler connectionChanged() (:33-43) dispatches watch.do("connected") with
//     NO arg (xsCall1), wired for BOTH the app- and pebblekit-connection
//     handlers — so ONE event covers either channel and the callback must
//     RE-READ watch.connected to pick up both current booleans.
//
// NO SINGLETON (contrast runtime/accel's "only one" C wrapper): `watch` keeps a
// Map<event, callback[]> (global.js #events) and REFCOUNTS the native
// subscription ITSELF — first addEventListener subscribes, last remove
// unsubscribes. There is no shared-instance constraint here, so each hook call
// owns its OWN listener + signal and cleans up independently. Keeping it
// per-hook (no module-level singleton/refcount) is the minimum that is correct
// (Rule 2); N callers cost N cheap listeners over one native subscription.
//
// REACTIVITY (Rule 4): the hook owns ONE signal seeded from watch.connected. The
// host "connected" callback — which fires OUTSIDE any effect — WRITES the signal
// with a plain `.value =` (correct: no self-subscribe, exactly like accel's
// onSample). Consumers read the returned getter (`conn()`); reading it inside a
// Label binding / effect subscribes, so
// `<Label string={() => conn().app ? "on" : "off"} />` repaints on every change.
//
// SEED (Rule 4 — "where the API supports it"): unlike the accelerometer (whose
// sample() is undefined until the first callback), watch.connected is valid
// IMMEDIATELY, so the signal is seeded from a COPY of it ({ ...watch.connected }
// — self-owned, not the host's per-read object, mirroring watchinfo flattening
// firmwareVersion) and later events overwrite it.
//
// FRESH OBJECT PER FIRE: every event writes a NEW { ...watch.connected }, so the
// signal's `===` equal-write skip never fires and each event notifies — even if
// only one of the two booleans changed. Connection events are RARE (a bluetooth
// link dropping / reforming), so an occasional redundant repaint is negligible,
// and this matches the task's `set({ ...watch.connected })` and kvstore's
// "a fresh object always persists" contract. Field-diffing to suppress it would
// be speculative complexity (Rule 2).
//
// CLEANUP (Rule 5, MANDATORY): the hook registers onCleanup(() =>
// watch.removeEventListener("connected", cb)) with the SAME cb reference it
// added — removeEventListener does list.indexOf(cb) (global.js), so a different
// closure would not match, leaking the listener AND holding the native
// subscription open. It disposes with the owning render root / screen, so
// navigate-away never leaks. Hooks MUST be called inside a reactive owner (a
// render root / component body) for onCleanup to bind — render()'s build runs
// under createRoot (jsx-runtime), so calling this in the build callback is
// correct; a module-scope call would not clean up.
//
// MISSING-`watch` GUARD: the device ALWAYS provides `watch`, but a bare
// reference to an ABSENT global throws ReferenceError, so useConnection
// typeof-probes it (mirroring watchinfo / localstorage) and degrades to a stable
// "disconnected" reading — no listener, no cleanup, never a throw — on a host
// without it (Node / tests). The device never takes this branch.
import { onCleanup, signal } from "runtime/signals";

/**
 * The phone-link connection state returned by {@link useConnection} — a copy of
 * the host `watch.connected` snapshot. The two booleans are independent channels.
 */
export interface ConnectionState {
	/** True while the Pebble phone app is connected over bluetooth (the phone link). */
	app: boolean;
	/** True while a companion PebbleKit app is connected. */
	pebblekit: boolean;
}

/**
 * Reactive bluetooth / phone-link state — the RN `NetInfo` analog. Returns a
 * getter for the latest `{ app, pebblekit }`; reading it inside a Label binding /
 * effect subscribes, so the UI repaints when the connection changes.
 *
 *   const conn = useConnection();
 *   <Label string={() => (conn().app ? "Connected" : "Disconnected")} />
 *
 * Seeds immediately from `watch.connected` (a copy), then re-reads it on every
 * host "connected" event (the callback takes no argument — it re-reads both
 * booleans, since either channel may have flipped). Uses the bare `watch` global
 * directly (no importNow); the host refcounts the native subscription, so no
 * shared singleton is needed — each call owns one listener, removed via
 * onCleanup when its owner is disposed. Call inside a render root / component
 * body so onCleanup can bind (Rule 5). On a host without `watch` it degrades to
 * a constant disconnected reading and never throws.
 *
 * @returns a getter `() => { app, pebblekit }` — reactive; seeded from `watch.connected`
 */
export function useConnection(): () => ConnectionState {
	// MISSING-`watch` guard (mirrors watchinfo / localstorage): a host without the
	// bare global degrades to a stable disconnected reading — no subscription, no
	// cleanup, never a ReferenceError. The device never reaches here.
	if (typeof watch === "undefined") {
		const off: ConnectionState = { app: false, pebblekit: false };
		return () => off;
	}
	// Seed from a COPY of the host's fresh { app, pebblekit } snapshot.
	const sig = signal<ConnectionState>({ ...watch.connected });
	// The "connected" event fires with NO argument; re-read watch.connected to
	// capture BOTH current booleans (either channel may have flipped).
	const cb = (): void => {
		sig.value = { ...watch.connected };
	};
	watch.addEventListener("connected", cb);
	// Remove the SAME cb reference on teardown (indexOf match) — no leak, and the
	// host drops its native subscription once this was the last "connected" listener.
	onCleanup(() => {
		watch.removeEventListener("connected", cb);
	});
	return () => sig.value;
}
