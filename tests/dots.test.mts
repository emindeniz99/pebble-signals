// DotIndicator suite — runtime/dots (opt-in page/step dots composed over
// runtime/draw's Canvas). Proves: DotIndicator returns a Port node; node.paint()
// rasterizes `count` discs (one fillCircle center-row span per dot on the
// vertical-center row); the `active` dot uses the `on` color and is one pixel
// larger; an out-of-range `active` (high or negative) clamps to the last/first
// dot; a reactive `active` thunk re-invalidates on signal change and the next
// paint moves the highlight; and every prop default resolves. StubPort
// (load-runtime) records the spans and simulates a Piu repaint via node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { DotIndicator } = await loadModule("runtime/dots");
const { check, done } = makeChecker("dots");

// Center-row (dy=0) span of a fillCircle disc: y === cy, width === 2r+1. One per
// dot, so `spans.filter(y===cy)` is exactly the per-dot list — the whole row.
const centerSpans = (node, cy) => node.spans.filter((s) => s.y === cy);
const activeSpan = (node, cy, on) => centerSpans(node, cy).find((s) => s.color === on);

// --- defaults + reactive thunk active: a row of dots, highlight moves ---
{
	const a = signal(0);
	const [node] = createRoot(() => DotIndicator({ count: 4, active: () => a.value }));
	check("DotIndicator returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();
	// defaults: width 96 → step 24; height 12 → cy 6; radius 3 → off center w=7,
	// on (active) radius 4 → center w=9. Dot i is centered at step*(i+0.5).
	const row = centerSpans(node, 6);
	check("draws one center span per dot (count discs)", row.length === 4);
	const hot0 = activeSpan(node, 6, "white");
	check("active dot uses the on color (default white)", !!hot0);
	check("active dot is one pixel larger (radius+1 → w=9)", hot0.w === 9);
	check("active dot sits at the first slot", hot0.x === 24 * 0.5 - 4);
	const off0 = row.filter((s) => s.color === "#606060");
	check("the other 3 dots use the off color (default #606060)", off0.length === 3);
	check(
		"off dots keep the base radius (w=7)",
		off0.every((s) => s.w === 7),
	);
	// reactive: the thunk read inside paint auto-tracks the signal.
	a.value = 2;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	const hot2 = activeSpan(node, 6, "white");
	check("repaint moves the highlight to the new active index", hot2.x === 24 * 2.5 - 4);
	check(
		"still exactly one active dot after the move",
		centerSpans(node, 6).filter((s) => s.color === "white").length === 1,
	);
}

// --- all props provided + bare numeric active (non-thunk branch) ---
{
	const [node] = createRoot(() =>
		DotIndicator({
			count: 3,
			active: 1,
			width: 60,
			height: 20,
			on: "cyan",
			off: "gray",
			radius: 5,
		}),
	);
	node.paint();
	// step 20, cy 10, off radius 5 → w=11, active radius 6 → w=13.
	const row = centerSpans(node, 10);
	check("custom count draws that many center spans", row.length === 3);
	const hot = activeSpan(node, 10, "cyan");
	check("custom on color forwarded to the active dot", !!hot);
	check("custom radius grows the active dot (w=13)", hot.w === 13);
	check("numeric (non-thunk) active selects the middle dot", hot.x === 20 * 1.5 - 6);
	check("custom off color forwarded", row.filter((s) => s.color === "gray").length === 2);
	check(
		"custom off radius (w=11)",
		row.filter((s) => s.color === "gray").every((s) => s.w === 11),
	);
}

// --- out-of-range active (too high) clamps to the last dot ---
{
	const [node] = createRoot(() => DotIndicator({ count: 4, active: 99 }));
	node.paint();
	const hot = activeSpan(node, 6, "white");
	check("active > count-1 clamps to the last dot", hot.x === 24 * 3.5 - 4);
	check(
		"still exactly one dot lit when clamped high",
		centerSpans(node, 6).filter((s) => s.color === "white").length === 1,
	);
}

// --- out-of-range active (negative) clamps to the first dot ---
{
	const [node] = createRoot(() => DotIndicator({ count: 4, active: -5 }));
	node.paint();
	const hot = activeSpan(node, 6, "white");
	check("active < 0 clamps to the first dot", hot.x === 24 * 0.5 - 4);
}

// --- count <= 0 draws nothing (guard) ---
{
	const [node] = createRoot(() => DotIndicator({ count: 0, active: 0 }));
	node.paint();
	check("count <= 0 paints no discs", node.spans.length === 0);
}

done();
