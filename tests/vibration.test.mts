// vibration suite — runtime/vibration (opt-in useHaptics; the RN Vibration analog).
// Proves: the hook resolves the host pebble/vibes class via importNow (never at
// module scope); short/long/double/pattern/cancel map onto the right static
// methods; pattern forwards its segment array verbatim; and cancel() fires
// AUTOMATICALLY when the owning root is disposed (so a long buzz never bleeds into
// the next screen) as well as on manual call. The vm sandbox has NO importNow, so
// — exactly as accel.test injects it — we inject sandbox.importNow returning a
// recording Vibes stub as `.default`, BEFORE loadModule, the way the C host does.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot } = signals;

// Record every static call so the mapping is assertable. A single shared log
// keyed by method name + the pattern arg captured on the last pattern() call.
const calls: string[] = [];
let lastPattern: number[] | null = null;
class VibesStub {
	static shortPulse() {
		calls.push("short");
	}
	static longPulse() {
		calls.push("long");
	}
	static doublePulse() {
		calls.push("double");
	}
	static pattern(segments: number[]) {
		calls.push("pattern");
		lastPattern = segments;
	}
	static cancel() {
		calls.push("cancel");
	}
}
// Inject BEFORE loadModule (the accel.test idiom): the hook calls importNow inside
// its body, so this free global resolves against the sandbox at call time. Return
// the stub CLASS as `.default`, exactly as the host pebble/vibes module does.
let lastSpec = "";
sandbox.importNow = (spec: string) => {
	lastSpec = spec;
	return { default: VibesStub };
};
const { useHaptics } = await loadModule("runtime/vibration");
const { check, done } = makeChecker("vibration");

// --- resolution + method mapping --------------------------------------------------
{
	const [h, dispose] = createRoot(() => useHaptics());
	check("useHaptics resolved the pebble/vibes host module", lastSpec === "pebble/vibes");
	h.short();
	check("short() calls Vibes.shortPulse", calls[calls.length - 1] === "short");
	h.long();
	check("long() calls Vibes.longPulse", calls[calls.length - 1] === "long");
	h.double();
	check("double() calls Vibes.doublePulse", calls[calls.length - 1] === "double");
	h.pattern([100, 50, 100]);
	check("pattern() calls Vibes.pattern", calls[calls.length - 1] === "pattern");
	check(
		"pattern() forwards its segment array verbatim",
		lastPattern !== null && lastPattern.length === 3 && lastPattern[1] === 50,
	);
	h.cancel();
	check("manual cancel() calls Vibes.cancel", calls[calls.length - 1] === "cancel");
	// disposing the owner cancels ITS OWN in-flight buzz automatically (Rule 5)
	h.long();
	calls.length = 0;
	dispose();
	check("disposing the owner auto-cancels the motor", calls.length === 1 && calls[0] === "cancel");
}

// --- two live owners: disposing one must NOT kill the other's pattern ---
// The motor is a single global device, so an unconditional Vibes.cancel() in
// every owner's cleanup let a disappearing conditional child abruptly silence
// a long alert its still-mounted parent had started (codex P2).
{
	const [, disposeA] = createRoot(() => useHaptics());
	const [b, disposeB] = createRoot(() => useHaptics());
	b.long(); // B owns the pattern that is actually playing
	calls.length = 0;
	disposeA();
	check("disposing an IDLE owner leaves the other owner's pattern alone", calls.length === 0);
	disposeB();
	check(
		"disposing the owner that STARTED the pattern still cancels",
		calls.length === 1 && calls[0] === "cancel",
	);
}

done();
