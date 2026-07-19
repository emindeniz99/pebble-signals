// Easing curves — the opt-in `runtime/easing` module: a set of standard
// Penner-style timing functions `(t: number) => number` that map normalized
// progress t in [0,1] to an eased position in [0,1] (approximately — `backOut`
// deliberately overshoots above 1 near the end for its "settle back" feel).
//
// PURE MATH — no Piu, no device risk (Rule 2, no substrate). These are what an
// `animate()`/tween passes as its `easing` argument (see runtime/flow's
// `animate`, whose default is `linear`). Nothing here constructs a host object,
// so there is no preload/module-scope gotcha to avoid — this module is safe to
// import from anywhere, including at module scope.
//
// BOUNDARIES ARE EXACT: every function clamps t to [0,1] first (an out-of-range
// t from a slightly-overshooting clock never produces an out-of-range output),
// so `f(0) === 0` and `f(1) === 1` for every export. `expoOut` needs an explicit
// t===1 guard because `1 - 2^-10` lands at ~0.999 otherwise; the rest hit their
// endpoints exactly (within float epsilon) by construction.

/** Clamp progress into the unit interval so the boundaries are exact. */
const clamp = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** No easing — progress passes through unchanged. */
export const linear = (t: number): number => clamp(t);

/** Quadratic ease-in — accelerates from zero (slow start). */
export const quadIn = (t: number): number => {
	t = clamp(t);
	return t * t;
};

/** Quadratic ease-out — decelerates to the end (fast start). */
export const quadOut = (t: number): number => {
	t = clamp(t);
	return t * (2 - t);
};

/** Quadratic ease-in-out — accelerate then decelerate, symmetric about 0.5. */
export const quadInOut = (t: number): number => {
	t = clamp(t);
	return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
};

/** Cubic ease-in — sharper slow start than quadratic. */
export const cubicIn = (t: number): number => {
	t = clamp(t);
	return t * t * t;
};

/** Cubic ease-out — sharper decelerating finish than quadratic. */
export const cubicOut = (t: number): number => {
	t = clamp(t);
	const u = 1 - t;
	return 1 - u * u * u;
};

/** Cubic ease-in-out — symmetric accelerate/decelerate. */
export const cubicInOut = (t: number): number => {
	t = clamp(t);
	const u = -2 * t + 2;
	return t < 0.5 ? 4 * t * t * t : 1 - (u * u * u) / 2;
};

/** Sinusoidal ease-in. */
export const sineIn = (t: number): number => {
	t = clamp(t);
	return 1 - Math.cos((t * Math.PI) / 2);
};

/** Sinusoidal ease-out. */
export const sineOut = (t: number): number => {
	t = clamp(t);
	return Math.sin((t * Math.PI) / 2);
};

/** Sinusoidal ease-in-out — gentle S-curve. */
export const sineInOut = (t: number): number => {
	t = clamp(t);
	return -(Math.cos(Math.PI * t) - 1) / 2;
};

/** Exponential ease-out — very fast start, long slow tail. */
export const expoOut = (t: number): number => {
	t = clamp(t);
	return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

/** Back ease-out — overshoots past 1 then settles (spring-like finish). */
export const backOut = (t: number): number => {
	t = clamp(t);
	const c1 = 1.70158;
	const c3 = c1 + 1;
	const u = t - 1;
	return 1 + c3 * u * u * u + c1 * u * u;
};

/** Bounce ease-out — decaying bounces into the end, stays within [0,1]. */
export const bounceOut = (t: number): number => {
	t = clamp(t);
	const n1 = 7.5625;
	const d1 = 2.75;
	if (t < 1 / d1) return n1 * t * t;
	if (t < 2 / d1) {
		t -= 1.5 / d1;
		return n1 * t * t + 0.75;
	}
	if (t < 2.5 / d1) {
		t -= 2.25 / d1;
		return n1 * t * t + 0.9375;
	}
	t -= 2.625 / d1;
	return n1 * t * t + 0.984375;
};
