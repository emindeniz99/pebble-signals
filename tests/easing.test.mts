// Easing suite — runtime/easing (pure Penner-style timing curves; no Piu, no
// device risk). Proves for EVERY exported curve: the boundaries are exact
// (f(0)===0, f(1)===1 within 1e-9) and out-of-range t is clamped (f(-x)===f(0),
// f(1+x)===f(1)); interior samples stay in [0,1] for the non-overshooting
// curves; and the in/out families bend the right way at the midpoint (ease-out
// is ahead of linear at 0.5, ease-in is behind). `backOut` is the intentional
// exception — it overshoots above 1 near the end (its spring-settle), asserted
// explicitly. StubPort/loadRuntime are unused here: this module is pure math.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { loadModule } = await loadRuntime();
const E = await loadModule("runtime/easing");
const { check, done } = makeChecker("easing");

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

// Every curve, in one place, so the boundary/clamp laws are asserted uniformly.
const NAMES = [
	"linear",
	"quadIn",
	"quadOut",
	"quadInOut",
	"cubicIn",
	"cubicOut",
	"cubicInOut",
	"sineIn",
	"sineOut",
	"sineInOut",
	"expoOut",
	"backOut",
	"bounceOut",
];

// --- exhaustiveness: exactly the documented set, all callable ---
check(
	"exports every named curve",
	NAMES.every((n) => typeof E[n] === "function"),
);
check("exports nothing extra", Object.keys(E).sort().join() === [...NAMES].sort().join());

// --- boundaries exact + out-of-range clamps, for EVERY curve ---
for (const n of NAMES) {
	const f = E[n];
	check(`${n}(0) === 0`, near(f(0), 0));
	check(`${n}(1) === 1`, near(f(1), 1));
	// clamp: below 0 collapses to f(0), above 1 collapses to f(1).
	check(`${n} clamps t<0 to the t=0 value`, near(f(-0.5), f(0)));
	check(`${n} clamps t>1 to the t=1 value`, near(f(2), f(1)));
}

// --- interior stays in [0,1] for the non-overshooting curves ---
const IN_RANGE = NAMES.filter((n) => n !== "backOut"); // backOut overshoots by design
const SAMPLES = [0.1, 0.25, 0.5, 0.75, 0.9];
for (const n of IN_RANGE) {
	const f = E[n];
	check(
		`${n} interior samples stay within [0,1]`,
		SAMPLES.every((t) => f(t) >= 0 && f(t) <= 1),
	);
}

// --- ease direction at the midpoint: out is ahead of linear, in is behind ---
check("quadOut(0.5) > 0.5 (fast start, decelerates)", E.quadOut(0.5) > 0.5);
check("quadIn(0.5) < 0.5 (slow start, accelerates)", E.quadIn(0.5) < 0.5);
check("cubicOut(0.5) > 0.5", E.cubicOut(0.5) > 0.5);
check("cubicIn(0.5) < 0.5", E.cubicIn(0.5) < 0.5);
check("sineOut(0.5) > 0.5", E.sineOut(0.5) > 0.5);
check("sineIn(0.5) < 0.5", E.sineIn(0.5) < 0.5);
check("expoOut(0.5) > 0.5 (very fast start)", E.expoOut(0.5) > 0.5);
check("linear(0.5) === 0.5", near(E.linear(0.5), 0.5));

// --- in/out families are symmetric about (0.5, 0.5) ---
check(
	"quadInOut is symmetric: f(0.25)+f(0.75)===1",
	near(E.quadInOut(0.25) + E.quadInOut(0.75), 1),
);
check(
	"cubicInOut is symmetric: f(0.25)+f(0.75)===1",
	near(E.cubicInOut(0.25) + E.cubicInOut(0.75), 1),
);
check("cubicInOut(0.5) === 0.5", near(E.cubicInOut(0.5), 0.5));
check("quadInOut(0.5) === 0.5", near(E.quadInOut(0.5), 0.5));
check("sineInOut(0.5) === 0.5", near(E.sineInOut(0.5), 0.5));
check(
	"sineInOut is symmetric: f(0.25)+f(0.75)===1",
	near(E.sineInOut(0.25) + E.sineInOut(0.75), 1),
);

// --- monotonicity spot-check: the plain in/out curves are non-decreasing.
// backOut (overshoots) and bounceOut (rebounds) are non-monotone BY DESIGN and
// are asserted separately below. ---
const MONOTONE = NAMES.filter((n) => n !== "backOut" && n !== "bounceOut");
for (const n of MONOTONE) {
	const f = E[n];
	const grid = [0, 0.2, 0.4, 0.6, 0.8, 1];
	let mono = true;
	for (let i = 1; i < grid.length; i++) if (f(grid[i]) < f(grid[i - 1]) - 1e-9) mono = false;
	check(`${n} is non-decreasing`, mono);
}

// --- backOut: overshoots above 1 near the end (the spring settle) ---
check("backOut overshoots above 1 near the end", E.backOut(0.85) > 1);
check("backOut(0.5) > 0.5 (an ease-out)", E.backOut(0.5) > 0.5);

// --- bounceOut: hits all four bounce segments, all within [0,1] ---
const BOUNCE_TS = [0.1, 0.5, 0.8, 0.95]; // one t per d1-segment
for (const t of BOUNCE_TS) {
	const v = E.bounceOut(t);
	check(`bounceOut(${t}) within [0,1]`, v >= 0 && v <= 1);
}
// first bounce dips back down then climbs — value at a trough is below its peak
check("bounceOut has a rebound structure (v(0.35) > v(0.4))", E.bounceOut(0.35) > E.bounceOut(0.4));

done();
