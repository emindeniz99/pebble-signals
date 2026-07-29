// hosttime suite — runtime/hosttime (the opt-in binding for the host `time` and
// `timer` modules, both preloaded by build/devices/pebble/manifest.json). Proves
// the three exports against stubs that model the HOST's real semantics rather
// than friendly JS ones: `Time.ticks` is a live GETTER, `Time.delta` branches on
// ARGC and subtracts in uint32, `Timer.set` hands back an opaque host OBJECT,
// `Timer.schedule` branches on ARGC (one arg = unschedule) and THROWS on a
// cleared handle, and `Timer.clear` tolerates one.
//
// The WHY behind each check (Rule 9): every one is a device failure this wrapper
// exists to prevent. A hand-written `ticks() - start` goes negative once uptime
// passes 2^31 ms because the host returns ticks through an INT32 — the reason
// elapsed() delegates to Time.delta. `delta(start, undefined)` would report a
// garbage span against an `end` of 0, and `schedule(id, undefined)` would RE-ARM
// where a pause was asked for — both are argc branches in C, so the stubs count
// arguments. A timer created one-shot is FORGOTTEN by the host the moment it
// fires, so every later reschedule would abort the app; and `schedule` on an
// already-cleared handle aborts it too, which is what the post-cancel no-ops
// protect. The suite also pins the module's ASYMMETRIC error contract: the two
// measurements degrade to 0, the TIMER throws.
//
// `importNow` is a bare compartment global the vm sandbox lacks, so it is
// injected returning the stubs as `.default` (the vibration/accel idiom); the
// second sandbox leaves it absent to exercise the degraded half.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("hosttime");

// ---- a host-faithful `time` stub -------------------------------------------
// `now` stands in for rtc_get_ticks() and is handed back through the same INT32
// narrowing the host applies (xsmcSetInteger), so a reading past 2^31 ms really
// does surface NEGATIVE here — the condition elapsed() has to survive.
let now = 0;
let deltaArgc = 0;
const TimeStub = {
	get ticks() {
		return now | 0;
	},
	delta(...args: number[]) {
		deltaArgc = args.length;
		// xs_time_delta: BOTH ends through xsmcToUnsigned, subtracted as uint32,
		// returned through xsmcSetInteger. `end` defaults to now when absent.
		const start = args[0] >>> 0;
		const end = (args.length > 1 ? args[1] : now) >>> 0;
		return ((end - start) >>> 0) | 0;
	},
};

// ---- a host-faithful `timer` stub ------------------------------------------
interface Rec {
	callback: () => void;
	delay: number;
	repeat: number;
	scheduled: boolean;
}
const live = new Map<object, Rec>();
let created = 0; // how many host records were allocated (the cost reschedule avoids)
let scheduleArgc = 0;
const TimerStub = {
	set(callback: () => void, delay: number, repeat: number) {
		const id = {}; // an opaque host object, exactly like xsNewHostObject
		live.set(id, { callback, delay, repeat, scheduled: true });
		created++;
		return id;
	},
	schedule(...args: unknown[]) {
		scheduleArgc = args.length;
		const rec = live.get(args[0] as object);
		// xsmcGetHostDataValidate: a cleared handle has NULL host data and THROWS
		// (on device that is an fxAbort, not a catchable app error).
		if (!rec) throw new Error("invalid host data");
		if (args.length === 1) {
			rec.scheduled = false; // modTimerUnschedule — the record SURVIVES
			return;
		}
		rec.delay = args[1] as number;
		rec.repeat = (args.length > 2 ? args[2] : 0) as number;
		rec.scheduled = true; // modTimerReschedule clears the unscheduled flag
	},
	clear(id: object) {
		// xs_timer_clear checks host data first, so clearing twice is tolerated.
		live.delete(id);
	},
};

// ---- the host-present sandbox ----------------------------------------------
{
	const { signals, sandbox, loadModule } = await loadRuntime();
	const { createRoot } = signals;
	let lastSpec = "";
	sandbox.importNow = (spec: string) => {
		lastSpec = spec;
		return { default: spec === "time" ? TimeStub : TimerStub };
	};
	const ht = (await loadModule("runtime/hosttime")) as {
		ticks(): number;
		elapsed(start: number, end?: number): number;
		useHostTimer(
			callback: () => void,
			delay: number,
		): { reschedule(ms: number): void; pause(): void; cancel(): void };
	};

	// --- ticks(): a LIVE read of the host getter, never a cached number ---
	{
		now = 1000;
		const first = ht.ticks();
		check("ticks() resolves the host `time` module", lastSpec === "time");
		now = 1750;
		// WHY: Time.ticks is a static GETTER over rtc_get_ticks(). Caching the
		// module's first read (or the value) would freeze every later measurement
		// at boot time — the exact failure a preloaded module's load-time host
		// access causes (gotcha 13).
		check("ticks() re-reads the host getter on every call", first === 1000 && ht.ticks() === 1750);
	}

	// --- elapsed(): the argc branch, and the INT32 wrap it exists for ---
	{
		now = 2000;
		const span = ht.elapsed(1750);
		// WHY the arity matters: xs_time_delta branches on `xsmcArgc > 1`, so a
		// literal delta(start, undefined) would coerce `end` to 0 and report a
		// garbage span instead of "start -> now".
		check("elapsed(start) passes ONE argument, so the host defaults end to now", deltaArgc === 1);
		check("elapsed(start) measures start -> now", span === 250);
		check(
			"elapsed(start, end) passes the explicit end",
			ht.elapsed(10, 60) === 50 && deltaArgc === 2,
		);
	}
	{
		// WHY this is the headline test: the host returns ticks through
		// xsmcSetInteger (INT32), so an uptime past 2^31 ms reads NEGATIVE. A
		// hand-written `ticks() - start` across that boundary yields a nonsense
		// -4294966784; Time.delta subtracts in uint32, where it cancels.
		const start = 0x7fffff00 | 0; // 2147483392 — still positive
		now = 0x80000100; // 512 ms later, and now negative as an INT32
		const naive = (now | 0) - start;
		check(
			"elapsed() survives the INT32 sign flip a raw subtraction cannot",
			ht.elapsed(start) === 512 && naive < 0,
		);
		now = 0;
	}

	// --- useHostTimer(): ONE repeating host record, re-aimed in place ---
	{
		live.clear();
		created = 0;
		let fired = 0;
		const [t, disposeRoot] = createRoot(() =>
			ht.useHostTimer(() => {
				fired++;
			}, 1000),
		);
		const id = [...live.keys()][0];
		const rec = live.get(id) as Rec;
		check("useHostTimer resolves the host `timer` module", lastSpec === "timer");
		// WHY repeating and not one-shot: xs_timer_callback xsForget()s a timer
		// whose repeatInterval is 0 as soon as it fires and NULLs its host data —
		// a one-shot handle is DEAD, so every later reschedule() would throw.
		check(
			"the timer is created REPEATING (repeat === delay)",
			rec.delay === 1000 && rec.repeat === 1000,
		);
		rec.callback();
		check("the host callback is the one the caller handed in", fired === 1);

		// --- reschedule: the whole point — no second allocation ---
		t.reschedule(5000);
		// WHY this beats clear+create: re-arming through the globals is a c_free
		// plus a c_malloc, a new host object and a new XS slot every time. On a
		// 32KB arena a variable-delay poller cannot afford that per tick.
		check(
			"reschedule() reuses the SAME host record (no new allocation)",
			created === 1 && live.size === 1,
		);
		check("reschedule() re-aims delay AND repeat", rec.delay === 5000 && rec.repeat === 5000);

		// --- pause / resume ---
		t.pause();
		// WHY exactly one argument: xs_timer_schedule unschedules only when
		// `1 === argc`. Passing a delay would RE-ARM the timer the caller just
		// asked to stop.
		check("pause() calls schedule with ONE argument (the unschedule branch)", scheduleArgc === 1);
		check(
			"pause() stops the timer but KEEPS the record",
			rec.scheduled === false && live.size === 1,
		);
		t.reschedule(1000);
		check("reschedule() resumes a paused timer", rec.scheduled === true && rec.delay === 1000);

		// --- cancel, twice, then the post-cancel no-ops ---
		t.cancel();
		check("cancel() destroys the host timer", live.size === 0);
		t.cancel();
		check("cancel() is idempotent", live.size === 0);
		// WHY the post-cancel gate: schedule() on a cleared handle hits
		// xsmcGetHostDataValidate, which on device is an fxAbort — the app dies.
		// The stub throws to prove the gate is what prevents the call.
		let threw = "";
		try {
			t.reschedule(200);
			t.pause();
		} catch (e) {
			threw = (e as Error).message;
		}
		check("reschedule() and pause() are no-ops after cancel, not a host throw", threw === "");
		disposeRoot(); // the cleanup must also survive an already-cancelled timer
		check("disposing an already-cancelled owner is harmless", live.size === 0);
	}

	// --- owner disposal cancels a still-running timer ---
	{
		live.clear();
		const [, disposeRoot] = createRoot(() => ht.useHostTimer(() => {}, 500));
		check("the timer is live while its owner is", live.size === 1);
		// WHY: a timer that outlives the screen that created it keeps firing a
		// callback closed over a disposed tree — the leak runtime/timers' track()
		// exists to prevent, and the arena cannot absorb one per navigate-away.
		disposeRoot();
		check("disposing the owner cancels the timer", live.size === 0);
	}
}

// ---- no `importNow`: the measurements degrade, the TIMER throws -------------
{
	const { loadModule } = await loadRuntime(); // fresh sandbox: no importNow at all
	const ht = (await loadModule("runtime/hosttime")) as {
		ticks(): number;
		elapsed(start: number): number;
		useHostTimer(callback: () => void, delay: number): unknown;
	};
	// WHY typeof and not a bare read: referencing an absent global is a
	// ReferenceError, not `undefined` (the watchinfo / localstorage guard).
	check("ticks() degrades to 0 without importNow", ht.ticks() === 0);
	check("elapsed() degrades to 0 without importNow", ht.elapsed(1234) === 0);
	let threw = "";
	try {
		ht.useHostTimer(() => {}, 1000);
	} catch (e) {
		threw = (e as Error).message;
	}
	// WHY the asymmetry (module header): a measurement that cannot be taken is
	// not an app failure, but a timer that silently never fires is work the app
	// believes it scheduled — it must be told.
	check(
		"useHostTimer THROWS without importNow (a silent no-timer is worse)",
		threw === "no host timer",
	);
}

done();
