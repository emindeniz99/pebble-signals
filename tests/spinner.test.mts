// Spinner suite — runtime/spinner (opt-in animated loading indicator). Unlike
// the display-only widgets, a Spinner OWNS its animation: an INTERNAL `angle`
// signal + a lazily created ~30fps setInterval rotate an arc SEGMENT that the
// composed Canvas repaints for free (angle read inside paint → auto-tracked).
// Proves: the returned Canvas Port exists at the explicit size (gotcha 16 —
// Canvas carries its own width/height); the default (and bare `true`) `running`
// starts EXACTLY ONE timer at mount and each tick re-invalidates + rotates the
// painted arc (StubPort.paint() captures the spans before and after a tick(n),
// which must differ); `trackColor` adds a full-ring track behind the segment;
// `running:false` starts NO timer and paints a static first frame; a reactive
// `running` thunk flips the timer on/off (drive the signal, assert liveTimers
// 0↔1) with no duplicate timer on a benign re-run; a 0/negative `periodMs`
// clamps (no NaN frame); and disposing the createRoot owner clears the interval.
// The Spinner draws no text, so no Style/Skin stubs are needed. StubPort
// (load-runtime) records fillColor spans and simulates a Piu repaint via
// node.paint(); tick(n)/liveTimers() drive and count the sandbox intervals.
// Every block disposes its root so each `liveTimers()===1` starts from a clean
// (0) baseline — timers are global to the sandbox.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, loadModule, tick, liveTimers } = await loadRuntime();
// Canvas defaults width/height to the screen only when the caller omits them;
// Spinner always passes an explicit size, but set sane screen dims anyway.
jsxM.screen.width = 144;
jsxM.screen.height = 168;
const { signal, createRoot } = signals;
const { Spinner } = await loadModule("runtime/spinner");
const { check, done } = makeChecker("spinner");

// --- defaults: 48px canvas, auto-runs one timer, each tick rotates the arc ---
{
	const [node, dispose] = createRoot(() => Spinner({}));
	check("Spinner returns a Canvas Port", node && typeof node.paint === "function");
	check(
		"default size → a 48×48 canvas (explicit dims, gotcha 16)",
		node.width === 48 && node.height === 48,
	);
	check("default running starts exactly one timer", liveTimers() === 1);
	check("mount schedules the first frame (one invalidate)", node.invalidated === 1);
	// capture the pre-tick frame (angle 0)
	node.paint();
	const f0 = JSON.stringify(node.spans);
	check("first frame paints the moving segment", node.spans.length > 0);
	check(
		"no trackColor → every span is the default fill color",
		node.spans.every((s) => s.color === "#1560bd"),
	);
	// advance ~30fps: 6 ticks ≈ 71° at the default 1000ms period / 33ms step
	tick(6);
	check("each tick re-invalidates (auto-tracked repaint)", node.invalidated === 7);
	node.paint();
	const f1 = JSON.stringify(node.spans);
	check("the arc rotated after ticks (spans differ)", f0 !== f1);
	dispose();
	check("dispose clears the interval", liveTimers() === 0);
}

// --- overrides + trackColor: a full-ring track behind the moving segment ---
{
	const [node, dispose] = createRoot(() =>
		Spinner({
			size: 60,
			color: "cyan",
			trackColor: "#222",
			thickness: 6,
			sweepDeg: 120,
			periodMs: 2000,
			running: true,
		}),
	);
	check("explicit size override → a 60×60 canvas", node.width === 60 && node.height === 60);
	check("bare running:true starts one timer", liveTimers() === 1);
	node.paint();
	check(
		"trackColor paints a full-ring track (its color is present)",
		node.spans.some((s) => s.color === "#222"),
	);
	check(
		"the moving segment paints in the fill color override",
		node.spans.some((s) => s.color === "cyan"),
	);
	dispose();
	check("dispose clears the interval", liveTimers() === 0);
}

// --- running:false (bare) never starts; a static first frame still paints ---
{
	const [node, dispose] = createRoot(() => Spinner({ running: false }));
	check("running:false starts no timer", liveTimers() === 0);
	node.paint();
	const f0 = JSON.stringify(node.spans);
	check("a frozen spinner still paints a static first frame", node.spans.length > 0);
	tick(10);
	node.paint();
	const f1 = JSON.stringify(node.spans);
	check("no timer → the frame never changes", f0 === f1);
	// dispose runs stopTimer with no live timer (the id===undefined no-op branch)
	dispose();
	check("dispose of a never-started spinner is clean", liveTimers() === 0);
}

// --- a reactive running thunk flips the timer on/off ---
{
	const on = signal(true);
	const [node, dispose] = createRoot(() => Spinner({ running: () => on.value }));
	check("running thunk true at mount → timer live", liveTimers() === 1);
	on.value = false;
	check("running flips false → the timer stops", liveTimers() === 0);
	on.value = true;
	check("running flips back true → the timer restarts", liveTimers() === 1);
	// the restarted timer still drives the arc (proves no dead node after a flip)
	const before = node.invalidated;
	tick(3);
	check("the restarted timer still repaints", node.invalidated === before + 3);
	dispose();
	check("dispose clears the restarted interval", liveTimers() === 0);
}

// --- a running thunk that starts FALSE: stop path runs as a no-op, then a
// flip to true starts it (exercises the effect's else branch at mount) ---
{
	const on = signal(false);
	const [, dispose] = createRoot(() => Spinner({ running: () => on.value }));
	check("thunk false at mount → no timer", liveTimers() === 0);
	on.value = true;
	check("flip to true starts the timer", liveTimers() === 1);
	dispose();
	check("dispose clears it", liveTimers() === 0);
}

// --- a thunk that re-runs while STILL true must not stack a second timer ---
{
	const n = signal(1);
	const [, dispose] = createRoot(() => Spinner({ running: () => n.value > 0 }));
	check("thunk true at mount → one timer", liveTimers() === 1);
	n.value = 2; // still > 0: the effect re-runs, startTimer early-returns
	check("a benign re-run does not add a second timer", liveTimers() === 1);
	dispose();
	check("still just one interval to clear", liveTimers() === 0);
}

// --- periodMs<=0 clamps to ≥1 (flow.ts discipline): a valid, non-NaN frame ---
{
	const [node, dispose] = createRoot(() => Spinner({ periodMs: 0 }));
	check("a clamped period still starts a timer", liveTimers() === 1);
	node.paint();
	check("clamped period paints a valid frame", node.spans.length > 0);
	check(
		"no span carries a NaN coordinate (Infinity advance was clamped away)",
		node.spans.every((s) => s.x === s.x && s.y === s.y && s.w === s.w),
	);
	tick(1); // runs the timer callback body under the clamped period (no NaN, no crash)
	check("the timer callback ran and the timer stays live", liveTimers() === 1);
	dispose();
	check("dispose clears the interval", liveTimers() === 0);
}

done();
