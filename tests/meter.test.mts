// Meter suite — runtime/meter (opt-in segmented meter composed over
// runtime/draw's Canvas). Proves: Meter returns a Port node; node.paint()
// rasterizes N bars (each bar emits exactly ONE full-width `segWidth` span —
// the fillRoundRect middle band — so lit/off bars are countable by color); the
// lit count is `round(value*segments)` with value clamped to [0,1]; a reactive
// `value` thunk re-invalidates on signal change and the next paint shows the new
// lit count; a bare numeric value also renders; every prop default resolves; and
// degenerate geometry (segments<1, width/height<=0, gap-starved segWidth<=0)
// paints nothing rather than emitting a bad span. StubPort (load-runtime)
// records the spans and simulates a Piu repaint via node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { Meter } = await loadModule("runtime/meter");
const { check, done } = makeChecker("meter");

// One full-width span per bar (the middle band, or the whole rect when the
// radius clamps to 0) — count them by color to read the lit/off tally.
const litOf = (node, segWidth, color) =>
	node.spans.filter((s) => s.w === segWidth && s.color === color).length;

// --- defaults + reactive thunk value: 0.6 of 5 bars lights 3, repaint on change ---
{
	const lvl = signal(0.6);
	const [node] = createRoot(() => Meter({ value: () => lvl.value }));
	check("Meter returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();
	// defaults: width 100, segments 5, gap 2 → segWidth = (100 - 4*2)/5 = 18.4.
	const segWidth = (100 - 4 * 2) / 5;
	check("value 0.6 of 5 lights round(3.0)=3 bars", litOf(node, segWidth, "#00c000") === 3);
	check("the remaining 2 bars are off", litOf(node, segWidth, "#303030") === 2);
	check(
		"exactly `segments` bars are drawn",
		litOf(node, segWidth, "#00c000") + litOf(node, segWidth, "#303030") === 5,
	);
	check(
		"first bar starts at x=0",
		node.spans.some((s) => s.x === 0 && s.color === "#00c000"),
	);
	// reactive: the thunk read inside paint auto-tracks the signal.
	lvl.value = 0;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	check("repaint after change to 0 lights no bars", litOf(node, segWidth, "#00c000") === 0);
	check("all 5 bars now off", litOf(node, segWidth, "#303030") === 5);
	lvl.value = 1;
	node.paint();
	check("value 1 lights all 5 bars", litOf(node, segWidth, "#00c000") === 5);
}

// --- value clamps below 0 (negative → 0 lit), thunk branch ---
{
	const [node] = createRoot(() => Meter({ value: () => -0.5 }));
	node.paint();
	const segWidth = (100 - 4 * 2) / 5;
	check("negative value clamps to 0 → no bars lit", litOf(node, segWidth, "#00c000") === 0);
}

// --- value >= 1 clamps to all lit + bare numeric (non-thunk) value + custom props ---
{
	const [node] = createRoot(() =>
		Meter({ value: 1.5, segments: 4, width: 80, height: 12, on: "lime", off: "gray", gap: 4 }),
	);
	node.paint();
	const segWidth = (80 - 3 * 4) / 4; // (80 - 12)/4 = 17
	check("value 1.5 clamps to 1 → all 4 bars lit", litOf(node, segWidth, "lime") === 4);
	check("no off bars when full", litOf(node, segWidth, "gray") === 0);
	check(
		"custom on color forwarded",
		node.spans.some((s) => s.color === "lime"),
	);
}

// --- degenerate geometry guards: paint nothing, never a bad span ---
{
	const [z] = createRoot(() => Meter({ value: 0.5, segments: 0 }));
	z.paint();
	check("segments<1 paints nothing", z.spans.length === 0);

	const [w0] = createRoot(() => Meter({ value: 0.5, width: 0 }));
	w0.paint();
	check("width<=0 paints nothing", w0.spans.length === 0);

	const [h0] = createRoot(() => Meter({ value: 0.5, height: 0 }));
	h0.paint();
	check("height<=0 paints nothing", h0.spans.length === 0);

	// gap so large the per-bar width would be negative → segWidth<=0 guard.
	const [g] = createRoot(() => Meter({ value: 0.5, width: 10, segments: 5, gap: 100 }));
	g.paint();
	check("gap-starved segWidth<=0 paints nothing", g.spans.length === 0);
}

done();
