// Tween hook — the opt-in `runtime/anim` module. OPT-IN & ZERO-COST: an app that
// never imports `runtime/anim` never ships it (the manifest prunes to the import
// closure — README tree-shaking), so this module costs non-users nothing.
//
// WHAT (Rule 2 — no new substrate): RN Reanimated's `withTiming`, given Solid
// ownership. `useTween(target, opts?)` returns a getter `() => number` that eases
// toward `target` over `duration` ms on every target change. It owns NO Piu node
// and NO timer of its own — it COMPOSES flow.ts's `animate()`, whose shared ~30fps
// ticker drives every live tween on ONE native timer (N useTweens => one timer,
// not N; see flow's `animate`/`tickAll`).
//
// THE IDIOM (idiom 5b — one driving effect):
//  - a BARE-number target is CONSTANT: `useTween(42)` returns `() => 42` — no
//    effect, no signal, no timer. The right zero-cost shape for a value that never
//    moves (and the reason `target` is a UNION, not always a thunk).
//  - a THUNK target is REACTIVE: ONE effect reads `target()` (tracked) and, on
//    each CHANGE, stops the in-flight tween and starts a fresh `animate()` from the
//    CURRENT eased value. The `from` read is `untrack`ed so the effect subscribes
//    to `target()` ONLY — reading the tween's own output tracked would make the
//    effect re-run on its own per-tick writes and loop (the self-feeding effect).
//  - the FIRST (mount) run SETTLES at the initial value without animating — there
//    is nothing to ease from yet, so the first paint shows the target, no motion.
//  - retargeting MID-FLIGHT starts the new tween from the current PARTIAL value, so
//    a rapid target change glides on instead of snapping back to the origin.
//
// TEARDOWN (mirrors flow.ts's animate() / timers.ts exactly): `animate()` already
// `track()`s its own `.stop()` with the running owner — and here that owner is the
// driving effect. So (a) each re-run's `unsubscribe` auto-stops the PREVIOUS tween
// before `from` is read (the explicit `.stop()` below is then an idempotent
// belt-and-braces), and (b) disposing the screen disposes the effect, which stops
// the live tween — no leaked native timer on navigate-away.
//
// GOTCHA — FRESH SIGNAL PER TWEEN, RE-SUBSCRIBE TO FOLLOW A RETARGET: `animate()`
// mints a NEW backing signal for each tween, so the returned getter's identity is
// stable but the signal it READS changes on every retarget. A binding that reads
// ONLY `value()` subscribes to the current tween's signal and follows its ticks —
// but it will NOT re-point at the next tween's signal on a retarget by itself. Make
// the SAME binding also read whatever drives the target (e.g. `() => (i(),
// value())`) so it re-runs on the change and re-subscribes to the fresh signal. See
// src/tsx/examples/anim.tsx.
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): every signal/effect/timer is created INSIDE
// the hook at call time — this module constructs NOTHING at top level, so there is
// nothing to freeze into a broken preload instance, and the one export is a
// `function` declaration exactly like flow.ts's animate().
import { effect, signal, track, untrack } from "runtime/signals";
import { animate, type Tween } from "runtime/flow";

// ~30fps, mirroring flow.ts's private ticker cadence (STEP=33): the memory-LCD
// flush rate, not the CPU, is the limiter and 30fps is the classic Pebble
// animation cadence. useSequence/useSpring each own ONE setInterval at this
// cadence (the timers.ts teardown contract), rather than surgery on flow's
// shared ticker whose completion-cascade index math is delicate — the sharing
// win is deferred (each opt-in hook = one timer; documented tradeoff).
const STEP = 33;
const linear = (t: number): number => t;

/** Options for {@link useTween}. */
export type TweenOptions = {
	/**
	 * Ease duration in ms. Defaults to 300. A value `<= 0` completes in a single
	 * ~30fps tick (flow's `animate` clamps the duration to 1ms).
	 */
	duration?: number;
	/**
	 * Progress curve mapping `t` in [0,1] to [0,1]. Defaults to linear. Pass a
	 * `runtime/easing` curve (e.g. `quadInOut`) for RN-style timing.
	 */
	easing?: (t: number) => number;
};

/**
 * useTween(target, opts?) — smoothly eases a value toward `target` over `duration`
 * ms on each change: the RN Reanimated `withTiming` analog with Solid ownership.
 * Returns a getter `() => number`; read it in a binding to drive UI.
 *
 *   const [i, setI] = useState(0);
 *   const value = useTween(() => targets[i()], { duration: 500, easing: quadInOut });
 *   // read i() too, so the binding re-subscribes to the fresh tween signal on retarget:
 *   <Label string={() => { i(); return String(Math.round(value())); }} />
 *
 * A BARE-number `target` is CONSTANT — `useTween(42)` returns `() => 42` with no
 * effect, signal or timer (zero cost). A THUNK `target` is REACTIVE: ONE effect
 * tracks it and, on each change, stops the in-flight tween and starts a fresh
 * `animate()` from the CURRENT eased value — so a mid-flight retarget glides on from
 * the partial value and never snaps back to the origin. The first (mount) run
 * settles at the initial value without animating. Composes flow's `animate()`,
 * which `track()`s its own stop with the owning effect, so the tween auto-stops when
 * the screen is disposed. See the module header for the re-subscribe gotcha.
 */
export function useTween(target: number | (() => number), opts?: TweenOptions): () => number {
	// A bare number never moves: hand back a constant getter — no effect, no signal,
	// no timer (the zero-cost path).
	if (typeof target === "number") return () => target;
	const duration = opts?.duration ?? 300;
	const easing = opts?.easing;
	// Settle at the initial value WITHOUT subscribing (untrack): the first paint
	// shows the target, no motion. `tween` holds the in-flight animate() tween (null
	// until the first change); `get` reads it, falling back to `first`.
	const first = untrack(target);
	let tween: Tween | null = null;
	let mounted = false;
	const get = (): number => (tween ? tween() : first);
	// ONE driving effect (idiom 5b): its ONLY dependency is `target()`. The `from`
	// read below is untracked, or the effect would subscribe to the very tween it
	// drives and re-run on every tick — a self-feeding loop.
	effect(() => {
		const to = target(); // tracked — the sole dependency
		if (!mounted) {
			// mount run: settle at `first`, do NOT animate (nothing to ease from).
			mounted = true;
			return;
		}
		// start from the CURRENT eased value so a mid-flight retarget glides on from
		// the partial value (untrack: never subscribe to the tween's own output).
		const from = untrack(get);
		// stop the outgoing tween. animate()'s owner-drain already stopped it on this
		// re-run (its stop is tracked to THIS effect), so this is idempotent.
		if (tween) tween.stop();
		tween = animate(from, to, duration, easing);
	});
	return get;
}

/**
 * A single {@link useSequence} keyframe: either a MOVE (`to`, over `ms` with an
 * optional `ease` curve) or a HOLD (stay put for `hold` ms). The sequence walks
 * these in order, each move starting where the previous step left off.
 */
export type SeqStep =
	| {
			to: number;
			ms?: number;
			ease?: (t: number) => number;
			/**
			 * INTERNAL (set by {@link yoyo}/{@link withRepeat}'s reverse pass): re-aim
			 * this move at the sequence's own start value instead of `to`. The reverse
			 * of the FIRST move has no earlier target to return to, and hard-coding 0
			 * made `useSequence(yoyo([{ to: 100 }]), { from: 50 })` finish at 0 —
			 * breaking the out-and-back contract and making every loop jump (codex P2).
			 */
			home?: true;
	  }
	| { hold: number };

/** Options for {@link useSequence}. */
export type SequenceOptions = {
	/** Value the first move eases FROM (and the resting value before it). Default 0. */
	from?: number;
	/** Restart from the top when the last step finishes (looped motion). Default false. */
	loop?: boolean;
};

// Precompute the piecewise segments once: a flat [from,to,t0,dur,ease] list the
// per-tick reader indexes by elapsed ms. A move with `ms<=0` (or a `hold<=0`) is
// a zero-duration segment — skipped by the reader, so it never divides by zero.
type Seg = { from: number; to: number; t0: number; dur: number; ease: (t: number) => number };
const planSequence = (steps: SeqStep[], start: number): { segs: Seg[]; total: number } => {
	const segs: Seg[] = [];
	let cur = start;
	let t0 = 0;
	for (const s of steps) {
		if ("hold" in s) {
			const dur = s.hold > 0 ? s.hold : 0;
			segs.push({ from: cur, to: cur, t0, dur, ease: linear });
			t0 += dur;
		} else {
			// `ms` OMITTED takes the 300 ms default; an explicit non-positive `ms`
			// is the zero-duration keyframe the header promises. Treating `ms: 0`
			// as "missing" substituted 300 ms, so a caller asking for an instant
			// jump got an animation and a live timer instead (codex P2).
			const dur = s.ms === undefined ? 300 : s.ms > 0 ? s.ms : 0;
			const to = s.home ? start : s.to;
			segs.push({ from: cur, to, t0, dur, ease: s.ease || linear });
			cur = to;
			t0 += dur;
		}
	}
	return { segs, total: t0 };
};

/**
 * useSequence(steps, opts?) — chain keyframes into one motion on the device's
 * single interval timer: the RN Reanimated `withSequence` analog with Solid
 * ownership. Returns a getter `() => number`; read it in a binding to drive UI.
 *
 *   const x = useSequence([{ to: 100, ms: 200 }, { hold: 300 }, { to: 0, ms: 400, ease: quadInOut }]);
 *   <Label string={() => String(Math.round(x()))} />
 *
 * Each move eases FROM where the previous step ended (the first from `opts.from`,
 * default 0); a `{ hold: ms }` step stays put. The steps are planned into a flat
 * segment list ONCE at call time; ONE `setInterval` (~30fps) advances elapsed ms
 * and writes the piecewise-eased value into a signal. Non-looping, it settles on
 * the final value and releases the timer; `opts.loop` wraps elapsed modulo the
 * total and never stops. The timer is auto-cleared when the owning screen is
 * disposed (the timers.ts `track(clear)` contract); the returned getter carries a
 * manual `.stop()`. Zero module scope — the signal, timer and plan are all built
 * inside the call (Rule 5). Feed it {@link withDelay}/{@link withRepeat}/{@link yoyo}.
 */
export function useSequence(
	steps: SeqStep[],
	opts?: SequenceOptions,
): (() => number) & { stop: () => void } {
	const start = opts?.from ?? 0;
	const loop = !!opts?.loop;
	const { segs, total } = planSequence(steps, start);
	// The resting value if there is nothing to animate (no steps, or all
	// zero-duration): a constant getter, no timer (the zero-cost path).
	const settledValue = segs.length ? segs[segs.length - 1].to : start;
	const s = signal(start);
	const get = (() => s.value as number) as (() => number) & { stop: () => void };
	let current: number | null = null;
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	get.stop = clear;
	track(clear); // stop on owner dispose (mirrors animate()/timers.ts)
	if (total <= 0) {
		// nothing moves — settle immediately, arm no timer.
		s.value = settledValue;
		return get;
	}
	// Value at cumulative elapsed `e` ms across the segment list.
	const valueAt = (e: number): number => {
		for (let i = 0; i < segs.length; i++) {
			const g = segs[i];
			if (g.dur <= 0) continue; // zero-length (hold 0 / ms<=0) — never the active seg
			if (e < g.t0 + g.dur) return g.from + (g.to - g.from) * g.ease((e - g.t0) / g.dur);
		}
		return settledValue; // past the end
	};
	let elapsed = 0;
	current = setInterval(() => {
		elapsed += STEP;
		// looping wraps back into [0,total); non-looping lets elapsed run past
		// `total` so valueAt returns the final value (landing EXACTLY on it), then
		// the timer is released — one read path, no special-case settle value.
		if (loop && elapsed >= total) elapsed %= total;
		s.value = valueAt(elapsed);
		if (!loop && elapsed >= total) clear(); // done — release the native timer
	}, STEP);
	return get;
}

/** Options for {@link useSpring}. */
export type SpringOptions = {
	/** Restoring force toward the target. Higher = snappier. Default 170 (RN default). */
	stiffness?: number;
	/** Velocity damping. Higher = less overshoot/bounce. Default 26 (RN default). */
	damping?: number;
	/** Inertial mass. Higher = slower, heavier motion. Default 1. */
	mass?: number;
	/** Settle threshold: stop when |x-target| and |velocity| both fall below this. Default 0.05. */
	precision?: number;
	/** Value to spring FROM. Default: the target (a bare-number target then rests, no motion). */
	from?: number;
};

/**
 * useSpring(target, opts?) — physics-based motion toward `target`: the RN
 * Reanimated `withSpring` analog and the one motion model {@link useTween} (fixed
 * duration) and {@link useSequence} (keyframes) lack. Returns a getter
 * `() => number`; read it in a binding to drive UI.
 *
 *   const [open, setOpen] = useState(false);
 *   const x = useSpring(() => (open() ? 100 : 0), { stiffness: 200, damping: 18 });
 *   <Label string={() => String(Math.round(x()))} />
 *
 * A semi-implicit Euler integrator on the device's single interval timer (~30fps)
 * accelerates toward the target under a spring force minus damping, so motion
 * overshoots and settles naturally (bounce controlled by `damping`). A BARE-number
 * `target` springs ONCE from `opts.from` (default the target itself → rests with
 * no motion; pass `from` for a mount entrance). A THUNK `target` is REACTIVE: ONE
 * driving effect tracks it and, on each change, re-aims the spring from the CURRENT
 * position and velocity (a mid-flight change glides, never snaps). The `from` read
 * is untracked so the effect subscribes to `target()` only — reading the spring's
 * own output tracked would self-feed. On settle the timer is released and re-armed
 * on the next change; auto-cleared on owner dispose; the getter carries `.stop()`.
 * Zero module scope (Rule 5).
 */
export function useSpring(
	target: number | (() => number),
	opts?: SpringOptions,
): (() => number) & { stop: () => void } {
	const stiffness = opts?.stiffness ?? 170;
	const damping = opts?.damping ?? 26;
	// mass and precision must be POSITIVE and finite or the integrator never
	// settles and its 33 ms interval runs forever: `mass: 0` divides by zero
	// (a = Infinity -> v = NaN, and every comparison against NaN is false), while
	// `precision: 0` makes the strict `< precision` settle test unsatisfiable —
	// `useSpring(100, { precision: 0 })` even armed a timer while already at rest
	// (codex P2). Clamp to the default rather than throw: a bad animation option
	// is not worth a crash screen.
	const pos = (v: number | undefined, d: number): number =>
		v !== undefined && v > 0 && v < Infinity ? v : d;
	const mass = pos(opts?.mass, 1);
	const precision = pos(opts?.precision, 0.05);
	const constTarget = typeof target === "number";
	const readTarget = constTarget ? () => target : (target as () => number);
	// Rest at `from` (defaulting to the initial target → a bare number with no
	// `from` never moves). Untracked: settle without subscribing.
	const first = opts?.from ?? untrack(readTarget);
	const s = signal(first);
	const get = (() => s.value as number) as (() => number) & { stop: () => void };
	let x = first; // current position (float; the binding rounds)
	let v = 0; // current velocity
	let goal = first; // where the spring is currently aiming
	let current: number | null = null;
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	const tick = (): void => {
		// semi-implicit Euler: a = (-k·(x-goal) - c·v) / m, integrate v then x.
		const dt = STEP / 1000;
		const a = (-stiffness * (x - goal) - damping * v) / mass;
		v += a * dt;
		x += v * dt;
		if (Math.abs(x - goal) < precision && Math.abs(v) < precision) {
			x = goal; // snap to rest and release the timer
			v = 0;
			s.value = goal;
			clear();
			return;
		}
		s.value = x;
	};
	const arm = (to: number): void => {
		goal = to;
		if (current === null && (Math.abs(x - goal) >= precision || Math.abs(v) >= precision))
			current = setInterval(tick, STEP);
	};
	get.stop = clear;
	track(clear);
	// A thunk target drives one effect that re-aims on change; a bare number aims
	// once (from `first` toward the constant target — moves only if `from` differs).
	if (constTarget) arm(target);
	else effect(() => arm(readTarget()));
	return get;
}

/**
 * withDelay(ms, steps) — prepend a `{ hold: ms }` pause before a step list, so a
 * {@link useSequence} starts after a delay (RN Reanimated `withDelay`). Pure — no
 * timer, no signal; it returns a fresh `SeqStep[]` to hand to `useSequence`.
 *
 *   useSequence(withDelay(500, [{ to: 100, ms: 300 }]));  // wait 500ms, then move
 */
export const withDelay = (ms: number, steps: SeqStep[]): SeqStep[] => [{ hold: ms }, ...steps];

/**
 * withRepeat(steps, count, yoyo?) — repeat a step list `count` times (RN Reanimated
 * `withRepeat`). With `yoyo`, every other pass plays REVERSED so the motion bounces
 * back and forth instead of jumping to the start. Pure — expands into one flat
 * `SeqStep[]` for {@link useSequence} (so it shares the one sequence timer, not N).
 *
 *   useSequence(withRepeat([{ to: 100, ms: 200 }], 3, true));  // out, back, out
 */
export const withRepeat = (steps: SeqStep[], count: number, yoyo?: boolean): SeqStep[] => {
	const out: SeqStep[] = [];
	for (let i = 0; i < count; i++) out.push(...(yoyo && i % 2 ? reverseSteps(steps) : steps));
	return out;
};

// Reverse a move list: play the `to` targets back toward the start. A hold keeps
// its duration; a move re-aims at the PREVIOUS move's target (the value the
// forward pass started that move from), so forward-then-reversed returns home.
const reverseSteps = (steps: SeqStep[]): SeqStep[] => {
	// collect the move targets in order; the reversed pass walks them backward,
	// each reversed move easing toward the prior target (index-1), last -> its own start.
	const moves: number[] = [];
	for (const s of steps) if (!("hold" in s)) moves.push(s.to);
	const rev: SeqStep[] = [];
	let mi = moves.length - 1;
	for (let i = steps.length - 1; i >= 0; i--) {
		const s = steps[i];
		if ("hold" in s) rev.push({ hold: s.hold });
		else {
			// reversed target = the value this move originally started FROM = the
			// previous move's target (or, for the first move, undefined → 0 baseline).
			// …and the FIRST move's reversal returns to the sequence's own start,
			// which only useSequence knows — `home` defers that resolution to
			// planSequence (a literal 0 here ignored `opts.from`; codex P2).
			if (mi > 0) rev.push({ to: moves[mi - 1], ms: s.ms, ease: s.ease });
			else rev.push({ to: 0, home: true, ms: s.ms, ease: s.ease });
			mi--;
		}
	}
	return rev;
};

/**
 * yoyo(steps) — play a step list forward then reversed, so the motion returns to
 * where it began (a single out-and-back). Sugar for `withRepeat(steps, 2, true)`.
 * Pure — returns a `SeqStep[]` for {@link useSequence}.
 *
 *   useSequence(yoyo([{ to: 100, ms: 250 }]), { loop: true });  // bounce forever
 */
export const yoyo = (steps: SeqStep[]): SeqStep[] => withRepeat(steps, 2, true);
