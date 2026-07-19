// ProgressBar suite — runtime/progressbar (opt-in horizontal bar composed over
// runtime/draw's Canvas). Proves: ProgressBar returns a Port node; node.paint()
// rasterizes a full-width `track` roundrect plus a left-anchored `fill`
// roundrect whose width tracks `value * width`; `value` is clamped to [0,1] (0
// and negatives draw NO fill, 1 and >1 fill the whole width); and a reactive
// `value` thunk re-invalidates on signal change so the next paint shows the new
// fill width. A bare numeric value (non-thunk) with all-default props also
// renders. StubPort (load-runtime) records the fillColor spans and simulates a
// Piu repaint via node.paint().
//
// Span geometry note: `fillRoundRect(0,0,w,h,r,…)` emits ONE full-`w` "middle
// band" span only when `h - 2r > 0`; the corner-arc rows are always narrower
// than `w`. So we pick width/height/radius with a middle band (h=20, r=6) and
// assert on that unique full-width span — its width is exactly `w` for the
// track and `round(value*width)` for the fill.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { ProgressBar } = await loadModule("runtime/progressbar");
const { check, done } = makeChecker("progressbar");

const TRACK = "#404040";
const FILL = "#1560bd";
// The unique full-width "middle band" span for a given color (see header note).
const band = (node, color, w) => node.spans.find((s) => s.color === color && s.w === w);
const hasColor = (node, color) => node.spans.some((s) => s.color === color);

// --- reactive thunk value: track + fill, clamp, repaint on change ---
{
	const c = signal(0.5);
	const [node] = createRoot(() =>
		ProgressBar({ value: () => c.value, width: 200, height: 20, radius: 6 }),
	);
	check("ProgressBar returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);

	node.paint();
	check("track paints a full-width band", !!band(node, TRACK, 200));
	check("fill width is value*width at 0.5", !!band(node, FILL, 100));

	// reactive: the thunk read inside paint auto-tracks the signal.
	c.value = 0.25;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	check("repaint shows the new fill width", !!band(node, FILL, 50));
	check("track still paints after change", !!band(node, TRACK, 200));

	// value = 0 → no fill span at all (track only).
	c.value = 0;
	check("zero value re-invalidates", node.invalidated === 3);
	node.paint();
	check("value 0 draws no fill", !hasColor(node, FILL));
	check("value 0 still draws the track", hasColor(node, TRACK));

	// value = 1 → fill spans the whole width.
	c.value = 1;
	node.paint();
	check("value 1 fills the whole width", !!band(node, FILL, 200));

	// value > 1 clamps to full.
	c.value = 2;
	node.paint();
	check("value >1 clamps to full width", !!band(node, FILL, 200));

	// value < 0 clamps to empty.
	c.value = -0.5;
	node.paint();
	check("negative value clamps to no fill", !hasColor(node, FILL));
}

// --- bare numeric value + all default props (non-thunk branch, defaults) ---
{
	const [node] = createRoot(() => ProgressBar({ value: 0.5 }));
	node.paint();
	// defaults: width 100, height 10, radius height/2=5 (a pill — no middle band),
	// track "#404040", fill "#1560bd".
	check("default track color drawn", hasColor(node, TRACK));
	check("default fill color drawn", hasColor(node, FILL));
	// with default width 100, half-progress fills ~50px — no fill span exceeds it.
	const widestFill = Math.max(...node.spans.filter((s) => s.color === FILL).map((s) => s.w));
	check("numeric (non-thunk) value renders a bounded fill", widestFill <= 50 && widestFill > 0);
}

done();
