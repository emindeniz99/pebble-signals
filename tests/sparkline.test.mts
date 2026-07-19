// Sparkline suite — runtime/sparkline (opt-in mini line chart composed over
// runtime/draw's Canvas). Proves: Sparkline returns a Port node; n points paint
// n−1 connecting segments; an empty or single-point array draws nothing (no
// divide-by-zero on n−1); an all-equal series draws a flat mid-line with no NaN
// spans (no divide-by-zero on max===min); the value→y mapping puts the max at
// the top and the min at the bottom; and a reactive `data` thunk re-invalidates
// on signal change so the next paint reflects the new series. StubPort
// (load-runtime) records the fillColor spans and simulates a Piu repaint via
// node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { Sparkline } = await loadModule("runtime/sparkline");
const { check, done } = makeChecker("sparkline");

const finite = (s: { x: number; y: number; w: number; h: number }): boolean =>
	Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.w) && Number.isFinite(s.h);

// --- all-equal series: flat mid-line, n−1 segments, provided props, no NaN ---
{
	// 4 equal points → 3 horizontal segments, one crisp span each (draw.ts's
	// horizontal-line fast path). thickness 2 → half=1, mid row y = height/2 − 1.
	const [node] = createRoot(() =>
		Sparkline({ data: [7, 7, 7, 7], width: 90, height: 40, color: "red", thickness: 2 }),
	);
	check("Sparkline returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();
	check("n points draw n−1 segments", node.spans.length === 3);
	check(
		"flat series draws every segment on the mid row",
		node.spans.every((s) => s.y === 19),
	);
	check(
		"flat mid-line spans are 2px thick",
		node.spans.every((s) => s.h === 2),
	);
	check("no NaN spans on an all-equal series", node.spans.every(finite));
	check(
		"provided color forwarded to the line",
		node.spans.every((s) => s.color === "red"),
	);
}

// --- varying series via a thunk: defaults + max→top / min→bottom mapping ---
{
	// data: 5,2,8 — the min (2) is at index 1, the max (8) at index 2, so the
	// min/max scan takes both the `v < min` and `v > max` branches.
	const c = signal([5, 2, 8]);
	const [node] = createRoot(() => Sparkline({ data: () => c.value, width: 100, height: 100 }));
	node.paint();
	check("varying series draws segments", node.spans.length > 0);
	check("no NaN spans on a varying series", node.spans.every(finite));
	check(
		"max value maps to the top (y=0)",
		node.spans.some((s) => s.y === 0),
	);
	check(
		"min value maps to the bottom (y=height)",
		node.spans.some((s) => s.y === 100),
	);
	check(
		"default color is #00c0ff",
		node.spans.every((s) => s.color === "#00c0ff"),
	);
	// reactive: the thunk read inside paint auto-tracks the signal.
	c.value = [0, 1];
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	check(
		"repaint reflects the new series (max→top)",
		node.spans.some((s) => s.y === 0),
	);
	check(
		"repaint reflects the new series (min→bottom)",
		node.spans.some((s) => s.y === 100),
	);
}

// --- degenerate series: empty and single-point draw nothing ---
{
	const [empty] = createRoot(() => Sparkline({ data: [] }));
	empty.paint();
	check("an empty array draws nothing", empty.spans.length === 0);

	const [one] = createRoot(() => Sparkline({ data: [42] }));
	one.paint();
	check("a single-point array draws nothing", one.spans.length === 0);
}

done();
