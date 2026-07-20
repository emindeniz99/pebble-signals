// state suite — runtime/state (opt-in ergonomic state hooks, pure logic). Proves:
// useToggle defaults to false, flips both ways via toggle(), and sets via
// setValue(); an explicit initial is honored. useCounter defaults to 0 with an
// unbounded step-1 inc/dec/set/reset, and with { step, min, max } clamps inc/dec
// AND set in BOTH directions, clamps the INITIAL at construction (so count() is
// never out of range), defaults step to 1 when opts omits it, and reset()
// restores clamp(initial) (not the raw out-of-range initial). useDebounce seeds
// from the current source, holds the OLD value until the delay elapses then
// settles to the NEW one (drive a signal + tick), collapses a burst of changes
// to only the LAST, keeps exactly one live timer across a change (prev cancelled,
// new armed), self-clears after firing, and auto-cancels a pending settle when
// its owner is disposed. Every prop branch (toggle/counter defaults vs overrides,
// opts present/absent, step present/absent, min/max present/absent, clamp both
// directions and the in-range fall-through) is covered for 100% line/branch/
// function coverage.
//
// Timers are the harness's controllable stubs (useDebounce composes useTimeout):
// setInterval stores the fn, tick(n) fires every LIVE interval n times, and
// liveTimers() is the live count — so the settle is driven deterministically.
// No Style/Skin stubs and no screen size are needed — state builds no host
// objects and reads no screen dimension. Each debounce block ends disposed (or
// self-cleared) so liveTimers()/tick() stay isolated block to block; the
// toggle/counter blocks create no timers or effects, so nothing leaks between.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, tick, liveTimers, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { useToggle, useCounter, useDebounce } = await loadModule("runtime/state");
const { check, done } = makeChecker("state");

// --- useToggle, default initial: flip both ways + setValue ------------------
{
	const [[on, toggle, setOn]] = createRoot(() => useToggle());
	check("useToggle defaults to false", on() === false);
	toggle();
	check("toggle() flips false -> true", on() === true);
	toggle();
	check("toggle() flips true -> false", on() === false);
	setOn(true);
	check("setValue(true) sets true", on() === true);
	setOn(false);
	check("setValue(false) sets false", on() === false);
}

// --- useToggle, explicit initial: honored -----------------------------------
{
	const [[on]] = createRoot(() => useToggle(true));
	check("useToggle(true) starts true", on() === true);
}

// --- useCounter, no opts: default initial 0, step 1, unbounded --------------
{
	const [[count, c]] = createRoot(() => useCounter());
	check("useCounter defaults to 0", count() === 0);
	c.inc();
	check("inc with the default step adds 1", count() === 1);
	c.inc();
	check("inc again -> 2", count() === 2);
	c.dec();
	check("dec with the default step subtracts 1", count() === 1);
	c.set(50);
	check("set with no bounds is exact", count() === 50);
	c.dec();
	check("dec is unbounded below with no min", count() === 49);
	c.reset();
	check("reset with no bounds restores the raw initial (0)", count() === 0);
}

// --- useCounter, step + min + max: clamp inc/dec/set BOTH directions --------
{
	const [[count, c]] = createRoot(() => useCounter(5, { step: 3, min: 0, max: 10 }));
	check("counter starts at the (in-range) initial 5", count() === 5);
	c.inc();
	check("inc adds step (5+3=8)", count() === 8);
	c.inc();
	check("inc clamps up to max (8+3=11 -> 10)", count() === 10);
	c.dec();
	check("dec subtracts step (10-3=7)", count() === 7);
	c.set(-100);
	check("set clamps up to min (-100 -> 0)", count() === 0);
	c.set(100);
	check("set clamps down to max (100 -> 10)", count() === 10);
	c.set(4);
	check("set within range is exact (4)", count() === 4);
	c.reset();
	check("reset restores clamp(initial) (5)", count() === 5);
}

// --- useCounter, opts without step: initial clamped at construction; reset --
// clamps; step defaults to 1 despite an opts object being present ------------
{
	const [[count, c]] = createRoot(() => useCounter(100, { min: 0, max: 10 }));
	check("an out-of-range initial is clamped at construction (100 -> 10)", count() === 10);
	c.dec();
	check("dec uses the default step 1 when opts omits step (10-1=9)", count() === 9);
	c.reset();
	check("reset restores clamp(initial) = 10, never the raw 100", count() === 10);
}

// --- useDebounce: OLD before the delay, NEW after (drive a signal + tick) ----
{
	const src = signal("A");
	const [debounced, disposeOwner] = createRoot(() => useDebounce(() => src.value, 100));
	check("useDebounce seeds from the current source", debounced() === "A");
	check("construction arms exactly one live timer", liveTimers() === 1);
	src.value = "B";
	check(
		"a source change keeps exactly one live timer (prev cancelled, new armed)",
		liveTimers() === 1,
	);
	check("before the delay elapses the debounced value is still OLD", debounced() === "A");
	tick(1);
	check("after the delay the debounced value is NEW", debounced() === "B");
	check("the settle timeout self-cleared after firing", liveTimers() === 0);
	disposeOwner();
	check("disposing after a settle leaves no live timer", liveTimers() === 0);
}

// --- useDebounce: a burst of changes settles to the LAST value only ----------
{
	const src = signal(0);
	const [debounced, disposeOwner] = createRoot(() => useDebounce(() => src.value, 100));
	check("useDebounce seeds 0", debounced() === 0);
	src.value = 1; // arms a settle for 1 (initial settle cancelled by the re-run)
	src.value = 2; // cancels the settle for 1, arms one for 2
	check("a burst of changes leaves exactly one pending timer", liveTimers() === 1);
	check("the debounced value has not moved yet", debounced() === 0);
	tick(1);
	check("the debounce settles to the LAST value only (2, never 1)", debounced() === 2);
	check("the settled debounce holds no live timer", liveTimers() === 0);
	disposeOwner();
}

// --- useDebounce: a pending settle auto-cancels on owner dispose -------------
{
	const src = signal(0);
	const [debounced, disposeOwner] = createRoot(() => useDebounce(() => src.value, 100));
	src.value = 5; // arm a pending settle
	check("a pending debounce holds one live timer", liveTimers() === 1);
	disposeOwner();
	check("disposing the owner clears the pending debounce timer", liveTimers() === 0);
	tick(3);
	check("a disposed debounce never settles (value stays at the seed)", debounced() === 0);
}

done();
