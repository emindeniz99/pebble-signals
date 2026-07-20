// Three ergonomic state hooks on signals — the opt-in `runtime/state` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/state` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing. Every export is pure reactive LOGIC — no Piu
// nodes, no drawing, no host objects at module scope: a hook makes a signal
// (via useState) and hands back a getter + controls; the consumer reads the
// getter inside a binding/effect to stay reactive.
//
// WHAT (Rule 2 — no substrate): the three state shapes an app reaches for most.
//  - useToggle   — a boolean you flip or set (a settings switch, a paused flag).
//  - useCounter  — a bounded number with inc/dec/reset/set, clamped to [min,max].
//  - useDebounce — a getter that trails a source but settles only once it stops.
//
// IDIOM (useToggle / useCounter — a signal + closures over its setter): inc/dec
// and toggle use the FUNCTIONAL-update form (`set(c => clamp(c + step))`)
// because they read the CURRENT value — the functional update reads the signal
// RAW (never subscribes, per useState), so calling them from inside an effect
// can't feed back and loop. reset/set/setValue write an ABSOLUTE value, no read.
//
// IDIOM (useDebounce — the interesting one): ONE effect subscribes to source();
// each change re-runs it and ARMS a `useTimeout(delayMs)` that writes the source
// value into an internal signal. The cancel-the-previous half is FREE and needs
// no manual bookkeeping: useTimeout registers its `clearInterval` with the
// RUNNING OWNER (`track(clear)` — see runtime/timers), and inside this effect
// the running owner IS the effect. So the effect's own re-run drains that clear
// FIRST (unsubscribe() runs before the body, see runtime/signals `run`) —
// cancelling the prior pending timeout before arming the next. A burst of
// changes therefore leaves exactly ONE live timer, the last, which settles the
// value after delayMs of quiet. Disposing the owner disposes the effect, which
// drains the last clear: a pending debounce auto-cancels on teardown (no leaked
// timer on navigate-away).
//
// GOTCHAS:
//  - useCounter CLAMPS THE INITIAL at construction, so count() is ALWAYS inside
//    [min,max] (a counter that starts outside its own bounds is a footgun);
//    reset() restores that same clamp(initial). The one behavior this does NOT
//    give you is retaining a raw out-of-range initial until the first op.
//  - useDebounce seeds from `untrack(source)` so constructing the hook inside
//    another effect/binding does not subscribe THAT owner to source — only the
//    internal debounce effect tracks it.
//  - the settle writes via `set(() => next)` (the function-update form) so a T
//    that is itself a function is STORED verbatim, never mis-called as an updater.
//  - setTimeout is not on device: useTimeout is a self-clearing setInterval, so
//    useDebounce inherits that single-native-timer shape.
//
// PLATFORM: exports are `function` declarations like flow.ts / timers.ts; the
// one module-local helper (useCounter's `clamp`) is a PER-CALL `const` closure,
// never a module-scope declaration (gotcha 13 — a preloaded top-level
// function/class burns an XS alias slot). The type exports are compile-time only
// and erase entirely.
import { useState, untrack, effect } from "runtime/signals";
import { useTimeout } from "runtime/timers";

/**
 * useToggle(initial?) — a boolean signal with a flip and a set.
 *
 *   const [on, toggle, setOn] = useToggle();       // starts false
 *   <Label string={() => (on() ? "ON" : "OFF")} /> // reactive read
 *   onPressSelect={toggle}                          // flip it
 *   setOn(true);                                    // or set it outright
 *
 * Returns `[value, toggle, setValue]`: `value()` reads the current boolean
 * (reactive), `toggle()` flips it, `setValue(v)` sets it. Built on useState.
 * @param initial starting value (default `false`).
 */
export function useToggle(
	initial: boolean = false,
): [value: () => boolean, toggle: () => void, setValue: (v: boolean) => void] {
	const [get, set] = useState(initial);
	// toggle uses the functional-update form so it reads the CURRENT value raw
	// (no subscribe) — flipping from inside an effect can't loop. setValue narrows
	// the useState setter to a plain boolean (no functional-update form exposed).
	return [get, () => set((b) => !b), (v: boolean) => set(v)];
}

/** Options for {@link useCounter}: step size and optional inclusive bounds. */
export interface CounterOptions {
	/** Amount `inc`/`dec` move the count by. Default `1`. */
	step?: number;
	/** Inclusive lower bound — values below it clamp up. Omitted = unbounded below. */
	min?: number;
	/** Inclusive upper bound — values above it clamp down. Omitted = unbounded above. */
	max?: number;
}

/** The controls object — the second element of {@link useCounter}'s tuple. */
export interface CounterControls {
	/** Add `step`, clamped to `[min, max]`. */
	inc: () => void;
	/** Subtract `step`, clamped to `[min, max]`. */
	dec: () => void;
	/** Restore `clamp(initial)`. */
	reset: () => void;
	/** Set to `clamp(n)`. */
	set: (n: number) => void;
}

/**
 * useCounter(initial?, opts?) — a bounded number with inc/dec/reset/set.
 *
 *   const [count, c] = useCounter(0, { min: 0, max: 10 });
 *   <Label string={() => "n " + count()} />   // reactive read
 *   onPressUp={c.inc} onPressDown={c.dec}      // step ±1, clamped 0..10
 *
 * Returns `[count, controls]`: `count()` reads the value (reactive); `controls`
 * is `{ inc, dec, reset, set }`. inc/dec move by `step` and CLAMP to `[min,max]`
 * (each bound independent and optional); `reset()` restores `clamp(initial)`;
 * `set(n)` writes `clamp(n)`. The initial value is ALSO clamped, so `count()`
 * never leaves the range. Built on useState.
 * @param initial starting value, clamped into range (default `0`).
 * @param opts `{ step=1, min?, max? }`.
 */
export function useCounter(
	initial: number = 0,
	opts?: CounterOptions,
): [count: () => number, controls: CounterControls] {
	const step = opts?.step ?? 1;
	const min = opts?.min;
	const max = opts?.max;
	// Clamp into [min,max]; each bound is independent and optional (an unset bound
	// never constrains). A per-call const closure — never a module-scope helper
	// (gotcha 13).
	const clamp = (n: number): number => {
		if (min !== undefined && n < min) return min;
		if (max !== undefined && n > max) return max;
		return n;
	};
	const [count, setCount] = useState(clamp(initial));
	return [
		count,
		{
			// inc/dec read the CURRENT count (functional update — raw read, no
			// subscribe) then clamp; reset/set write an absolute clamped value.
			inc: () => setCount((c) => clamp(c + step)),
			dec: () => setCount((c) => clamp(c - step)),
			reset: () => setCount(clamp(initial)),
			set: (n: number) => setCount(clamp(n)),
		},
	];
}

/**
 * useDebounce(source, delayMs) — a getter that trails `source` but settles only
 * after it has been stable for `delayMs`.
 *
 *   const [count] = useCounter(0);
 *   const settled = useDebounce(count, 400);
 *   <Label string={() => "raw " + count()} />
 *   <Label string={() => "settled " + settled()} />  // lags 400ms behind
 *
 * ONE effect subscribes to `source()`; each change cancels the previous pending
 * timeout (the effect's own owner drain — see the module header) and arms a new
 * `useTimeout(delayMs)` that writes the latest source value into an internal
 * signal, so a burst of changes collapses to only the LAST. The pending timeout
 * auto-cancels when the owner is disposed. `source` should read a signal (that
 * is what makes the effect re-run); `delayMs` is a static number.
 * @param source the reactive value to trail.
 * @param delayMs quiet time (ms) before the value settles.
 * @returns a reactive getter for the debounced value.
 */
export function useDebounce<T>(source: () => T, delayMs: number): () => T {
	// Seed with the current source, read UNTRACKED so building this hook inside
	// another effect doesn't subscribe THAT owner to source (only the effect
	// below should track it).
	const [value, setValue] = useState<T>(untrack(source));
	effect(() => {
		const next = source(); // the ONLY tracked read — re-runs on every change
		// Arm the settle. useTimeout's clear registers with THIS effect (the
		// running owner), so the next re-run drains it FIRST — cancelling this
		// timeout before arming the replacement. `set(() => next)` stores `next`
		// verbatim even when T is a function type.
		useTimeout(() => setValue(() => next), delayMs);
	});
	return value;
}
