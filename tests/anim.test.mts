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
const { useTween, useSequence, useSpring, withDelay, withRepeat, yoyo } =
	await loadModule("runtime/anim");
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

// === useSequence — keyframe chaining on one owned timer =============================
// --- basic move: eases 0->99 over 99ms (3 ticks), lands EXACTLY, releases timer -----
{
	const [x, dispose] = createRoot(() => useSequence([{ to: 99, ms: 99 }]));
	check("sequence rests at the start value before ticking", x() === 0);
	check("a non-empty sequence arms exactly one timer", liveTimers() === 1);
	tick(1); // elapsed 33 -> linear 99*(1/3)
	check("the sequence advances toward the first target", Math.abs(x() - 33) < 1e-9);
	tick(2); // elapsed 99 >= total -> lands on 99, releases
	check("the sequence lands EXACTLY on the final value", x() === 99);
	check("the timer is released once the sequence completes", liveTimers() === 0);
	dispose();
}

// --- move + hold + eased return; default ms (300) when omitted; from option ---------
{
	// step 2 omits ms -> defaults to 300; opts.from seeds the resting/first value.
	const [x, dispose] = createRoot(() =>
		useSequence([{ to: 100, ms: 99 }, { hold: 99 }, { to: 0 }], { from: 10 }),
	);
	check("opts.from seeds the resting value", x() === 10);
	tick(3); // elapsed 99 -> end of move 1 (past its 99) still within plan -> ~100
	check("the first move reaches its target", Math.abs(x() - 100) < 1e-6);
	tick(3); // elapsed 198 -> inside the hold (99..198) -> stays at 100
	check("a hold step keeps the value put", x() === 100);
	tick(10); // elapsed 528 >= total 498 -> lands on 0
	check("the defaulted-duration final move settles at 0", x() === 0);
	check("the timer releases after the whole chain", liveTimers() === 0);
	dispose();
}

// --- loop: wraps modulo total forever; zero-duration hold is skipped by the reader --
{
	// a leading {hold:0} is a zero-length segment -> valueAt's `dur<=0` skip path.
	const [x, dispose] = createRoot(() =>
		useSequence([{ hold: 0 }, { to: 90, ms: 99 }], { loop: true }),
	);
	tick(1); // elapsed 33 -> skips the 0-hold, eases in seg2 -> 30
	check("loop skips a zero-length segment and eases the next", Math.abs(x() - 30) < 1e-9);
	tick(20); // many wraps
	check("a looping sequence never releases its timer", liveTimers() === 1);
	check("the looping value stays within range", x() >= 0 && x() <= 90);
	dispose();
	check("disposing the owner stops the looping sequence", liveTimers() === 0);
}

// --- empty steps: constant getter, no timer (zero-cost path) -------------------------
{
	const [x, dispose] = createRoot(() => useSequence([], { from: 7 }));
	check("an empty sequence returns the constant from-value", x() === 7);
	check("an empty sequence arms no timer", liveTimers() === 0);
	dispose();
}

// --- manual stop() releases the timer mid-flight ------------------------------------
{
	const [x, dispose] = createRoot(() => useSequence([{ to: 100, ms: 9999 }]));
	check("a long sequence holds one timer", liveTimers() === 1);
	x.stop();
	check("stop() releases the sequence timer by hand", liveTimers() === 0);
	dispose();
}

// === useSpring — physics motion toward a target ====================================
// --- bare number, no `from`: rests, no motion, no timer (the zero-cost path) --------
{
	const [x, dispose] = createRoot(() => useSpring(50));
	check("a bare-number spring rests at the target", x() === 50);
	check("a resting spring arms no timer", liveTimers() === 0);
	tick(5);
	check("a resting spring never moves", x() === 50);
	dispose();
}

// --- bare number + from: springs from `from` to the target, settles, releases -------
{
	const [x, dispose] = createRoot(() => useSpring(100, { from: 0 }));
	check("a spring with `from` starts there", x() === 0);
	check("a moving spring arms one timer", liveTimers() === 1);
	tick(1);
	check("the spring accelerates away from the origin", x() > 0);
	tick(150); // near-critical damping settles well within this
	check("the spring settles exactly on the target", x() === 100);
	check("the spring releases its timer once settled", liveTimers() === 0);
	dispose();
}

// --- thunk target: reactive, no motion until change, then springs to the new goal ---
{
	const a = signal(0);
	const [x, dispose] = createRoot(() => useSpring(() => a.value));
	check("a thunk spring rests at its initial target", x() === 0);
	check("no motion (or timer) until the target changes", liveTimers() === 0);
	a.value = 80; // reactive re-aim
	check("a target change arms the spring timer", liveTimers() === 1);
	tick(150);
	check("the spring reaches the new target", x() === 80);
	check("the spring releases after settling", liveTimers() === 0);
	dispose();
}

// === combinators — pure SeqStep[] transforms (no timer, no signal) ==================
{
	const d = withDelay(50, [{ to: 100, ms: 100 }]);
	check("withDelay prepends a hold", d.length === 2 && "hold" in d[0] && d[0].hold === 50);

	const r = withRepeat([{ to: 100, ms: 100 }], 2);
	check("withRepeat expands N copies", r.length === 2 && r.every((s) => "to" in s && s.to === 100));

	// yoyo reverses odd passes: forward move -> back toward 0
	const y = withRepeat([{ to: 100, ms: 100 }], 2, true);
	check(
		"withRepeat yoyo reverses the odd pass back to the origin",
		y.length === 2 && "to" in y[1] && y[1].to === 0,
	);

	// a hold inside a yoyo'd list survives the reversal (covers the hold branch)
	const yh = withRepeat([{ to: 100, ms: 100 }, { hold: 40 }], 2, true);
	check("a hold survives yoyo reversal", yh.length === 4 && "hold" in yh[2] && yh[2].hold === 40);

	// two moves: the reversed pass re-aims each move at the PREVIOUS target (mi>0)
	const two = withRepeat(
		[
			{ to: 100, ms: 80 },
			{ to: 50, ms: 60 },
		],
		2,
		true,
	);
	// forward [->100,->50], reversed [->100,->0]  (retrace the path home)
	check(
		"a multi-move yoyo retraces the path (mi>0 branch)",
		"to" in two[2] && two[2].to === 100 && "to" in two[3] && two[3].to === 0,
	);

	const yy = yoyo([{ to: 60, ms: 60 }]);
	// the reverse of the FIRST move carries `home` — it resolves to the sequence's
	// own start inside planSequence, not to a hard-coded 0 (codex P2)
	check(
		"yoyo is forward-then-reverse, the return leg flagged home",
		yy.length === 2 && "to" in yy[1] && yy[1].home === true,
	);
}

// --- round 13: an explicit `ms: 0` is a ZERO-duration keyframe, not the default -
// `s.ms && s.ms > 0 ? s.ms : 300` treated 0 as "omitted", so a caller asking for
// an instant jump got a 300 ms animation and a live timer (codex P2).
{
	const [get, dispose] = createRoot(() => useSequence([{ to: 100, ms: 0 }]));
	check("a zero-duration move lands immediately", get() === 100);
	check("…and arms no timer", liveTimers() === 0);
	dispose();
	const [neg, dn] = createRoot(() => useSequence([{ to: 50, ms: -20 }]));
	check("a negative duration clamps to zero the same way", neg() === 50);
	dn();
	const [def, dd] = createRoot(() => useSequence([{ to: 30 }]));
	check("an OMITTED ms still takes the 300ms default", def() === 0 && liveTimers() === 1);
	dd();
}

// --- round 13: yoyo returns to the sequence's own `from`, not to 0 -----------
{
	const [get, dispose] = createRoot(() => useSequence(yoyo([{ to: 100, ms: 66 }]), { from: 50 }));
	check("the yoyo starts at from", get() === 50);
	tick(2); // forward leg complete (66ms at STEP 33)
	check("the forward leg reaches the target", get() === 100);
	tick(2); // reverse leg complete
	check("the reverse leg returns to from (50), not to 0", get() === 50);
	dispose();
}

// --- round 13: a non-positive spring mass/precision never settled ------------
// mass 0 -> a = Infinity -> v = NaN, and every NaN comparison is false, so the
// 33ms interval ran forever; precision 0 makes `< precision` unsatisfiable and
// even armed a timer at rest (codex P2). Both clamp to the default now.
{
	const [get, dispose] = createRoot(() => useSpring(100, { from: 0, mass: 0 }));
	tick(200);
	check("mass:0 still settles on the target", get() === 100);
	check("…and releases its timer", liveTimers() === 0);
	dispose();
	const [rest, dr] = createRoot(() => useSpring(100, { precision: 0 }));
	check("precision:0 at rest arms no timer at all", liveTimers() === 0 && rest() === 100);
	dr();
	// a VALID positive value is still honoured (a coarse precision settles sooner)
	const [coarse, dc] = createRoot(() => useSpring(100, { from: 0, mass: 2, precision: 5 }));
	tick(200);
	check("an explicit finite mass/precision still settles", coarse() === 100);
	dc();
	// non-finite is rejected the same way as non-positive
	const [inf, di] = createRoot(() => useSpring(100, { from: 0, mass: Infinity }));
	tick(200);
	check("mass:Infinity clamps to the default and settles", inf() === 100);
	di();
}

done();
