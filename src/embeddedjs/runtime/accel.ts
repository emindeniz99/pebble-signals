// useAccel() + useTap() — the reactive accelerometer, the opt-in `runtime/accel`
// module (React-Native `Accelerometer` analog). OPT-IN & ZERO-COST: an app that
// never imports it never ships it (the manifest prunes to the import closure —
// README tree-shaking), and it constructs NO host module at load time (Rule 1),
// so it adds nothing to the boot floor for anyone.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/accelerometer/pebble-accelerometer.{js,c}):
//   * `embedded:sensor/Accelerometer` is a HOST-PRELOADED module (zero manifest
//     cost) reached via `importNow("embedded:sensor/Accelerometer").default`,
//     called INSIDE the hook (Rule 1 — a preloaded module's top-level host
//     construction freezes broken). Its class:
//       new Accelerometer({ onSample, onTap, onDoubleTap })  // all callbacks
//       .sample()      -> { x, y, z }   RAW milli-g (see UNITS)
//       .configure({ hz })              -> maps to 10/25/50/100 Hz sampling rate
//       .close()                        -> unsubscribes every service, frees the C record
//   * SINGLE INSTANCE: the C constructor throws `xsUnknownError("only one")`
//     (pebble-accelerometer.c:83-84) if a second Accelerometer is constructed
//     while one lives. So this module keeps a MODULE-LEVEL lazy singleton +
//     refcount (plain JS vars — NOT host objects, so Rule 1 holds): the first
//     hook call constructs the one instance, every later call SHARES it, and the
//     LAST onCleanup closes it. Do not also `new Accelerometer(...)` yourself.
//   * CALLBACKS ARE FIXED AT CONSTRUCTION: builtinGetCallback reads onSample /
//     onTap / onDoubleTap once, in the constructor (pebble-accelerometer.c:86-88)
//     — there is NO way to add a callback to a live instance. Because useAccel
//     and useTap must SHARE the one instance ("only one"), the singleton wires
//     BOTH onSample (feeds the x/y/z signal) AND onTap (feeds the tap signal) at
//     construction, whichever hook builds it first. An accel-only app therefore
//     also has the tap service subscribed — a negligible cost, and the only
//     shape the single-instance rule permits.
//
// REACTIVITY (Rule 4): the singleton owns ONE x/y/z signal and ONE tap signal.
// The host callbacks — which fire OUTSIDE any effect — WRITE those signals with
// a plain `.value =` (correct: no self-subscribe). Consumers read the returned
// getter (`accel()` / `tap()`); reading inside a Label binding / effect
// subscribes, so `<Label string={() => accel().x} />` repaints fine-grained on
// every sample. All callers of useAccel share the SAME getter-backing signal, so
// N components cost ONE instance + ONE signal, not N.
//
// SEED (Rule 4 caveat — "where the API supports it"): the accel API does NOT
// support an immediate seed. With onSample registered, host sample() returns
// UNDEFINED until the first callback fires (the `haveSample` gate,
// pebble-accelerometer.c:158-160): accelerometerData() sets haveSample=true
// right before invoking onSample, and sample() clears it on read. So calling
// sample() at construction (before any data) would seed `undefined` and break
// the {x,y,z} contract. We therefore seed {x:0,y:0,z:0} and let the first
// onSample fill real values. Consumers must read the SIGNAL, never call the host
// sample() directly (a second call before the next tick returns undefined).
//
// UNITS / CONVENTIONS (Rule 7 — do not "fix" these): sample() is RAW AccelData
// in milli-g (~+/-4000; 1000 ~= 1g; the C leaves the "//@@ convert to M^2" TODO
// unimplemented, pebble-accelerometer.c:169). Tap directions are AXIS-FIRST
// strings — 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-' — built as [axis][sign] in
// doTap() (pebble-accelerometer.c:201-203). NOTE the vendored
// types/moddable/pebble/accelerometer.d.ts types them SIGN-FIRST ("+x") — that
// typing is WRONG against the C source; this module's {@link TapDirection} is the
// truth. Double-tap is NOT exposed: useTap reports single taps only (the RN tap
// analog); onDoubleTap is left unregistered (adding it would be a second signal
// + export, unrequested — Rule 2).
//
// HZ: `configure({ hz })` sets the ONE global sampling rate and is applied ONCE,
// at construction, by the FIRST caller (default 25). Later callers SHARE the
// instance and its rate — a second useAccel({ hz: 50 }) after the instance
// already exists does not re-rate it (the C wrapper has a single global rate;
// re-configuring would fight other live callers). First caller wins.
//
// CLEANUP (Rule 5, MANDATORY): each hook registers onCleanup(release); release
// decrements the refcount and, at 0, calls the one instance's close() and clears
// the singleton so the next mount builds a fresh one. Hooks MUST be called
// inside a reactive owner (a render root / component body) for onCleanup to bind
// — render()'s build runs under createRoot (jsx-runtime), so calling them in the
// build callback is correct; a module-scope call would not clean up.
import { onCleanup, signal, type Signal } from "runtime/signals";

// `importNow` is a bare compartment global on device (host/main.js wraps
// Modules.importNow) and is injected by the test sandbox; it is not in the
// runtime typing surface, so declare it module-locally (erases at emit).
declare function importNow(specifier: string): unknown;

/**
 * A single-tap direction reported by {@link useTap} — AXIS-FIRST `[axis][sign]`
 * exactly as the host builds it (pebble-accelerometer.c doTap()). NOTE this is
 * the OPPOSITE order from the vendored `accelerometer.d.ts` ("+x"), which is
 * wrong against the C source; this type is the on-device truth.
 */
export type TapDirection = "x+" | "x-" | "y+" | "y-" | "z+" | "z-";

/**
 * One accelerometer reading — RAW milli-g on each axis (~+/-4000; 1000 ~= 1g).
 * What {@link useAccel}'s getter returns. Not converted to m/s^2 (the host
 * leaves that TODO unimplemented — Rule 7).
 */
export interface AccelSample {
	/** Left/right axis, raw milli-g. */
	x: number;
	/** Up/down axis, raw milli-g. */
	y: number;
	/** Front/back (through-screen) axis, raw milli-g. */
	z: number;
}

// The host Accelerometer instance, typed inline (Rule 1 — no import from the
// vendored .d.ts, whose TapDirection is wrong anyway).
type AccelHost = {
	sample(): AccelSample;
	configure(o: { hz?: number }): void;
	close(): void;
};

// ---- module-level lazy singleton + refcount (plain JS vars, Rule 3) ----------
// These are NOT host objects, so holding them at module scope is safe (Rule 1):
// the host Accelerometer is built lazily INSIDE ensure(), never at load time.
let inst: AccelHost | null = null; // the one live Accelerometer (null = none)
let refs = 0; // how many hooks (accel + tap) currently share it
let accelSig: Signal<AccelSample> | null = null; // the shared x/y/z signal
let tapSig: Signal<TapDirection | undefined> | null = null; // the shared tap signal

// Lazily build the ONE instance (idempotent — a live instance short-circuits, so
// every caller after the first just shares it). Wires BOTH onSample and onTap at
// construction (callbacks are fixed then; see the header) and sets the sampling
// rate once. The signals are captured in locals so each generation's callbacks
// write THEIR signal even after a later release() nulls the module vars.
const ensure = (hz: number): void => {
	if (inst !== null) return; // already built — share it
	const aSig = (accelSig = signal<AccelSample>({ x: 0, y: 0, z: 0 }));
	const tSig = (tapSig = signal<TapDirection | undefined>(undefined));
	const Accel = (
		importNow("embedded:sensor/Accelerometer") as { default: new (o: object) => AccelHost }
	).default;
	const a = new Accel({
		// onSample fires with the instance as `this` and haveSample already true,
		// so this.sample() returns fresh {x,y,z} (never undefined here — the header
		// seed caveat is only about calling sample() BEFORE the first callback).
		onSample(this: AccelHost): void {
			aSig.value = this.sample();
		},
		// onTap fires with the AXIS-FIRST direction string as its argument.
		onTap(dir: TapDirection): void {
			tSig.value = dir;
		},
	});
	a.configure({ hz });
	inst = a;
};

// Drop one reference; when the last hook using the singleton is disposed, close
// the host instance and clear the singleton so a later mount rebuilds cleanly.
const release = (): void => {
	if (--refs > 0) return; // other hooks still using it — keep it alive
	inst!.close(); // last one out: unsubscribe every service, free the C record
	inst = null;
	accelSig = null;
	tapSig = null;
};

/**
 * Reactive accelerometer — the RN `Accelerometer` analog. Returns a getter for
 * the latest reading; reading it inside a Label binding / effect subscribes, so
 * the UI repaints fine-grained on every sample.
 *
 *   const accel = useAccel();                 // default 25 Hz
 *   <Label string={() => `x ${accel().x}`} /> // reactive; RAW milli-g
 *   const fast = useAccel({ hz: 100 });        // 100 Hz sampling
 *
 * All callers share ONE host Accelerometer (the C wrapper allows only one) and
 * ONE backing signal, so N components cost one instance. `hz` (10|25|50|100,
 * default 25) is applied ONCE by whichever hook first builds the instance;
 * later callers share its rate (see the module header). The instance is closed
 * automatically when the last useAccel/useTap owner is disposed — call this
 * inside a render root / component body so onCleanup can bind (Rule 5).
 *
 * @param opts optional `{ hz }` sampling rate — 10, 25, 50 or 100 Hz (default 25)
 * @returns a getter `() => { x, y, z }` of RAW milli-g values (reactive; seeded {0,0,0})
 */
export function useAccel(opts?: { hz?: 10 | 25 | 50 | 100 }): () => AccelSample {
	ensure(opts?.hz ?? 25); // build-or-share BEFORE bumping refs, so a throwing build never leaks a ref
	refs++;
	const sig = accelSig!; // non-null: ensure() guarantees the signal exists
	onCleanup(release);
	return () => sig.value;
}

/**
 * Reactive single-tap direction — a signal of the LAST tap the wearer produced
 * (a flick of the wrist / a tap on the case). Returns a getter that is
 * `undefined` until the first tap, then the AXIS-FIRST direction string.
 *
 *   const tap = useTap();
 *   <Label string={() => tap() ?? "tap me"} />  // "x+", "z-", ...
 *
 * Shares the SAME single Accelerometer as {@link useAccel} (the "only one" C
 * rule), building it at default 25 Hz if it is the first hook to run. Single tap
 * only — double-tap is deliberately not exposed (see the module header). Auto
 * cleaned up when the last accel/tap owner is disposed; call inside a render
 * root / component body (Rule 5).
 *
 * @returns a getter `() => TapDirection | undefined` — the last tap, reactive
 */
export function useTap(): () => TapDirection | undefined {
	ensure(25); // shares an existing instance, or builds one at the default rate
	refs++;
	const sig = tapSig!; // non-null: ensure() guarantees the signal exists
	onCleanup(release);
	return () => sig.value;
}
