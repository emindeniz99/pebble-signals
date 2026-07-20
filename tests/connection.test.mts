// connection suite — runtime/connection (opt-in reactive phone-link state). Proves:
// useConnection SEEDS its getter from a copy of the bare `watch` global's
// `connected` snapshot; registers exactly ONE "connected" listener via
// watch.addEventListener (the host callback takes NO argument); a connection
// change — mutate watch.connected, then fire the stored listener — RE-READS
// watch.connected into the getter and re-runs a SUBSCRIBING effect (proving
// reactivity, not just a re-read); disposing the owning root calls
// watch.removeEventListener with the SAME callback, emptying the listener list
// (no leak); and — the missing-`watch` guard — a host WITHOUT the global
// degrades to a stable disconnected reading with no listener, no cleanup, and no
// throw. Every branch (watch present vs absent) and every function (both
// getters, the callback, the cleanup closure) is exercised for 100%
// line/branch/function coverage of the compiled connection.js.
//
// The vm sandbox has NO `watch`, so — exactly as tabs.test injects Style/Skin
// and accel.test injects importNow BEFORE loadModule — we inject sandbox.watch:
// a stub that STORES each listener (so the test can FIRE it) and counts
// removeEventListener calls. `connected` is a PLAIN property the test reassigns
// to simulate the host's fresh-object-per-read (the hook re-reads it on fire).
// useConnection reads `watch` at CALL time, so each block reassigns
// sandbox.watch (a fresh stub, or undefined for the guard) before building its
// root. No timers -> no tick()/liveTimers() needed.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();

// A `watch` stand-in: stores listeners per event so the test can fire them, and
// counts removeEventListener calls so teardown is assertable.
interface WatchStub {
	connected: { app: boolean; pebblekit: boolean };
	_listeners: Record<string, Array<() => void>>;
	removeCount: number;
	addEventListener(ev: string, cb: () => void): void;
	removeEventListener(ev: string, cb: () => void): void;
	fire(ev: string): void;
}
const makeWatch = (connected: { app: boolean; pebblekit: boolean }): WatchStub => ({
	connected,
	_listeners: {},
	removeCount: 0,
	addEventListener(ev, cb) {
		(this._listeners[ev] || (this._listeners[ev] = [])).push(cb);
	},
	removeEventListener(ev, cb) {
		this.removeCount++;
		const l = this._listeners[ev];
		if (!l) return;
		const i = l.indexOf(cb);
		if (i >= 0) l.splice(i, 1);
	},
	fire(ev) {
		for (const cb of this._listeners[ev] || []) cb();
	},
});

// Inject BEFORE loadModule (the tabs.test / accel.test idiom). The hook reads the
// bare `watch` global at call time, so this sandbox global resolves then.
sandbox.watch = makeWatch({ app: true, pebblekit: false });

const { createRoot, effect } = signals;
const { useConnection } = await loadModule("runtime/connection");
const { check, done } = makeChecker("connection");

// --- watch present: seed, one listener, reactive on fire, cleanup on dispose ---
{
	const stub = makeWatch({ app: true, pebblekit: false });
	sandbox.watch = stub;
	let seen: { app: boolean; pebblekit: boolean } | undefined;
	const [get, dispose] = createRoot(() => {
		const conn = useConnection();
		effect(() => {
			seen = conn(); // subscribe so we prove reactivity, not just a re-read
		});
		return conn;
	});
	check(
		"useConnection seeds the getter from watch.connected",
		get().app === true && get().pebblekit === false,
	);
	check(
		"the subscribing effect saw the seed",
		!!seen && seen.app === true && seen.pebblekit === false,
	);
	check("registers exactly one 'connected' listener", stub._listeners.connected.length === 1);
	// a connection change: set the new current state, then fire the stored listener
	// (the host callback takes NO arg — it re-reads watch.connected).
	stub.connected = { app: false, pebblekit: true };
	stub.fire("connected");
	check(
		"firing 'connected' re-reads watch.connected into the getter",
		get().app === false && get().pebblekit === true,
	);
	check(
		"the subscribing effect re-ran on the connection change",
		!!seen && seen.app === false && seen.pebblekit === true,
	);
	// teardown: the SAME callback is removed and the listener list empties (no leak).
	dispose();
	check(
		"disposing the root removed the 'connected' listener",
		stub._listeners.connected.length === 0,
	);
	check("disposing called watch.removeEventListener exactly once", stub.removeCount === 1);
}

// --- missing `watch`: degrade to disconnected, no listener, no cleanup, no throw ---
{
	sandbox.watch = undefined; // a host WITHOUT the bare `watch` global
	let threw = false;
	let get: (() => { app: boolean; pebblekit: boolean }) | null = null;
	let dispose: () => void = () => {};
	try {
		const r = createRoot(() => useConnection());
		get = r[0];
		dispose = r[1];
	} catch {
		threw = true;
	}
	check("useConnection never throws when `watch` is absent", threw === false);
	check(
		"absent `watch` degrades to a stable disconnected reading",
		!!get && get().app === false && get().pebblekit === false,
	);
	let disposeThrew = false;
	try {
		dispose();
	} catch {
		disposeThrew = true;
	}
	check("disposing the degraded hook is a clean no-op", disposeThrew === false);
}

done();
