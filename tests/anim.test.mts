// anim suite — runtime/anim (opt-in tween hook; useTween composes flow's animate).
// Proves: a BARE-number target returns a constant getter with NO live timer; a
// THUNK target settles at the initial value on mount (no motion, no timer), and on
// a target change eases from the old value toward the new across tick(n) and
// reaches it, arming exactly ONE shared native timer that releases on settle;
// retargeting MID-FLIGHT starts the new tween from the current PARTIAL value (no
// jump back to the origin); the default duration (300) and linear easing apply when
// opts is omitted while an explicit `easing` bends the progression away from linear;
// and the live tween is stopped both on natural completion AND when the owning root
// is disposed mid-flight. Every branch (bare vs thunk, opts present vs absent,
// easing present vs absent, mount-skip vs animate, tween null vs live) is covered
// for 100% line/branch/function coverage.
//
// Timers are the harness's controllable stubs: setInterval stores the fn, tick(n)
// fires every LIVE interval n times (ignoring real ms), liveTimers() is the live
// count. useTween builds no host objects and reads no screen, so — like the timers
// suite — no Style/Skin stubs or screen size are needed. STEP is 33ms (flow's
// shared ticker), so a 99ms tween settles in 3 ticks; the assertions use that. Each
// block disposes its owner (or completes its tween) so liveTimers()/tick() stay
// isolated block to block.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, tick, liveTimers, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { useTween } = await loadModule("runtime/anim");
const { check, done } = makeChecker("anim");

// --- bare number: constant getter, no tween, no timer ----------------------------
{
	const [get, dispose] = createRoot(() => useTween(42));
	check("bare number returns the constant getter", get() === 42);
	check("bare number arms no timer", liveTimers() === 0);
	tick(3);
	check("bare number never moves across ticks", get() === 42);
	dispose();
	check("disposing a bare-number tween owner is a clean no-op", liveTimers() === 0);
}

// --- thunk: settle at first on mount, then ease to a new target + release timer ---
{
	const a = signal(0);
	// duration 99, STEP 33 -> 3 ticks to settle.
	const [get, dispose] = createRoot(() => useTween(() => a.value, { duration: 99 }));
	check("thunk settles at the first value on mount (no motion)", get() === 0);
	check("no live timer on mount (settled, not animating)", liveTimers() === 0);
	a.value = 100; // retarget -> animate(0, 100, 99)
	check("a target change arms exactly one shared timer", liveTimers() === 1);
	check("still at the start right after retarget (no tick yet)", get() === 0);
	tick(1); // elapsed 33, p=1/3 -> 33.33
	const p1 = get();
	check("the value moves from the old value toward the new", p1 > 0 && p1 < 100);
	tick(2); // elapsed 99 -> p=1 -> 100, completes
	check("the value reaches the target", get() === 100);
	check("the timer is released once the tween settles", liveTimers() === 0);
	dispose();
}

// --- mid-flight dispose: owner teardown stops the LIVE tween ----------------------
{
	const a = signal(0);
	const [, dispose] = createRoot(() => useTween(() => a.value, { duration: 9999 }));
	a.value = 100; // long tween, still in flight
	check("a live tween holds one timer before dispose", liveTimers() === 1);
	dispose(); // owner dispose -> effect disposed -> animate's tracked stop drains
	check("disposing the owner stops the live tween", liveTimers() === 0);
	tick(5);
	check("a disposed tween never advances again", liveTimers() === 0);
}

// --- retarget mid-flight starts from the PARTIAL value (no jump back to origin) ---
{
	const a = signal(0);
	const [get, dispose] = createRoot(() => useTween(() => a.value, { duration: 99 }));
	a.value = 100; // animate(0, 100, 99)
	tick(1); // partial: elapsed 33, p=1/3 -> 33.33
	const mid = get();
	check("captured a partial value mid-flight", mid > 0 && mid < 100);
	a.value = 50; // retarget mid-flight -> animate(mid, 50, 99)
	check("the new tween starts from the PARTIAL value, not the origin", get() === mid);
	check("a mid-flight retarget still holds exactly one timer", liveTimers() === 1);
	tick(1); // elapsed 33, p=1/3 -> mid + (50-mid)/3
	const p2 = get();
	check("it eases from the partial value toward the new target", p2 > mid && p2 < 50);
	tick(2); // completes
	check("it reaches the new target", get() === 50);
	check("the timer is released after the retargeted tween settles", liveTimers() === 0);
	dispose();
}

// --- default opts: duration 300 + linear easing when opts / easing are omitted ----
{
	const a = signal(0);
	const [get, dispose] = createRoot(() => useTween(() => a.value)); // no opts -> 300ms, linear
	check("default-opts thunk settles at first on mount", get() === 0);
	a.value = 300; // animate(0, 300, 300) linear; STEP 33 -> 10 ticks
	tick(1); // elapsed 33, linear -> 300 * 33/300 === 33
	const p = get();
	check("a default-duration tween advances", p > 0 && p < 300);
	check("undefined easing is linear (exact linear position)", Math.abs(p - 33) < 1e-9);
	tick(9); // elapsed 330 >= 300 -> completes
	check("the default-duration tween reaches the target", get() === 300);
	check("the default-duration timer is released on settle", liveTimers() === 0);
	dispose();
}

// --- easing option bends the progression away from linear -------------------------
{
	// same 0->90 move + duration; linear (default) vs quadIn — compare at one tick.
	const la = signal(0);
	const [lget, ld] = createRoot(() => useTween(() => la.value, { duration: 99 }));
	la.value = 90;
	const ea = signal(0);
	const [eget, ed] = createRoot(() =>
		useTween(() => ea.value, { duration: 99, easing: (t) => t * t }),
	);
	ea.value = 90;
	tick(1); // both: elapsed 33, p=1/3. linear -> 30; quadIn -> 90 * (1/9) = 10
	const lv = lget();
	const ev = eget();
	check("the linear tween is at the linear position (90/3)", Math.abs(lv - 30) < 1e-9);
	check("the eased tween lags linear at the same tick (non-linear)", ev < lv);
	check("the eased tween matches the quadratic curve (90/9)", Math.abs(ev - 10) < 1e-9);
	ld();
	ed();
	check("both eased/linear owners dispose cleanly", liveTimers() === 0);
}

done();
