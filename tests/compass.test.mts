// compass suite — runtime/compass (opt-in reactive magnetometer, host-backed).
// Proves: useCompass lazily constructs exactly ONE host Compass via
// importNow("embedded:sensor/Compass"), seeds its getter 0 (the host has no
// construction-time reading — we never seed from sample()), configures the default
// 2° filter, and updates reactively (a subscribing effect re-runs) when onSample
// fires with a heading — AND that a callback whose sample() is undefined (no
// magnetometer / no reading) leaves the heading unchanged and re-runs nothing (the
// `if (s)` guard's false branch); TWO useCompass calls SHARE the one instance + one
// signal (constructor runs once, both getters see the sample); the refcount keeps
// the instance alive while any owner survives and close()s it only when the LAST
// owner is disposed; an explicit filter configures that throttle and a warm second
// caller does NOT re-configure (first-caller-wins, sharing); and after full
// teardown a fresh call rebuilds a new instance (refs returned to 0). Every branch
// — ensure build vs share, release keep vs close, opts present vs absent, onSample
// heading vs undefined — is covered for 100% line/branch/function coverage.
//
// The vm sandbox has NO `importNow` and NO Compass, so — exactly as tabs.test
// injects Style/Skin BEFORE loadModule — we inject sandbox.importNow to return a
// StubCompass class. StubCompass stores the onSample callback the hook hands its
// constructor and FIRES it (with `this` = the instance, as the C host does at
// pebble-compass.c:161), while recording configure()/close() and the requested
// specifier. compass is callback-driven (no setInterval), so no tick()/liveTimers()
// are needed; each block disposes its root(s) so the module-level singleton returns
// to refs=0 and the next block starts from a clean (unconstructed) state.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();

// StubCompass: the host Compass stand-in. Records every construction (count +
// identity via `built`), the configure() dict and close(), and the specifier
// importNow was asked for; fires the stored onSample the way the C host does.
const built: StubCompass[] = []; // every instance ever constructed (delta = ctor count)
let lastSpec = ""; // the importNow specifier the module requested
class StubCompass {
	opts: { onSample?: () => void };
	configured: { filter?: number } | null;
	closed: boolean;
	_sample: { heading: number } | undefined;
	constructor(opts: { onSample?: () => void }) {
		this.opts = opts;
		this.configured = null;
		this.closed = false;
		this._sample = undefined; // host sample() is undefined until the first callback
		built.push(this);
	}
	sample() {
		return this._sample;
	}
	configure(o: { filter?: number }) {
		this.configured = o;
	}
	close() {
		this.closed = true;
	}
	// Drive a device SAMPLE: set the reading, then invoke onSample with `this` = the
	// instance (haveSample is already true when the host calls it, so the hook's
	// this.sample() returns a real object — mirrors compassData()).
	fireHeading(h: number) {
		this._sample = { heading: h };
		this.opts.onSample!.call(this);
	}
	// Drive a callback whose sample() yields undefined — the magnetometer-less /
	// no-reading path the hook must guard (mirrors sample()'s early return).
	fireEmpty() {
		this._sample = undefined;
		this.opts.onSample!.call(this);
	}
}
// Inject BEFORE loadModule (the tabs.test idiom for Style/Skin): the hook calls
// importNow inside its body, so this free global resolves against the sandbox at
// call time. Return the stub CLASS as `.default`, exactly as the host module does.
sandbox.importNow = (spec: string) => {
	lastSpec = spec;
	return { default: StubCompass };
};

const { createRoot, effect } = signals;
const { useCompass } = await loadModule("runtime/compass");
const { check, done } = makeChecker("compass");

// --- useCompass: one instance, seed 0, default filter, reactive onSample, guard, close ---
{
	const before = built.length;
	let runs = 0;
	let seen = -1;
	const [heading, dispose] = createRoot(() => {
		const h = useCompass();
		effect(() => {
			runs++;
			seen = h();
		}); // subscribe so we can prove reactivity, not just a re-read
		return h;
	});
	check("useCompass constructs exactly one Compass", built.length === before + 1);
	const stub = built[built.length - 1];
	check(
		"useCompass seeds the getter at 0 (host has no construction-time reading)",
		heading() === 0,
	);
	check("the subscribing effect ran once and saw the 0 seed", runs === 1 && seen === 0);
	check("useCompass configures the default 2° filter", stub.configured?.filter === 2);
	check("importNow requested the compass sensor module", lastSpec === "embedded:sensor/Compass");
	// a heading sample arrives → getter AND the subscriber update reactively
	stub.fireHeading(90);
	check("onSample writes the heading (degrees, magnetic, CCW)", heading() === 90);
	check("the subscribing effect re-ran on the sample", runs === 2 && seen === 90);
	// heading 0 is a VALID reading (due north) — the guard checks the object, not the value
	stub.fireHeading(0);
	check("a heading of 0 (due north) is written, not dropped", heading() === 0);
	check("the effect re-ran for the 0 heading", runs === 3 && seen === 0);
	// a callback whose sample() is undefined (no magnetometer / no reading) is a no-op
	stub.fireHeading(45);
	check("a real reading updates before the undefined test", heading() === 45 && runs === 4);
	stub.fireEmpty();
	check("an undefined sample leaves the heading unchanged", heading() === 45);
	check("an undefined sample does not re-run the subscriber", runs === 4 && seen === 45);
	dispose();
	check("disposing the only owner closes the instance", stub.closed === true);
}

// --- two useCompass SHARE one instance + refcount keep/close ----------------------
{
	const before = built.length;
	const [getA, disposeA] = createRoot(() => useCompass());
	const [getB, disposeB] = createRoot(() => useCompass());
	check("two useCompass calls construct only ONE instance (shared)", built.length === before + 1);
	const stub = built[built.length - 1];
	// both getters are backed by the SAME shared signal
	stub.fireHeading(200);
	check("both shared getters see the same heading", getA() === 200 && getB() === 200);
	// dispose the FIRST owner → refs 2→1, instance stays alive (keep branch)
	disposeA();
	check("disposing one of two owners keeps the instance open", stub.closed === false);
	// the surviving owner is still reactive
	stub.fireHeading(123);
	check("the surviving owner still updates after its sibling left", getB() === 123);
	// dispose the LAST owner → refs 1→0, close (close branch)
	disposeB();
	check("disposing the last owner closes the shared instance", stub.closed === true);
}

// --- explicit filter configures the throttle; a warm caller does NOT re-configure -
{
	const before = built.length;
	const [, disposeA] = createRoot(() => useCompass({ filter: 10 }));
	check("useCompass({filter}) constructs a fresh instance", built.length === before + 1);
	const stub = built[built.length - 1];
	check("useCompass({filter:10}) configures a 10° throttle", stub.configured?.filter === 10);
	// a warm second caller shares the instance and does NOT re-configure (first filter wins)
	const [, disposeB] = createRoot(() => useCompass({ filter: 99 }));
	check("second caller shares the instance (no new construction)", built.length === before + 1);
	check("the first caller's filter wins (no re-configure)", stub.configured?.filter === 10);
	// the refcount spans both callers: dropping the first leaves the second holding it
	disposeA();
	check("disposing the first caller leaves the shared instance open", stub.closed === false);
	disposeB();
	check("disposing the last caller closes the instance", stub.closed === true);
}

// --- refcount returned to 0: a later call rebuilds a NEW instance -----------------
{
	const before = built.length;
	const [, dispose] = createRoot(() => useCompass());
	check(
		"after full teardown a fresh useCompass builds a NEW instance (refs were 0)",
		built.length === before + 1,
	);
	dispose();
}

done();
