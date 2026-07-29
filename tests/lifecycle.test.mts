// lifecycle suite — runtime/lifecycle (opt-in app-lifecycle + wakeup hooks over
// the bare `watch` global and pebble/wakeup). Proves:
//  - useLaunchReason returns watch.launch's { reason, arguments } (a one-shot,
//    no listener) AND degrades to { reason: 0, arguments: 0 } when `watch` is
//    absent (the missing-global guard — both branches);
//  - useAppFocus SEEDS true, registers exactly one "didFocus" listener, updates
//    the getter (and re-runs a SUBSCRIBING effect, proving reactivity not just a
//    re-read) when the stored callback fires false, and removes the SAME listener
//    on root dispose (no leak) — and, with the "will" phase, does all of that on
//    "willFocus" INSTEAD (the phase picks the host event; the OTHER phase is
//    never subscribed, which is what keeps the two independent on the host's one
//    shared app_focus_service);
//  - useWakeup delegates schedule/query/cancel to the pebble/wakeup default —
//    cancel(id) cancels ONE, cancel() with NO arg cancels ALL (the argc branch,
//    both sides) — SEEDS `last` from watch.wake, updates `last` (reactively) when
//    the stored "wakeup" callback fires, and removes its listener on dispose.
// Every branch (watch present vs absent; focus phase defaulted vs passed; cancel
// arg vs none) and every function (both getters, the focus / wakeup callbacks,
// the two cleanup closures, the three delegators) is exercised for 100%
// line/branch/function coverage of the compiled lifecycle.js.
//
// The vm sandbox has NEITHER `watch` NOR the host `pebble/wakeup`, so — exactly
// as connection.test injects sandbox.watch and message.test injects
// sandbox.importNow BEFORE loadModule — we inject BOTH. The watch stub STORES
// listeners (so a test can FIRE them WITH an arg — didFocus gets a boolean,
// wakeup gets { id, cookie }) and counts removals; StubWakeup records every
// schedule/query/cancel call. Each block reassigns sandbox.watch (a fresh stub,
// or undefined for the guard) before it builds. No timers -> no tick() needed.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot, effect } = signals;
const { check, done } = makeChecker("lifecycle");

interface LaunchInfo {
	reason: number;
	arguments: number;
}
interface WakeupInfo {
	id: number;
	cookie: number;
}

// A `watch` stand-in: one-shot launch / wake reads plus stored listeners the test
// fires (WITH an arg), and a removeEventListener count so teardown is assertable.
// Mirrors connection.test's makeWatch, extended with a fire() argument.
interface WatchStub {
	launch: LaunchInfo;
	wake: WakeupInfo | undefined;
	_listeners: Record<string, Array<(arg?: unknown) => void>>;
	removeCount: number;
	addEventListener(ev: string, cb: (arg?: unknown) => void): void;
	removeEventListener(ev: string, cb: (arg?: unknown) => void): void;
	fire(ev: string, arg?: unknown): void;
}
const makeWatch = (launch: LaunchInfo, wake: WakeupInfo | undefined): WatchStub => ({
	launch,
	wake,
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
	fire(ev, arg) {
		for (const cb of this._listeners[ev] || []) cb(arg);
	},
});

// Module-level recorders for the wakeup host calls (mirrors message.test's
// `let lastMsg` capture idiom — reset per block). The host `pebble/wakeup`
// default is the Wakeup CLASS with STATIC schedule/query/cancel, so StubWakeup
// records via static methods into these.
let scheduleCalls: Array<[unknown, unknown, unknown]> = [];
let queryCalls: unknown[] = [];
let cancelCalls: unknown[][] = []; // each entry is the arg-array, so cancel() vs cancel(id) is visible
const NEXT_ID = 77; // the WakeupId schedule() hands back

class StubWakeup {
	static schedule(time?: unknown, cookie?: unknown, notifyIfMissed?: unknown): number {
		scheduleCalls.push([time, cookie, notifyIfMissed]);
		return NEXT_ID;
	}
	static query(id?: unknown): unknown {
		queryCalls.push(id);
		return { time: 1000, scheduled: true };
	}
	static cancel(...args: unknown[]): void {
		cancelCalls.push(args);
	}
}

// Inject BOTH host stubs BEFORE loadModule (connection.test / message.test idiom).
sandbox.watch = makeWatch({ reason: 2, arguments: 5 }, undefined);
(sandbox as { importNow?: unknown }).importNow = (spec: string) => {
	if (spec !== "pebble/wakeup") throw new Error("unexpected importNow spec: " + spec);
	return { default: StubWakeup };
};

const { useLaunchReason, useAppFocus, useWakeup } = (await loadModule("runtime/lifecycle")) as {
	useLaunchReason(): LaunchInfo;
	useAppFocus(phase?: "did" | "will"): () => boolean;
	useWakeup(): {
		schedule: (time: number, cookie?: number, notifyIfMissed?: boolean) => number;
		query: (id: number) => unknown;
		cancel: (id?: number) => void;
		last: () => WakeupInfo | undefined;
	};
};

// --- useLaunchReason: one-shot read of watch.launch (no listener, no owner) ---
{
	sandbox.watch = makeWatch({ reason: 2, arguments: 5 }, undefined);
	const info = useLaunchReason(); // holds no subscription — needs no root
	check("useLaunchReason returns watch.launch.reason", info.reason === 2);
	check("useLaunchReason returns watch.launch.arguments", info.arguments === 5);
}

// --- useLaunchReason: missing `watch` degrades to zeros, never throws ---
{
	sandbox.watch = undefined; // a host WITHOUT the bare `watch` global
	let threw = false;
	let info: LaunchInfo | null = null;
	try {
		info = useLaunchReason();
	} catch {
		threw = true;
	}
	check("useLaunchReason never throws when `watch` is absent", threw === false);
	check(
		"absent `watch` degrades to { reason: 0, arguments: 0 }",
		!!info && info.reason === 0 && info.arguments === 0,
	);
}

// --- useAppFocus(): default "did" phase — seed true, one listener, reactive on
// fire, cleanup on dispose ---
{
	const stub = makeWatch({ reason: 0, arguments: 0 }, undefined);
	sandbox.watch = stub;
	let runs = 0;
	let seen = false;
	const [focused, dispose] = createRoot(() => {
		const f = useAppFocus();
		effect(() => {
			runs++;
			seen = f(); // subscribe so we prove reactivity, not just a re-read
		});
		return f;
	});
	check("useAppFocus seeds true", focused() === true);
	check("the subscribing effect saw the true seed", runs === 1 && seen === true);
	check("registers exactly one 'didFocus' listener", stub._listeners.didFocus.length === 1);
	// a focus change: the host fires didFocus with a boolean (in_focus === false).
	stub.fire("didFocus", false);
	check("firing 'didFocus' false updates the getter", focused() === false);
	check("the subscribing effect re-ran on the focus change", runs === 2 && seen === false);
	// teardown: the SAME callback is removed and the listener list empties (no leak).
	dispose();
	check(
		"disposing the root removed the 'didFocus' listener",
		stub._listeners.didFocus.length === 0,
	);
	check("disposing called watch.removeEventListener exactly once", stub.removeCount === 1);
}

// --- useAppFocus("will"): the phase picks the EARLIER host event, and only it ---
// Same contract as the default block (seed / one listener / reactive / cleanup)
// but on "willFocus" — plus the isolation the host's shared app_focus_service
// makes load-bearing: a "will" hook must not ALSO subscribe "didFocus" (that
// would double-write the signal and leave a handler installed after teardown),
// and a "didFocus" fire must not reach it. Exercises the non-default side of the
// `phase` parameter, so both branches of its default are covered.
{
	const stub = makeWatch({ reason: 0, arguments: 0 }, undefined);
	sandbox.watch = stub;
	let runs = 0;
	let seen = false;
	const [willFocused, dispose] = createRoot(() => {
		const f = useAppFocus("will");
		effect(() => {
			runs++;
			seen = f(); // subscribe, so this proves reactivity — not just a re-read
		});
		return f;
	});
	check("useAppFocus('will') seeds true", willFocused() === true);
	check("the subscribing effect saw the true seed", runs === 1 && seen === true);
	check("registers exactly one 'willFocus' listener", stub._listeners.willFocus.length === 1);
	check(
		"the 'will' phase subscribes NO 'didFocus' listener",
		stub._listeners.didFocus === undefined,
	);
	// willFocus carries the SAME boolean payload as didFocus (pebble-global.c:99).
	stub.fire("willFocus", false);
	check("firing 'willFocus' false updates the getter", willFocused() === false);
	check("the subscribing effect re-ran on the 'willFocus' change", runs === 2 && seen === false);
	// wrong-event isolation: the other phase's fire reaches no listener here.
	stub.fire("didFocus", true);
	check(
		"a 'didFocus' fire does not touch a 'will'-phase getter",
		willFocused() === false && runs === 2,
	);
	// teardown: the SAME callback is removed from the 'willFocus' list (no leak).
	dispose();
	check(
		"disposing the root removed the 'willFocus' listener",
		stub._listeners.willFocus.length === 0,
	);
	check("disposing called watch.removeEventListener exactly once", stub.removeCount === 1);
}

// --- useWakeup: delegate schedule/query/cancel, seed + reactive last, cleanup ---
{
	scheduleCalls = [];
	queryCalls = [];
	cancelCalls = [];
	const stub = makeWatch({ reason: 0, arguments: 0 }, { id: 11, cookie: 22 });
	sandbox.watch = stub;
	let runs = 0;
	let seen: WakeupInfo | undefined = { id: -1, cookie: -1 }; // sentinel != the seed
	const [api, dispose] = createRoot(() => {
		const w = useWakeup();
		effect(() => {
			runs++;
			seen = w.last(); // subscribe so we prove reactivity of `last`
		});
		return w;
	});

	// SEED: last() comes from watch.wake (the wakeup that launched the app).
	check(
		"useWakeup seeds last() from watch.wake",
		api.last()?.id === 11 && api.last()?.cookie === 22,
	);
	check("the subscribing effect saw the wake seed", runs === 1 && seen?.id === 11);
	check("registers exactly one 'wakeup' listener", stub._listeners.wakeup.length === 1);

	// schedule delegates all three args to the host and returns its WakeupId.
	const id = api.schedule(1000, 7, true);
	check("schedule() returns the host WakeupId", id === NEXT_ID);
	check(
		"schedule() delegates (time, cookie, notifyIfMissed) to the host",
		scheduleCalls.length === 1 &&
			scheduleCalls[0][0] === 1000 &&
			scheduleCalls[0][1] === 7 &&
			scheduleCalls[0][2] === true,
	);

	// query delegates the id and returns the host object verbatim.
	const q = api.query(id) as { scheduled?: boolean };
	check("query() delegates the id to the host", queryCalls.length === 1 && queryCalls[0] === id);
	check("query() returns the host result", q.scheduled === true);

	// cancel(id) cancels ONE — exactly one arg reaches the host.
	api.cancel(3);
	check(
		"cancel(id) delegates one arg to the host",
		cancelCalls.length === 1 && cancelCalls[0].length === 1 && cancelCalls[0][0] === 3,
	);
	// cancel() with NO arg cancels ALL — the host sees ZERO args (the argc branch).
	api.cancel();
	check(
		"cancel() with no arg delegates ZERO args (cancel-all)",
		cancelCalls.length === 2 && cancelCalls[1].length === 0,
	);
	// none of schedule/query/cancel write a signal, so the effect has not re-run.
	check("delegating calls do not re-run the last() effect", runs === 1);

	// a FIRED wakeup updates last() reactively (a fresh object always notifies).
	const fired: WakeupInfo = { id: 33, cookie: 44 };
	stub.fire("wakeup", fired);
	check("firing 'wakeup' updates last()", api.last() === fired);
	check("the wakeup event re-ran the subscribed effect (reactive)", runs === 2 && seen === fired);

	// teardown: the 'wakeup' listener is removed (no leak).
	check("listener not removed before dispose", stub.removeCount === 0);
	dispose();
	check("disposing the root removed the 'wakeup' listener", stub._listeners.wakeup.length === 0);
	check("disposing called watch.removeEventListener exactly once", stub.removeCount === 1);
	// with the listener detached, a further host fire reaches no one — last() holds.
	const runsAtDispose = runs;
	stub.fire("wakeup", { id: 55, cookie: 66 });
	check(
		"after dispose a 'wakeup' fire reaches no listener — last() unchanged",
		api.last() === fired && runs === runsAtDispose,
	);
}

done();
