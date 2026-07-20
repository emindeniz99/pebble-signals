// battery suite — runtime/battery (opt-in reactive battery gauge, host-backed).
// Proves: useBattery lazily constructs exactly ONE host Battery via
// importNow("embedded:sensor/Battery") (NOT "pebble/battery"), SEEDS its getter
// immediately from the host sample() at construction (the battery host arms
// haveSample + peek() in its constructor — unlike accel/compass, whose sample()
// is undefined pre-callback), and updates reactively (a subscribing effect
// re-runs) when onSample fires with a fresh {percent,charging,plugged}; TWO
// useBattery calls SHARE the one instance + one signal (constructor runs once,
// both getters see the sample); the refcount keeps the instance alive while any
// owner survives and close()s it only when the LAST owner is disposed; and after
// full teardown a fresh call rebuilds a NEW instance (refs returned to 0). Every
// branch — ensure build vs share, release keep vs close, the onSample callback,
// the seed, the getter — is covered for 100% line/branch/function coverage.
//
// The vm sandbox has NO `importNow` and NO Battery, so — exactly as tabs.test
// injects Style/Skin and accel.test injects importNow BEFORE loadModule — we
// inject sandbox.importNow to return a StubBattery class. StubBattery stores the
// onSample callback the hook hands its constructor and FIRES it (with `this` =
// the instance, as batteryData does), seeds a DISTINCTIVE construction-time
// reading so the immediate seed is provably distinct from the hook's
// {0,false,false} placeholder, and records close() + the requested specifier.
// battery is callback-driven (no setInterval), so no tick()/liveTimers() are
// needed; each block disposes its root(s) so the module-level singleton returns
// to refs=0 and the next block starts from a clean (unconstructed) state.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();

// StubBattery: the host Battery stand-in. Records every construction (count +
// identity via `built`), close(), and the specifier importNow was asked for;
// seeds a distinctive reading at construction (the host peeks in its constructor)
// and fires the stored onSample the way the C host does. It does NOT model the
// one-shot haveSample gate: the hook calls sample() exactly once per fresh reading
// (seed at construction, then once inside each onSample), so a plain sample() that
// returns the current state is faithful to the hook's real call pattern — and the
// stub has NO configure(), enforcing that the hook never calls the device no-op.
const built: StubBattery[] = []; // every instance ever constructed (delta = ctor count)
let lastSpec = ""; // the importNow specifier the module requested
class StubBattery {
	opts: { onSample?: () => void };
	closed: boolean;
	_state: { percent: number; charging: boolean; plugged: boolean };
	constructor(opts: { onSample?: () => void }) {
		this.opts = opts;
		this.closed = false;
		// Distinctive from the hook's {0,false,false} placeholder in ALL THREE
		// fields, so asserting the seeded getter proves it read sample() at
		// construction (mirrors the host arming haveSample + peek() in its ctor).
		this._state = { percent: 88, charging: true, plugged: true };
		built.push(this);
	}
	sample() {
		return this._state;
	}
	close() {
		this.closed = true;
	}
	// Drive a device battery event: set the reading, then invoke onSample with
	// `this` = the instance (batteryData sets haveSample then
	// xsCallFunction0(onSample, obj) — pebble-battery.c:142-148).
	fireSample(s: { percent: number; charging: boolean; plugged: boolean }) {
		this._state = s;
		this.opts.onSample!.call(this);
	}
}
// Inject BEFORE loadModule (the accel/tabs idiom): the hook calls importNow inside
// its body, so this free global resolves against the sandbox at call time. Return
// the stub CLASS as `.default`, exactly as the host module does.
sandbox.importNow = (spec: string) => {
	lastSpec = spec;
	return { default: StubBattery };
};

const { createRoot, effect } = signals;
const { useBattery } = await loadModule("runtime/battery");
const { check, done } = makeChecker("battery");

// --- one instance, immediate seed, correct specifier, reactive onSample, close ---
{
	const before = built.length;
	let seen: { percent: number; charging: boolean; plugged: boolean } | undefined;
	const [get, dispose] = createRoot(() => {
		const battery = useBattery();
		effect(() => {
			seen = battery();
		}); // subscribe so we can prove reactivity, not just a re-read
		return battery;
	});
	check("useBattery constructs exactly one Battery", built.length === before + 1);
	const stub = built[built.length - 1];
	check(
		"importNow requested the sensor module (embedded:sensor/Battery, not pebble/battery)",
		lastSpec === "embedded:sensor/Battery",
	);
	// the SEED: the getter reflects the host sample() at construction — all three
	// fields differ from the {0,false,false} placeholder, so this proves a real
	// seed read (the battery-host difference from accel/compass).
	check(
		"useBattery seeds the getter from the host sample() at construction",
		get().percent === 88 && get().charging === true && get().plugged === true,
	);
	check(
		"the subscribing effect saw the seed",
		!!seen && seen.percent === 88 && seen.plugged === true,
	);
	// a device battery event arrives → getter AND the subscriber update reactively
	stub.fireSample({ percent: 20, charging: false, plugged: false });
	check(
		"onSample updates the getter with the fresh reading",
		get().percent === 20 && get().charging === false && get().plugged === false,
	);
	check(
		"the subscribing effect re-ran on the event",
		!!seen && seen.percent === 20 && seen.charging === false,
	);
	dispose();
	check("disposing the only owner closes the instance", stub.closed === true);
}

// --- two useBattery SHARE one instance; refcount keeps then closes ---------------
{
	const before = built.length;
	const [getA, disposeA] = createRoot(() => useBattery());
	const [getB, disposeB] = createRoot(() => useBattery());
	check("two useBattery calls construct only ONE instance (shared)", built.length === before + 1);
	const stub = built[built.length - 1];
	// both getters are backed by the SAME shared signal
	stub.fireSample({ percent: 50, charging: true, plugged: true });
	check(
		"both shared getters see the same reading",
		getA().percent === 50 && getB().charging === true,
	);
	// dispose the FIRST owner → refs 2→1, instance stays alive (release keep branch)
	disposeA();
	check("disposing one of two owners keeps the instance open", stub.closed === false);
	// the surviving owner is still reactive
	stub.fireSample({ percent: 49, charging: false, plugged: true });
	check(
		"the surviving owner still updates after its sibling left",
		getB().percent === 49 && getB().plugged === true,
	);
	// dispose the LAST owner → refs 1→0, close (release close branch)
	disposeB();
	check("disposing the last owner closes the shared instance", stub.closed === true);
}

// --- refcount returned to 0: a later call rebuilds a NEW instance -----------------
{
	const before = built.length;
	const [, dispose] = createRoot(() => useBattery());
	check(
		"after full teardown a fresh useBattery builds a NEW instance (refs were 0)",
		built.length === before + 1,
	);
	dispose();
}

done();
