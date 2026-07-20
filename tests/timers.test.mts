// timers suite — runtime/timers (opt-in reactive timer hooks, behavioral). Proves:
// useInterval registers exactly one live timer, fires once per tick, tears down +
// recreates (still exactly one) when a reactive delay thunk changes, pauses to
// zero live timers on a null delay and resumes on a number, and clears both via
// the returned cancel() AND on owner dispose. useTimeout fires the callback
// EXACTLY once across many ticks and then the timer is gone (it clearInterval's
// itself — setTimeout is not assumed on device), never fires on a null delay, is
// stopped by cancel() before the tick, re-arms on a reactive delay change, and
// clears on owner dispose. Every prop branch (static number / static null /
// reactive thunk), every clear/arm edge, and the clamp-free defaults are covered
// for 100% line/branch/function coverage.
//
// Timers are the harness's controllable stubs: setInterval stores the fn, tick(n)
// fires every LIVE interval n times (it ignores real ms), liveTimers() is the live
// count. No Style/Skin stubs and no screen size are needed — timers builds no host
// objects and reads no screen dimension. Each block disposes its owner (or the
// one-shot self-clears) so liveTimers()/tick() stay isolated block to block.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, tick, liveTimers, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { useInterval, useTimeout } = await loadModule("runtime/timers");
const { check, done } = makeChecker("timers");

// --- useInterval, static number: one live timer, fires per tick, cancel clears ---
{
	let calls = 0;
	const [cancel, disposeOwner] = createRoot(() => useInterval(() => calls++, 100));
	check("useInterval registers exactly one live timer", liveTimers() === 1);
	check("useInterval returns a cancel function", typeof cancel === "function");
	tick(3);
	check("tick(3) fires the callback three times", calls === 3);
	cancel();
	check("cancel() clears the interval (no live timer)", liveTimers() === 0);
	tick(2);
	check("a cancelled interval never fires again", calls === 3);
	cancel(); // idempotent — clear()'s current===null branch is a no-op
	check("cancel() is idempotent (still no live timer)", liveTimers() === 0);
	disposeOwner();
}

// --- useInterval, reactive thunk: recreate on change, pause on null, resume -------
{
	let calls = 0;
	const d = signal(100);
	const [, disposeOwner] = createRoot(() =>
		useInterval(
			() => calls++,
			() => d.value,
		),
	);
	check("reactive useInterval starts exactly one live timer", liveTimers() === 1);
	tick(1);
	check("reactive useInterval fires", calls === 1);
	// changing the delay tears the old timer down + recreates it: STILL exactly one
	d.value = 50;
	check("a reactive delay change keeps exactly one live timer", liveTimers() === 1);
	tick(2);
	check("the recreated timer still fires", calls === 3);
	// null pauses: no live timer, no fires
	d.value = null;
	check("a null delay pauses to zero live timers", liveTimers() === 0);
	tick(3);
	check("a paused interval does not fire", calls === 3);
	// a number resumes it
	d.value = 200;
	check("a non-null delay resumes exactly one live timer", liveTimers() === 1);
	tick(1);
	check("the resumed interval fires again", calls === 4);
	// disposing the owner clears the live timer
	disposeOwner();
	check("disposing the owner clears the reactive interval", liveTimers() === 0);
	tick(3);
	check("a disposed interval never fires", calls === 4);
}

// --- useInterval, static null: arms nothing, never fires -------------------------
{
	let calls = 0;
	const [, disposeOwner] = createRoot(() => useInterval(() => calls++, null));
	check("useInterval(null) arms no timer", liveTimers() === 0);
	tick(3);
	check("a null-delay interval never fires", calls === 0);
	disposeOwner();
	check("disposing a null-delay interval owner is a no-op", liveTimers() === 0);
}

// --- useInterval, static number: owner dispose stops it (independent of cancel) ---
{
	let calls = 0;
	const [, disposeOwner] = createRoot(() => useInterval(() => calls++, 100));
	check("owner holds one live interval before dispose", liveTimers() === 1);
	disposeOwner();
	check("disposing the owner clears a static interval", liveTimers() === 0);
	tick(3);
	check("the disposed static interval never fires", calls === 0);
}

// --- useTimeout, static number: fires exactly once across many ticks, then gone --
{
	let calls = 0;
	const [cancel, disposeOwner] = createRoot(() => useTimeout(() => calls++, 100));
	check("useTimeout arms exactly one live timer", liveTimers() === 1);
	check("useTimeout returns a cancel function", typeof cancel === "function");
	tick(5);
	check("useTimeout fires its callback exactly once across tick(5)", calls === 1);
	check("useTimeout self-clears after firing (no live timer)", liveTimers() === 0);
	disposeOwner();
}

// --- useTimeout, static null: never fires ----------------------------------------
{
	let calls = 0;
	const [, disposeOwner] = createRoot(() => useTimeout(() => calls++, null));
	check("useTimeout(null) arms no timer", liveTimers() === 0);
	tick(5);
	check("a null-delay timeout never fires", calls === 0);
	disposeOwner();
}

// --- useTimeout, cancel before the tick prevents the fire ------------------------
{
	let calls = 0;
	const [cancel, disposeOwner] = createRoot(() => useTimeout(() => calls++, 100));
	cancel();
	check("cancel() before firing clears the timeout", liveTimers() === 0);
	tick(5);
	check("a cancelled timeout never fires", calls === 0);
	disposeOwner();
}

// --- useTimeout, reactive thunk: re-arms on change, then fires exactly once -------
{
	let calls = 0;
	const d = signal(100);
	const [, disposeOwner] = createRoot(() =>
		useTimeout(
			() => calls++,
			() => d.value,
		),
	);
	check("reactive useTimeout arms one live timer", liveTimers() === 1);
	// change the delay BEFORE it fires → the pending one-shot re-arms: still one
	d.value = 50;
	check("a reactive delay change re-arms (still exactly one live timer)", liveTimers() === 1);
	tick(5);
	check("the re-armed timeout fires exactly once", calls === 1);
	check("it self-clears after firing", liveTimers() === 0);
	disposeOwner();
}

// --- useTimeout, reactive null pauses a pending one-shot; dispose clears pending --
{
	let calls = 0;
	const d = signal(100);
	const [, disposeOwner] = createRoot(() =>
		useTimeout(
			() => calls++,
			() => d.value,
		),
	);
	check("reactive useTimeout has one live pending timer", liveTimers() === 1);
	// null pauses a still-pending reactive timeout
	d.value = null;
	check("a reactive null delay clears the pending timeout", liveTimers() === 0);
	tick(3);
	check("a paused reactive timeout does not fire", calls === 0);
	// a number re-arms it; then dispose while pending clears it
	d.value = 200;
	check("a non-null delay re-arms the reactive timeout", liveTimers() === 1);
	disposeOwner();
	check("disposing the owner clears a pending timeout", liveTimers() === 0);
	tick(5);
	check("a disposed pending timeout never fires", calls === 0);
}

done();
