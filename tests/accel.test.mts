// accel suite — runtime/accel (opt-in reactive accelerometer, host-backed). Proves:
// useAccel lazily constructs exactly ONE host Accelerometer via
// importNow("embedded:sensor/Accelerometer"), seeds its getter {0,0,0} (the host
// sample() returns undefined until the first onSample — so we never seed from it),
// configures the default 25 Hz, and updates reactively (a subscribing effect
// re-runs) when onSample fires with a raw milli-g reading; TWO useAccel calls
// SHARE the one instance + one signal (constructor runs once, both getters see the
// sample); the refcount keeps the instance alive while any owner survives and
// close()s it only when the LAST owner is disposed; an explicit hz configures that
// rate; useTap seeds undefined then reports the AXIS-FIRST direction ("z-", not
// "-z") on onTap; useAccel + useTap SHARE the single instance (the C wrapper allows
// "only one"), each feeding its own signal, with a refcount spanning both hook
// kinds and the FIRST caller's hz winning; and after full teardown a fresh call
// rebuilds a new instance (refs returned to 0). Every branch — ensure build vs
// share, release keep vs close, opts present vs absent, both callbacks, both
// getters — is covered for 100% line/branch/function coverage.
//
// The vm sandbox has NO `importNow` and NO Accelerometer, so — exactly as
// tabs.test injects Style/Skin BEFORE loadModule — we inject sandbox.importNow to
// return a StubAccel class. StubAccel stores the onSample/onTap callbacks the hook
// hands its constructor and FIRES them (with `this` = the instance, as the C host
// does: onSample no-arg after setting haveSample, onTap with the direction), while
// recording configure()/close() and the requested specifier. accel is
// callback-driven (no setInterval), so no tick()/liveTimers() are needed; each
// block disposes its root(s) so the module-level singleton returns to refs=0 and
// the next block starts from a clean (unconstructed) state.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();

// StubAccel: the host Accelerometer stand-in. Records every construction (count +
// identity via `built`), the configure() dict and close(), and the specifier
// importNow was asked for; fires the stored callbacks the way the C host does.
const built: StubAccel[] = []; // every instance ever constructed (delta = ctor count)
let lastSpec = ""; // the importNow specifier the module requested
class StubAccel {
	opts: { onSample?: () => void; onTap?: (d: string) => void };
	configured: { hz?: number } | null;
	closed: boolean;
	_sample: { x: number; y: number; z: number };
	constructor(opts: { onSample?: () => void; onTap?: (d: string) => void }) {
		this.opts = opts;
		this.configured = null;
		this.closed = false;
		this._sample = { x: 0, y: 0, z: 0 };
		built.push(this);
	}
	sample() {
		return this._sample;
	}
	configure(o: { hz?: number }) {
		this.configured = o;
	}
	close() {
		this.closed = true;
	}
	// Drive a device SAMPLE: set the reading, then invoke onSample with `this` =
	// the instance (haveSample is already true when the host calls it, so the
	// hook's this.sample() returns a real object — mirrors accelerometerData()).
	fireSample(s: { x: number; y: number; z: number }) {
		this._sample = s;
		this.opts.onSample!.call(this);
	}
	// Drive a TAP: invoke onTap with the AXIS-FIRST direction string as its arg
	// (mirrors doTap()'s xsCallFunction1(func, obj, direction)).
	fireTap(dir: string) {
		this.opts.onTap!.call(this, dir);
	}
}
// Inject BEFORE loadModule (the tabs.test idiom for Style/Skin): the hook calls
// importNow inside its body, so this free global resolves against the sandbox at
// call time. Return the stub CLASS as `.default`, exactly as the host module does.
sandbox.importNow = (spec: string) => {
	lastSpec = spec;
	return { default: StubAccel };
};

const { createRoot, effect } = signals;
const { useAccel, useTap } = await loadModule("runtime/accel");
const { check, done } = makeChecker("accel");

// --- useAccel: one instance, seed, default hz, reactive onSample, close ----------
{
	const before = built.length;
	let seen: { x: number; y: number; z: number } | undefined;
	const [get, dispose] = createRoot(() => {
		const accel = useAccel();
		effect(() => {
			seen = accel();
		}); // subscribe so we can prove reactivity, not just a re-read
		return accel;
	});
	check("useAccel constructs exactly one Accelerometer", built.length === before + 1);
	const stub = built[built.length - 1];
	check(
		"useAccel seeds the getter with {0,0,0} (host sample() is undefined pre-callback)",
		get().x === 0 && get().y === 0 && get().z === 0,
	);
	check("the subscribing effect saw the seed", !!seen && seen.x === 0 && seen.z === 0);
	check("useAccel configures the default 25 Hz", stub.configured?.hz === 25);
	check("importNow requested the sensor module", lastSpec === "embedded:sensor/Accelerometer");
	// a device sample arrives → getter AND the subscriber update reactively
	stub.fireSample({ x: 100, y: -200, z: 1000 });
	check(
		"onSample updates the getter with RAW milli-g",
		get().x === 100 && get().y === -200 && get().z === 1000,
	);
	check("the subscribing effect re-ran on the sample", !!seen && seen.x === 100 && seen.z === 1000);
	dispose();
	check("disposing the only owner closes the instance", stub.closed === true);
}

// --- two useAccel SHARE one instance + refcount keeps/closes ----------------------
{
	const before = built.length;
	const [getA, disposeA] = createRoot(() => useAccel());
	const [getB, disposeB] = createRoot(() => useAccel());
	check("two useAccel calls construct only ONE instance (shared)", built.length === before + 1);
	const stub = built[built.length - 1];
	// both getters are backed by the SAME shared signal
	stub.fireSample({ x: 7, y: 8, z: 9 });
	check("both shared getters see the same sample", getA().x === 7 && getB().z === 9);
	// dispose the FIRST owner → refs 2→1, instance stays alive (keep branch)
	disposeA();
	check("disposing one of two owners keeps the instance open", stub.closed === false);
	// the surviving owner is still reactive
	stub.fireSample({ x: 1, y: 2, z: 3 });
	check("the surviving owner still updates after its sibling left", getB().y === 2);
	// dispose the LAST owner → refs 1→0, close (close branch)
	disposeB();
	check("disposing the last owner closes the shared instance", stub.closed === true);
}

// --- useTap: seed undefined, AXIS-FIRST direction, close --------------------------
{
	const before = built.length;
	let seenTap: string | undefined;
	const [tap, dispose] = createRoot(() => {
		const t = useTap();
		effect(() => {
			seenTap = t();
		});
		return t;
	});
	check("useTap constructs the instance when it runs first", built.length === before + 1);
	const stub = built[built.length - 1];
	check("useTap seeds undefined (no tap yet)", tap() === undefined);
	check("the tap subscriber saw the undefined seed", seenTap === undefined);
	// a tap arrives → getter + subscriber update with the AXIS-FIRST string
	stub.fireTap("z-");
	check("onTap updates the getter with the AXIS-FIRST direction", tap() === "z-");
	check("the tap subscriber re-ran on the tap", seenTap === "z-");
	dispose();
	check("disposing the tap owner closes the instance", stub.closed === true);
}

// --- explicit hz is applied to configure() ---------------------------------------
{
	const before = built.length;
	const [, dispose] = createRoot(() => useAccel({ hz: 50 }));
	check("useAccel({hz}) constructs a fresh instance", built.length === before + 1);
	const stub = built[built.length - 1];
	check("useAccel({hz:50}) configures 50 Hz", stub.configured?.hz === 50);
	dispose();
	check("disposing closes the hz-configured instance", stub.closed === true);
}

// --- useAccel + useTap SHARE one instance; first-caller hz wins; joint refcount ---
{
	const before = built.length;
	const [accel, disposeAccel] = createRoot(() => useAccel({ hz: 100 }));
	const [tap, disposeTap] = createRoot(() => useTap());
	check("useAccel + useTap share ONE instance (the 'only one' rule)", built.length === before + 1);
	const stub = built[built.length - 1];
	check("the first caller's hz wins (useTap does not re-rate)", stub.configured?.hz === 100);
	// the one instance feeds BOTH signals from its two callbacks
	stub.fireSample({ x: 5, y: 6, z: 7 });
	stub.fireTap("y+");
	check("the accel signal updates from onSample", accel().x === 5);
	check("the tap signal updates from onTap", tap() === "y+");
	// the refcount spans BOTH hook kinds: dropping accel leaves tap holding it
	disposeAccel();
	check("disposing the accel owner leaves the shared instance open for tap", stub.closed === false);
	disposeTap();
	check("disposing the last (tap) owner closes the shared instance", stub.closed === true);
}

// --- refcount returned to 0: a later call rebuilds a NEW instance -----------------
{
	const before = built.length;
	const [, dispose] = createRoot(() => useAccel());
	check(
		"after full teardown a fresh useAccel builds a NEW instance (refs were 0)",
		built.length === before + 1,
	);
	dispose();
}

done();
