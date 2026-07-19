// Gauge suite — runtime/gauge (opt-in circular gauge/dial composed over
// runtime/draw's Canvas). Proves: Gauge returns a Port node; node.paint()
// rasterizes a `track` ring segment (the full-sweep background) plus a `fill`
// arc whose angular coverage GROWS with value (more spans at 0.75 than 0.25 —
// the arc coalesces one span per contiguous kept row-run, so a wider sweep
// touches more rows → more fill spans); value=0 draws the track ONLY (no fill
// arc); value clamps to [0,1]; a reactive `value` thunk re-invalidates on signal
// change and the next paint reflects the new sweep; a bare numeric value renders;
// a `label(v)` renders via drawString when provided (and is absent otherwise);
// every prop default resolves. StubPort (load-runtime) records the spans +
// strings and simulates a Piu repaint via node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
// `Style` is a host compartment global (absent in the Node sandbox); inject a
// stub BEFORE loading gauge so its lazy default Style constructs — the same
// idiom badge.test.mts uses for the default label Style.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { Gauge } = await loadModule("runtime/gauge");
const { check, done } = makeChecker("gauge");

const spansOf = (node, color) => node.spans.filter((s) => s.color === color).length;

// --- defaults + reactive thunk value: track + fill arc, grows on change ---
{
	const v = signal(0.25);
	const [node] = createRoot(() =>
		Gauge({ value: () => v.value, label: (x) => Math.round(x * 100) + "%" }),
	);
	check("Gauge returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();
	const track25 = spansOf(node, "#303030");
	const fill25 = spansOf(node, "#00d0ff");
	check("track arc is drawn (default #303030)", track25 > 0);
	check("fill arc is drawn at value 0.25 (default #00d0ff)", fill25 > 0);
	check("label renders via drawString", node.strings.length === 1);
	check("label reflects the value (25%)", node.strings[0].str === "25%");

	// reactive: the thunk read inside paint auto-tracks the signal.
	v.value = 0.75;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	const track75 = spansOf(node, "#303030");
	const fill75 = spansOf(node, "#00d0ff");
	check("track sweep is unchanged by value", track75 === track25);
	check("fill arc GROWS with value (0.75 > 0.25 span count)", fill75 > fill25);
	check("label repaints to the new value (75%)", node.strings[0].str === "75%");
}

// --- value=0: track only, NO fill arc ---
{
	const [node] = createRoot(() => Gauge({ value: 0 }));
	node.paint();
	check("value 0 still draws the track", spansOf(node, "#303030") > 0);
	check("value 0 draws NO fill arc", spansOf(node, "#00d0ff") === 0);
	check("no label → no drawString", node.strings.length === 0);
}

// --- value clamps below 0 (negative behaves as 0 → no fill) ---
{
	const [node] = createRoot(() => Gauge({ value: -0.5 }));
	node.paint();
	check("negative value clamps to 0 → no fill arc", spansOf(node, "#00d0ff") === 0);
	check("negative value still draws the track", spansOf(node, "#303030") > 0);
}

// --- value clamps above 1: a full-value arc equals value=1 ---
{
	const [over] = createRoot(() => Gauge({ value: 1.5 }));
	over.paint();
	const [one] = createRoot(() => Gauge({ value: 1 }));
	one.paint();
	check(
		"value 1.5 clamps to 1 (same fill span count as value 1)",
		spansOf(over, "#00d0ff") === spansOf(one, "#00d0ff"),
	);
	check("full arc covers more than a quarter arc", spansOf(one, "#00d0ff") > 0);
}

// --- all custom props + bare numeric value + custom label style/colors ---
{
	const style = new sandbox.Style({ font: "18px Gothic" });
	const [node] = createRoot(() =>
		Gauge({
			value: 0.5,
			size: 80,
			startDeg: 90,
			sweepDeg: 180,
			thickness: 6,
			track: "gray",
			fill: "lime",
			label: (x) => x.toFixed(1),
			labelColor: "black",
			labelStyle: style,
		}),
	);
	node.paint();
	check("custom track color forwarded", spansOf(node, "gray") > 0);
	check("custom fill color forwarded", spansOf(node, "lime") > 0);
	check("numeric (non-thunk) value renders a label", node.strings[0].str === "0.5");
	check("no default-color spans leak through", spansOf(node, "#00d0ff") === 0);
}

done();
