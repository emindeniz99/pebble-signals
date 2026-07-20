// Ergonomic reactive timer hooks — the opt-in `runtime/timers` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/timers` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// WHAT (Rule 2 — no substrate): React's useInterval / useTimeout, given Solid
// ownership. `useInterval(cb, delay)` runs `cb` every `delay` ms; `useTimeout`
// runs it ONCE after `delay` ms. Both take a {@link TimerDelay} — a bare number
// is STATIC, a THUNK (`() => ms`) is REACTIVE (an effect tears the timer down
// and recreates it when the delay changes — idiom 5b's one driving effect), and
// a `null` (bare or returned from the thunk) PAUSES it (no live timer). Both
// return a manual `cancel()` and auto-clean when their owner is disposed. They
// are BEHAVIORAL, not display: the app owns its state and hands in a `callback`;
// the hook owns only the interval id it must clear (Rule 8 — no app state here).
//
// setTimeout IS NOT ASSUMED ON DEVICE (Rule 5): the base mod manifest provides
// setInterval / clearInterval only, so useTimeout is a setInterval that
// clearInterval's ITSELF from inside its own callback after the first fire —
// never setTimeout. (flow.ts's animate() leans on the same single guarantee.)
//
// TEARDOWN DISCIPLINE (mirrors flow.ts's animate() / Move exactly): the live
// interval id is held in a per-call closure. On a reactive delay the driving
// effect clearInterval's the OLD id at the TOP of every run before creating the
// new one (so a delay change never leaks the previous timer), and `track(clear)`
// registers the final clearInterval with the running owner — that, NOT disposing
// the effect, is what actually stops the timer when the screen that created the
// hook is torn down (no leak on navigate-away). The manual `cancel()` returned
// to the caller is that same `clear` closure.
//
// LAZY STATE, NO MODULE SCOPE (Rule 5 / gotcha 13): every timer id and every
// closure is created INSIDE the exported hook at call time — this module
// constructs NOTHING at top level (no host objects, no timers, no mutable
// state), so there is nothing to freeze into a broken preload instance, and the
// two exports are `function` declarations exactly like flow.ts's Show / animate.
import { effect, track } from "runtime/signals";

/**
 * A timer delay handed to {@link useInterval} / {@link useTimeout}:
 *  - a bare `number` — static ms, applied once at construction;
 *  - a THUNK `() => number | null` — REACTIVE: read a signal inside it and the
 *    timer tears down + recreates whenever the returned value changes (a `null`
 *    return pauses it, a number resumes it — the pause/resume idiom);
 *  - `null` — paused: no live timer at all.
 */
export type TimerDelay = number | (() => number | null) | null;

/**
 * useInterval(callback, delay) — run `callback` every `delay` ms on the
 * device's single interval timer. Returns a manual `cancel()`.
 *
 *   useInterval(() => setCount((c) => c + 1), 1000);        // static: every 1s
 *   useInterval(tick, () => paused() ? null : 1000);        // reactive: pausable
 *   const cancel = useInterval(poll, 500); cancel();        // manual stop
 *
 * A bare-number `delay` arms once; `null` arms nothing. A THUNK `delay` is
 * reactive — ONE effect re-reads it and, on every change, clearInterval's the
 * previous timer (at the top of the run) before creating the new one, so a
 * delay change never leaks a timer and a `null` return pauses with zero live
 * timers (idiom 5b). The interval is auto-cleared when the owning screen is
 * disposed (mirrors animate()'s `track(stop)`); `cancel()` clears it by hand.
 * See the module header for the teardown contract.
 */
export function useInterval(callback: () => void, delay: TimerDelay): () => void {
	// The live interval id, held in this call's closure — null when no timer is
	// running. Created lazily at runtime (Rule 5), never at module scope.
	let current: number | null = null;
	// clear() is idempotent: it stops the live timer (if any) and forgets it, so
	// it is safe as the re-arm teardown, the owner cleanup AND the manual cancel.
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	// Re-arm to `d` ms: tear the old timer down FIRST (never leak it), then start
	// a fresh one unless paused (`d === null`).
	const arm = (d: number | null): void => {
		clear();
		if (d !== null) current = setInterval(callback, d);
	};
	// A reactive (thunk) delay drives one effect that re-arms on change; a static
	// number / null is applied once (no effect, nothing to re-run).
	if (typeof delay === "function") effect(() => arm(delay()));
	else arm(delay);
	// Final owner cleanup — this, not disposing the effect, is what stops the
	// timer when the screen disposes, so it is ALWAYS registered (Rule 5).
	track(clear);
	return clear;
}

/**
 * useTimeout(callback, delay) — run `callback` ONCE, `delay` ms from now, then
 * self-clear. Returns a manual `cancel()`.
 *
 *   useTimeout(() => setDone(true), 3000);                  // fire once after 3s
 *   const cancel = useTimeout(hide, 2000); cancel();        // cancel before it fires
 *
 * There is NO setTimeout on device (Rule 5), so this is a setInterval whose
 * callback clearInterval's its OWN timer before invoking `callback` — clearing
 * first means it fires exactly once even if `callback` throws. A bare-number
 * `delay` arms once; `null` arms nothing. A THUNK `delay` is reactive with the
 * same one-effect teardown as {@link useInterval}: changing the delay re-arms
 * the one-shot (the pending fire is cancelled and a fresh countdown starts —
 * including after it already fired, so pass a plain number for a true one-shot),
 * and a `null` return pauses it. Auto-cleared on owner dispose; `cancel()` stops
 * a pending fire by hand.
 */
export function useTimeout(callback: () => void, delay: TimerDelay): () => void {
	// Same closure-held id + idempotent clear as useInterval (see there).
	let current: number | null = null;
	const clear = (): void => {
		if (current !== null) {
			clearInterval(current);
			current = null;
		}
	};
	// Arm a ONE-SHOT: a setInterval whose callback clears its own timer BEFORE
	// running `callback`, so it fires exactly once (a throwing callback still
	// leaves no live timer). `null` arms nothing.
	const arm = (d: number | null): void => {
		clear();
		if (d !== null)
			current = setInterval(() => {
				clear();
				callback();
			}, d);
	};
	if (typeof delay === "function") effect(() => arm(delay()));
	else arm(delay);
	track(clear);
	return clear;
}
