// useHaptics() — the reactive vibration motor, the opt-in `runtime/vibration`
// module (React-Native `Vibration` + react-pebble `useVibration` analog). The
// single biggest missing OUTPUT channel on a watch. OPT-IN & ZERO-COST: an app
// that never imports it never ships it (the manifest prunes to the import
// closure — README tree-shaking), and it constructs NO host module at load time
// (Rule 1), so it adds nothing to the boot floor for anyone.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/vibes/{manifest.json,vibes.js}):
//   * `pebble/vibes` is a HOST-PRELOADED module (zero manifest cost) reached via
//     `importNow("pebble/vibes").default` — a class of ALL-STATIC methods, no
//     instance to construct or free: shortPulse(), longPulse(), doublePulse(),
//     pattern([durationsMs]), cancel(). (vibes.js maps each to an `xs_vibes_*`
//     native.) Because there is no host object, there is no singleton/refcount to
//     keep (unlike accel.ts) — every method just resolves Vibes lazily and calls
//     the static. Resolve INSIDE the hook (Rule 1 — a preloaded module's
//     top-level host access freezes broken).
//   * pattern() takes ALTERNATING on/off millisecond segments — [100, 50, 100] is
//     buzz 100ms, pause 50ms, buzz 100ms (the RN vibration-pattern convention).
//
// CLEANUP (Rule 5): the hook registers onCleanup(cancel) so a screen torn down
// mid-buzz (navigate-away during a long pattern) stops the motor rather than
// leaving it running under the next screen. cancel() is also returned for manual
// use. Call the hook inside a render root / component body so onCleanup binds.
//
// NO REACTIVITY, NO MODULE SCOPE: haptics is a pure OUTPUT — there is no signal
// to read, so the hook returns a small command object, not a getter. Vibes is
// resolved per-call at runtime (Rule 5 / gotcha 13); the one export is a
// `function` declaration exactly like accel.ts's useAccel.
import { onCleanup } from "runtime/signals";

// `importNow` is a bare compartment global on device (host/main.js wraps
// Modules.importNow) and is injected by the test sandbox; it is not in the
// runtime typing surface, so declare it module-locally (erases at emit).
declare function importNow(specifier: string): unknown;

// The host Vibes class, typed inline (Rule 1 — all-static, no instance).
type VibesHost = {
	shortPulse(): void;
	longPulse(): void;
	doublePulse(): void;
	pattern(segments: number[]): void;
	cancel(): void;
};

/** The command surface {@link useHaptics} returns — fire-and-forget motor pulses. */
export interface Haptics {
	/** A short buzz (Vibes.shortPulse) — the default confirmation tap. */
	short(): void;
	/** A long buzz (Vibes.longPulse) — an alert / attention pulse. */
	long(): void;
	/** Two quick buzzes (Vibes.doublePulse) — a distinct secondary signal. */
	double(): void;
	/**
	 * A custom pattern of ALTERNATING on/off millisecond segments — `[100,50,100]`
	 * is buzz 100 / pause 50 / buzz 100 (the RN vibration-pattern convention).
	 */
	pattern(segments: number[]): void;
	/** Cancel any in-flight vibration (also fired automatically on owner dispose). */
	cancel(): void;
}

/**
 * useHaptics() — fire the vibration motor: the RN `Vibration` / react-pebble
 * `useVibration` analog. Returns a small command object; call its methods from an
 * event handler or effect (never module scope).
 *
 *   const h = useHaptics();
 *   <Button label="OK" onPress={() => { doSave(); h.short(); }} />
 *   h.pattern([100, 50, 100]);   // buzz-pause-buzz
 *
 * Resolves the host `pebble/vibes` class lazily (Rule 1 — no load-time host
 * access) and maps short/long/double/pattern/cancel onto its static methods.
 * There is no instance to share or free (unlike the accelerometer), so calling
 * this in N components is N cheap resolves, no singleton. The motor is cancelled
 * automatically when the owning screen is disposed (onCleanup) so a long pattern
 * never bleeds into the next screen — call inside a render root / component body
 * so that binds (Rule 5). NOTE: the physical buzz is not observable on QEMU (no
 * motor / no `pebble emu-vibe`) — the JS surface is device-buildable, the buzz is
 * felt only on real hardware.
 *
 * @returns a {@link Haptics} command object (short/long/double/pattern/cancel)
 */
export function useHaptics(): Haptics {
	// Resolve the all-static host class once per hook call (Rule 1 — lazy, never
	// module scope). No instance is constructed, so there is nothing to refcount.
	const Vibes = (importNow("pebble/vibes") as { default: VibesHost }).default;
	// Stop the motor if the screen is torn down mid-buzz (Rule 5) — and hand the
	// same cancel back for manual use.
	onCleanup(() => Vibes.cancel());
	return {
		short: () => Vibes.shortPulse(),
		long: () => Vibes.longPulse(),
		double: () => Vibes.doublePulse(),
		pattern: (segments: number[]) => Vibes.pattern(segments),
		cancel: () => Vibes.cancel(),
	};
}
