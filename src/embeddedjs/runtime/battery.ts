// useBattery() — the reactive battery gauge, the opt-in `runtime/battery` module
// (the sibling of runtime/accel + runtime/compass; the RN `expo-battery` analog).
// OPT-IN & ZERO-COST: an app that never imports it never ships it (the manifest
// prunes to the import closure — README tree-shaking), and it constructs NO host
// module at load time (Rule 1), so it adds nothing to the boot floor for anyone.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/battery/pebble-battery.{js,c}):
//   * `embedded:sensor/Battery` is a HOST-PRELOADED module (zero manifest cost)
//     reached via `importNow("embedded:sensor/Battery").default`, called INSIDE
//     the hook (Rule 1 — a preloaded module's top-level host construction freezes
//     broken). GOTCHA: the specifier is `embedded:sensor/Battery`, NOT
//     `pebble/battery` — the vendored type-folder name misleads; it lives in the
//     same `embedded:sensor/*` namespace as Accelerometer/Compass. Its class
//     (pebble-battery.js):
//       new Battery({ onSample })            // onSample fixed at construction
//       .sample()  -> { percent, charging, plugged }   // 0..100; see the GATE note
//       .configure(options) {}               // a NO-OP on device — we never call it
//       .close()                             // unsubscribe the service, free the C record
//   * SINGLE INSTANCE: the C constructor throws `xsUnknownError("only one")`
//     (pebble-battery.c:73-74, guarding getModdableAppState(battery)) if a second
//     Battery is constructed while one lives. So this module keeps a MODULE-LEVEL
//     lazy singleton + refcount (plain JS vars — NOT host objects, so Rule 1
//     holds): the first hook call constructs the one instance, every later call
//     SHARES it, and the LAST onCleanup closes it. Do not also `new Battery(...)`.
//   * onSample IS CALLED WITH THE INSTANCE AS `this` (pebble-battery.c:147,
//     `xsCallFunction0(onSample, pb->obj)`) — so the callback reads the fresh
//     reading with `this.sample()`, no captured-instance reference needed (this is
//     equivalent to the task's `set(b.sample())`, since `this === b` when the host
//     fires it; `this.sample()` matches the accel/compass house style).
//
// SEED — battery DOES support an immediate seed (the DIFFERENCE from accel +
// compass, whose sample() is undefined until the first callback). When onSample is
// registered the constructor sets `haveSample = true` and seeds
// `pb->sample = battery_state_service_peek()` synchronously (pebble-battery.c:93-97)
// — so calling `sample()` RIGHT AFTER construction returns a REAL reading. We seed
// the signal with `b.sample()` at build time (Rule 4 — "seed where the API supports
// it"): the getter is never a placeholder by the time useBattery returns, even if
// onSample never fires again (a slow-changing battery often won't for a while).
//
// ONE-SHOT GATE (why consumers must read the SIGNAL, never the host sample()):
// with onSample registered, `sample()` returns UNDEFINED when `!haveSample` and
// otherwise CONSUMES the reading (`haveSample = false`, pebble-battery.c:117-122).
// Each fresh reading arms haveSample exactly once — the constructor's peek arms the
// SEED read, and each batteryData()/onSample arms that callback's read
// (pebble-battery.c:142-143). Our TWO call sites (the seed, and `this.sample()`
// inside onSample) each consume their own armed reading, so NEITHER ever sees
// undefined — but a consumer that called the host sample() directly BETWEEN
// callbacks would get undefined. Read the getter (the signal), not the host.
//
// REACTIVITY (Rule 4): the singleton owns ONE {percent,charging,plugged} signal.
// The host onSample — which fires OUTSIDE any effect — WRITES it with a plain
// `.value =` (correct: no self-subscribe). Consumers read the returned getter
// (`battery()`); reading inside a Label binding / effect subscribes, so
// `<Label string={() => battery().percent + "%"} />` repaints on every battery
// event. All callers share the SAME getter-backing signal, so N components cost
// ONE instance + ONE signal, not N. (Each host sample() is a FRESH object, so
// Object.is never suppresses a notify — every event repaints; battery events are
// rare, so no dedupe is warranted — Rule 2.)
//
// UNITS / CONVENTIONS (Rule 7 — do NOT "fix" these): `percent` is 0..100
// (charge_percent — an integer, NOT a 0..1 fraction), `charging` is is_charging,
// `plugged` is is_plugged (pebble-battery.c:127-133). `configure()` is an empty
// no-op on device (pebble-battery.js:25) — there is no sampling rate to set, so we
// never call it (Rule 2), and useBattery takes no options (unlike useAccel's `hz` /
// useCompass's `filter`).
//
// CLEANUP (Rule 5, MANDATORY): the hook registers onCleanup(release); release
// decrements the refcount and, at 0, calls the one instance's close() and clears
// the singleton so the next mount builds a fresh one. Hooks MUST be called inside
// a reactive owner (a render root / component body) for onCleanup to bind —
// render()'s build runs under createRoot (jsx-runtime), so calling useBattery in
// the build callback is correct; a module-scope call would not clean up.
import { onCleanup, signal, type Signal } from "runtime/signals";

// `importNow` is a bare compartment global on device (host/main.js wraps
// Modules.importNow) and is injected by the test sandbox; it is not in the
// runtime typing surface, so declare it module-locally (erases at emit).
declare function importNow(specifier: string): unknown;

/**
 * One battery reading — what {@link useBattery}'s getter returns. `percent` is
 * 0..100 (Rule 7 — the host's integer charge_percent, not a 0..1 fraction).
 */
export interface BatterySample {
	/** Charge level, 0..100 (integer percent — the host's charge_percent). */
	percent: number;
	/** True while the battery is actively charging. */
	charging: boolean;
	/** True while external power is connected (can be true with `charging` false when full). */
	plugged: boolean;
}

// The host Battery instance, typed inline (Rule 1 — no import from the vendored
// .d.ts). configure() is omitted deliberately: it is a device no-op and we never
// call it (see the header).
type BatteryHost = {
	sample(): BatterySample;
	close(): void;
};

// ---- module-level lazy singleton + refcount (plain JS vars, Rule 3) ----------
// These are NOT host objects, so holding them at module scope is safe (Rule 1):
// the host Battery is built lazily INSIDE ensure(), never at load time.
let inst: BatteryHost | null = null; // the one live Battery (null = none)
let refs = 0; // how many useBattery hooks currently share it
let batterySig: Signal<BatterySample> | null = null; // the shared reading signal

// Lazily build the ONE instance (idempotent — a live instance short-circuits, so
// every caller after the first just shares it). The signal is captured in a local
// so onSample writes THIS generation's signal even after a later release() nulls
// the module var. onSample reads `this.sample()` (the host passes the instance as
// `this`, pebble-battery.c:147) — never undefined there (batteryData arms
// haveSample right before firing). SEEDED immediately via `b.sample()` (the host
// arms haveSample + peek() at construction — see the header's SEED note); this
// seed line is the ONLY structural difference from the accel/compass siblings,
// which cannot probe until their first callback.
const ensure = (): void => {
	if (inst !== null) return; // already built — share it
	const sig = (batterySig = signal<BatterySample>({ percent: 0, charging: false, plugged: false }));
	const Battery = (
		importNow("embedded:sensor/Battery") as { default: new (o: object) => BatteryHost }
	).default;
	const b = new Battery({
		onSample(this: BatteryHost): void {
			sig.value = this.sample();
		},
	});
	sig.value = b.sample(); // immediate seed — a REAL reading (haveSample armed at construction)
	inst = b;
};

// Drop one reference; when the last hook using the singleton is disposed, close
// the host instance and clear the singleton so a later mount rebuilds cleanly.
const release = (): void => {
	if (--refs > 0) return; // other hooks still using it — keep it alive
	inst!.close(); // last one out: unsubscribe the service, free the C record
	inst = null;
	batterySig = null;
};

/**
 * Reactive battery state — a getter for the latest `{ percent, charging, plugged }`;
 * reading it inside a Label binding / effect subscribes, so the UI repaints on
 * every battery event.
 *
 *   const battery = useBattery();
 *   <Label string={() => `${battery().percent}%`} />                    // reactive
 *   <Label string={() => (battery().charging ? "charging" : "")} />
 *
 * `percent` is 0..100 (Rule 7). The getter is SEEDED with a real reading at
 * construction (the battery host supports an immediate probe — unlike the
 * accel/compass hooks), so the first paint shows the true charge, not a
 * placeholder. All callers share ONE host Battery (the C wrapper allows only one)
 * and ONE backing signal, so N components cost one instance. The instance is
 * closed automatically when the last useBattery owner is disposed — call this
 * inside a render root / component body so onCleanup can bind (Rule 5).
 *
 * @returns a getter `() => { percent, charging, plugged }` — reactive; seeded from the host at construction
 */
export function useBattery(): () => BatterySample {
	ensure(); // build-or-share BEFORE bumping refs, so a throwing build never leaks a ref
	refs++;
	const sig = batterySig!; // non-null: ensure() guarantees the signal exists
	onCleanup(release);
	return () => sig.value;
}
