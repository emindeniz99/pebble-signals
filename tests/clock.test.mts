// clock suite — runtime/clock (opt-in reactive current-time hooks). Proves:
// useClock() subscribes to the native "secondchange" tick, seeds a valid Date
// synchronously (no blank first paint), updates reactively when the host fires a
// tick, and removes its listener on owner dispose; useClock("minute") subscribes
// to "minutechange" instead; useTimeParts splits the clock Date into correct
// hours/minutes/seconds getters (default AND "minute"); and an effect bound to
// the getter re-runs on each fire and stops after dispose. Every branch (both
// granularities, both default-parameter paths, the update, the cleanup) is
// covered for 100% line/branch/function.
//
// The host `watch` global and `Date` are absent from the vm sandbox, so — just
// as tabs.test injects Style/Skin — we inject them BEFORE the hook runs:
//   * sandbox.Date = Node's Date, so the module's seed `new Date()` is
//     `instanceof Date` in THIS realm (cross-realm identity — the same reason
//     the harness injects Array/Map).
//   * sandbox.watch = a WatchStub whose addEventListener STORES callbacks per
//     event (so the suite can FIRE a tick) and whose removeEventListener records
//     the teardown. A fresh stub per block keeps listener/removed state isolated.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot, effect } = signals;

// Node's Date into the sandbox: cross-realm identity for the seed (see header).
sandbox.Date = Date;

// watch stub — stores listeners so a tick is fireable; records removeEventListener.
class WatchStub {
	listeners: Record<string, ((e: { date: Date }) => void)[]>;
	removed: string[];
	constructor() {
		this.listeners = {};
		this.removed = [];
	}
	addEventListener(ev: string, cb: (e: { date: Date }) => void): void {
		(this.listeners[ev] || (this.listeners[ev] = [])).push(cb);
	}
	removeEventListener(ev: string, cb: (e: { date: Date }) => void): void {
		const list = this.listeners[ev];
		if (list) {
			const i = list.indexOf(cb);
			if (i >= 0) list.splice(i, 1);
		}
		this.removed.push(ev);
	}
}
sandbox.watch = new WatchStub();

const { useClock, useTimeParts } = await loadModule("runtime/clock");
const { check, done } = makeChecker("clock");

// fire an event to every stored listener; count the live listeners for an event
const fire = (ev: string, date: Date) => {
	for (const cb of sandbox.watch.listeners[ev] || []) cb({ date });
};
const count = (ev: string): number => (sandbox.watch.listeners[ev] || []).length;

// --- useClock(): default granularity subscribes to secondchange, seeds, ticks ---
{
	sandbox.watch = new WatchStub();
	const [get, disposeOwner] = createRoot(() => useClock());
	check(
		"useClock() subscribes to secondchange (default granularity)",
		count("secondchange") === 1 && count("minutechange") === 0,
	);
	check(
		"the getter holds a Date synchronously (seeded — no blank first paint)",
		get() instanceof Date,
	);
	const t = new Date(2021, 5, 20, 13, 45, 30);
	fire("secondchange", t);
	check("a secondchange fire updates the getter to the event's date", get() === t);
	check(
		"the updated getter reads the fired hours/minutes/seconds",
		get().getHours() === 13 && get().getMinutes() === 45 && get().getSeconds() === 30,
	);
	disposeOwner();
	check("disposing the owner removes the secondchange listener", count("secondchange") === 0);
	check(
		"removeEventListener was called for secondchange on dispose",
		sandbox.watch.removed.indexOf("secondchange") >= 0,
	);
	const last = get();
	fire("secondchange", new Date(2000, 0, 1, 1, 1, 1));
	check("a fire after dispose does not update (listener removed)", get() === last);
}

// --- useClock("minute"): subscribes to minutechange, not secondchange ------------
{
	sandbox.watch = new WatchStub();
	const [get, disposeOwner] = createRoot(() => useClock("minute"));
	check(
		"useClock('minute') subscribes to minutechange only",
		count("minutechange") === 1 && count("secondchange") === 0,
	);
	const t = new Date(2021, 0, 1, 9, 7, 0);
	fire("minutechange", t);
	check("a minutechange fire updates the getter", get() === t && get().getMinutes() === 7);
	disposeOwner();
	check(
		"disposing removes the minutechange listener",
		count("minutechange") === 0 && sandbox.watch.removed.indexOf("minutechange") >= 0,
	);
}

// --- useClock("hour") / useClock("day"): the coarser host boundaries -------------
// WHY: the host tick service exposes hourchange/daychange too (global.js
// events; hostprobe receipt 2026-07-29) — a date-only face on "day" wakes 60x
// less than "minute". The mapping is granularity + "change", pinned here so a
// rename in either place fails loud.
{
	sandbox.watch = new WatchStub();
	const [getH, disposeH] = createRoot(() => useClock("hour"));
	check(
		"useClock('hour') subscribes to hourchange only",
		count("hourchange") === 1 && count("secondchange") === 0 && count("minutechange") === 0,
	);
	const th = new Date(2021, 0, 1, 10, 0, 0);
	fire("hourchange", th);
	check("an hourchange fire updates the getter", getH() === th);
	disposeH();
	check("disposing removes the hourchange listener", count("hourchange") === 0);

	const [getD, disposeD] = createRoot(() => useClock("day"));
	check("useClock('day') subscribes to daychange only", count("daychange") === 1);
	const td = new Date(2021, 0, 2, 0, 0, 0);
	fire("daychange", td);
	check("a daychange fire updates the getter", getD() === td);
	disposeD();
	check("disposing removes the daychange listener", count("daychange") === 0);
}

// --- useTimeParts(): default — splits the clock Date into h/m/s correctly --------
{
	sandbox.watch = new WatchStub();
	const [parts, disposeOwner] = createRoot(() => useTimeParts());
	check("useTimeParts() subscribes via useClock (secondchange)", count("secondchange") === 1);
	check(
		"hours/minutes/seconds are getter functions",
		typeof parts.hours === "function" &&
			typeof parts.minutes === "function" &&
			typeof parts.seconds === "function",
	);
	const t = new Date(2021, 2, 3, 23, 59, 58);
	fire("secondchange", t);
	check(
		"useTimeParts splits hours/minutes/seconds correctly",
		parts.hours() === 23 && parts.minutes() === 59 && parts.seconds() === 58,
	);
	disposeOwner();
	check("disposing useTimeParts removes the underlying listener", count("secondchange") === 0);
}

// --- useTimeParts("minute"): explicit granularity forwards to minutechange --------
{
	sandbox.watch = new WatchStub();
	const [parts, disposeOwner] = createRoot(() => useTimeParts("minute"));
	check(
		"useTimeParts('minute') subscribes to minutechange",
		count("minutechange") === 1 && count("secondchange") === 0,
	);
	const t = new Date(2021, 2, 3, 6, 30, 0);
	fire("minutechange", t);
	check(
		"useTimeParts('minute') still splits all three fields",
		parts.hours() === 6 && parts.minutes() === 30 && parts.seconds() === 0,
	);
	disposeOwner();
}

// --- reactivity: an effect bound to the getter re-runs on each fire, then stops ---
{
	sandbox.watch = new WatchStub();
	const seen: number[] = [];
	const [, disposeOwner] = createRoot(() => {
		const clk = useClock();
		// the effect reads the getter -> subscribes; runs once now (seed), then per fire
		effect(() => seen.push(clk().getSeconds()));
		return clk;
	});
	check("the getter drives its effect on subscribe (one seed run)", seen.length === 1);
	fire("secondchange", new Date(2021, 0, 1, 0, 0, 42));
	check("firing the tick re-runs the getter's subscribers", seen.length === 2 && seen[1] === 42);
	disposeOwner();
	fire("secondchange", new Date(2021, 0, 1, 0, 0, 43));
	check("after dispose the effect no longer runs (listener + effect gone)", seen.length === 2);
}

done();
