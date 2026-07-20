// useCompass() — the reactive magnetometer, the opt-in `runtime/compass` module
// (React-Native `Magnetometer` analog). OPT-IN & ZERO-COST: an app that never
// imports it never ships it (the manifest prunes to the import closure — README
// tree-shaking), and it constructs NO host module at load time (Rule 1), so it
// adds nothing to the boot floor for anyone.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/compass/pebble-compass.{js,c}):
//   * `embedded:sensor/Compass` is a HOST-PRELOADED module (zero manifest cost)
//     reached via `importNow("embedded:sensor/Compass").default`, called INSIDE
//     the hook (Rule 1 — a preloaded module's top-level host construction freezes
//     broken). Its class (pebble-compass.js):
//       new Compass({ onSample })   // onSample fixed at construction
//       .sample()      -> { heading } | undefined   (see the SEED note)
//       .configure({ filter })       -> minimum angular change to emit (throttle)
//       .close()                     -> unsubscribes the service, frees the C record
//   * SINGLE INSTANCE: the C constructor throws `xsUnknownError("only one")`
//     (pebble-compass.c:76-77) if a second Compass is constructed while one lives.
//     So this module keeps a MODULE-LEVEL lazy singleton + refcount (plain JS vars
//     — NOT host objects, so Rule 1 holds): the first hook call constructs the one
//     instance, every later call SHARES it, and the LAST onCleanup closes it. Do
//     not also `new Compass(...)` yourself.
//   * onSample IS CALLED WITH THE INSTANCE AS `this` (pebble-compass.c:161,
//     `xsCallFunction0(onSample, pc->obj)`) — so the callback reads the fresh
//     reading with `this.sample()`, no captured-instance reference needed. The
//     constructor only `compass_service_subscribe()`s (pebble-compass.c:96-99); it
//     does NOT invoke onSample synchronously — the service calls back on later
//     heading updates, so `this` is always the live instance when it fires.
//
// REACTIVITY (Rule 4): the singleton owns ONE heading signal. The host onSample —
// which fires OUTSIDE any effect — WRITES it with a plain `.value =` (correct: no
// self-subscribe). Consumers read the returned getter (`heading()`); reading
// inside a Label binding / effect subscribes, so `<Label string={() => heading()} />`
// repaints on every sample. All callers share the SAME getter-backing signal, so N
// components cost ONE instance + ONE signal, not N.
//
// NO SEED (Rule 4 caveat — "where the API supports it"): the compass does NOT
// support an immediate seed. `sample()` returns UNDEFINED in TWO cases, both of
// which make a construction-time seed pointless — so we start the signal at 0 and
// let the first onSample fill the real heading:
//   1. onSample registered + no callback yet: sample() early-returns while the
//      `haveSample` flag is false (pebble-compass.c:132-134). onSample flips it
//      true right before firing, so `this.sample()` INSIDE onSample returns the
//      reading; a construction-time sample() (before any callback) would not.
//   2. NO MAGNETOMETER: the whole sample() body is `#if CAPABILITY_HAS_MAGNETOMETER`
//      (pebble-compass.c:128-149) — on a device without one it always returns
//      undefined (and compassData/onSample never fires either, same #if). The
//      `if (s)` guard in onSample is defensive against exactly this.
//   Guard the object, not the value: `if (s)`, never `if (s.heading)` — heading 0
//   (due north) is a valid reading and must not be dropped.
//
// UNITS / CONVENTIONS (Rule 7 — do NOT "fix" these): `heading` is DEGREES 0..360
// from magnetic north, INCREASING COUNTER-CLOCKWISE (unusual — most compass APIs
// go clockwise; this one is CCW, TRIGANGLE_TO_DEG of the raw magnetic_heading,
// pebble-compass.c:147). For a CLOCKWISE screen north-arrow, rotate by
// `360 - heading` (see examples/compass.tsx). `configure({ filter })` is the
// minimum angular change IN DEGREES before a new sample is emitted (a throttle,
// DEG_TO_TRIGANGLE'd in pebble-compass.c:119-123); default 2. It is applied ONCE,
// at construction, by the FIRST caller — later callers share the instance and its
// filter (the C sets a single global heading filter; re-configuring would fight
// other live callers). First caller wins.
//
// UNTESTED HOST (pebble-compass.c:21-23 is stamped `warning: untested`): the C
// magnetometer path has not been exercised on hardware/QEMU by Moddable. The
// wrapper contract above is verified by source reading; the integrator must
// CONFIRM the gate actually fires under QEMU (`pebble emu-compass --heading N`).
//
// CLEANUP (Rule 5, MANDATORY): each hook registers onCleanup(release); release
// decrements the refcount and, at 0, calls the one instance's close() and clears
// the singleton so the next mount builds a fresh one. Hooks MUST be called inside
// a reactive owner (a render root / component body) for onCleanup to bind —
// render()'s build runs under createRoot (jsx-runtime), so calling them in the
// build callback is correct; a module-scope call would not clean up.
import { onCleanup, signal, type Signal } from "runtime/signals";

// `importNow` is a bare compartment global on device (host/main.js wraps
// Modules.importNow) and is injected by the test sandbox; it is not in the
// runtime typing surface, so declare it module-locally (erases at emit).
declare function importNow(specifier: string): unknown;

// The host Compass instance, typed inline (Rule 1 — no import from the vendored
// .d.ts, whose sample() is typed non-optional; the C returns undefined, see the
// SEED note, so the truth is `{ heading } | undefined`).
type CompassHost = {
	sample(): { heading: number } | undefined;
	configure(o: { filter: number }): void;
	close(): void;
};

// ---- module-level lazy singleton + refcount (plain JS vars, Rule 3) ----------
// These are NOT host objects, so holding them at module scope is safe (Rule 1):
// the host Compass is built lazily INSIDE ensure(), never at load time.
let inst: CompassHost | null = null; // the one live Compass (null = none)
let refs = 0; // how many hooks currently share it
let headingSig: Signal<number> | null = null; // the shared heading signal

// Lazily build the ONE instance (idempotent — a live instance short-circuits, so
// every caller after the first just shares it). The signal is captured in a local
// so onSample writes THIS generation's signal even after a later release() nulls
// the module var. onSample reads `this.sample()` (the host passes the instance as
// `this`) and guards undefined (no magnetometer / no reading yet — see the header).
const ensure = (filter: number): void => {
	if (inst !== null) return; // already built — share it
	const sig = (headingSig = signal<number>(0));
	const Compass = (
		importNow("embedded:sensor/Compass") as { default: new (o: object) => CompassHost }
	).default;
	const c = new Compass({
		onSample(this: CompassHost): void {
			const s = this.sample();
			if (s) sig.value = s.heading; // guard the object: heading 0 (due north) is valid
		},
	});
	c.configure({ filter });
	inst = c;
};

// Drop one reference; when the last hook using the singleton is disposed, close
// the host instance and clear the singleton so a later mount rebuilds cleanly.
const release = (): void => {
	if (--refs > 0) return; // other hooks still using it — keep it alive
	inst!.close(); // last one out: unsubscribe the service, free the C record
	inst = null;
	headingSig = null;
};

/**
 * Reactive magnetometer heading — the RN `Magnetometer` analog. Returns a getter
 * for the latest heading; reading it inside a Label binding / effect subscribes,
 * so the UI repaints on every sample.
 *
 *   const heading = useCompass();               // default filter 2°
 *   <Label string={() => `${heading()}°`} />    // reactive; DEGREES, CCW
 *   const coarse = useCompass({ filter: 15 });   // emit only on >=15° changes
 *
 * The heading is DEGREES 0..360 from magnetic north, increasing COUNTER-CLOCKWISE
 * (Rule 7 — the host convention; for a CLOCKWISE screen north-arrow rotate by
 * `360 - heading()`). It starts at 0 and updates on the first sample (the host has
 * no construction-time reading — see the module header). `filter` is the minimum
 * angular change in DEGREES before a new sample is emitted (a throttle; default 2),
 * applied ONCE by whichever hook first builds the instance; later callers share
 * its filter (see the module header). All callers share ONE host Compass (the C
 * wrapper allows only one) and ONE backing signal, so N components cost one
 * instance. The instance is closed automatically when the last useCompass owner is
 * disposed — call this inside a render root / component body so onCleanup can bind
 * (Rule 5).
 *
 * @param opts optional `{ filter }` — minimum angular change in degrees to emit (default 2)
 * @returns a getter `() => number` — heading in degrees 0..360, magnetic, CCW (reactive; seeded 0)
 */
export function useCompass(opts?: { filter?: number }): () => number {
	ensure(opts?.filter ?? 2); // build-or-share BEFORE bumping refs, so a throwing build never leaks a ref
	refs++;
	const sig = headingSig!; // non-null: ensure() guarantees the signal exists
	onCleanup(release);
	return () => sig.value;
}
