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
import { effect, untrack } from "runtime/signals";
import { animate, type Tween } from "runtime/flow";

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
