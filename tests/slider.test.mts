// Slider suite — runtime/slider (opt-in value Slider composed over runtime/draw's
// Canvas). Proves: Slider returns a Port node; node.paint() rasterizes a wide
// TRACK pill (fillRoundRect) plus a THUMB disc (fillCircle) whose x maps from the
// value — left at min, right at max, centered at mid; an out-of-range value
// clamps the thumb to an end; a reactive `value` thunk re-invalidates on signal
// change and the next paint moves the thumb; and every prop default resolves.
// StubPort (load-runtime) records the spans and simulates a Piu repaint via
// node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { Slider } = await loadModule("runtime/slider");
const { check, done } = makeChecker("slider");

// Center-row thumb span (color === `thumb`, y === cy): its x is `thumbX - r`, so
// x directly encodes the mapped thumb position. Defaults: cy=12, r=12, w=2r+1=25.
const thumbSpan = (node: any, cy: number, color: string) =>
	node.spans.find((s: any) => s.color === color && s.y === cy);

// --- reactive thunk value, defaults: track pill + thumb, thumb moves on change ---
{
	const v = signal(0);
	const [node] = createRoot(() => Slider({ value: () => v.value }));
	check("Slider returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();
	// track: a wide rounded pill in the default color (widest row ~ width-2).
	const trackWide = node.spans.find((s: any) => s.color === "#555555" && s.w >= 96);
	check("track paints a wide pill span", !!trackWide);
	check("track defaults to #555555", !!trackWide && trackWide.color === "#555555");
	// thumb at value=min (0) sits at the LEFT end → center-row span x === 0.
	const left = thumbSpan(node, 12, "white");
	check("thumb disc paints on the center row", left && left.w === 25);
	check("thumb defaults to white", !!left && left.color === "white");
	check("thumb at min sits left (x === 0)", !!left && left.x === 0);

	// reactive: the thunk read inside paint auto-tracks the signal.
	v.value = 1;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	const right = thumbSpan(node, 12, "white");
	check("thumb at max sits right (x === width - 2r)", !!right && right.x === 76);
	check(
		"track still paints after change",
		node.spans.some((s: any) => s.color === "#555555" && s.w >= 96),
	);

	// mid value centers the thumb.
	v.value = 0.5;
	node.paint();
	const mid = thumbSpan(node, 12, "white");
	check("thumb at mid is centered (x === width/2 - r)", !!mid && mid.x === 38);
}

// --- out-of-range clamps to an end; bare numeric value (non-thunk branch) ---
{
	const [hi] = createRoot(() => Slider({ value: 2 })); // above max (1)
	hi.paint();
	const hiThumb = thumbSpan(hi, 12, "white");
	check("value above max clamps thumb to right (x === 76)", !!hiThumb && hiThumb.x === 76);

	const [lo] = createRoot(() => Slider({ value: -1 })); // below min (0)
	lo.paint();
	const loThumb = thumbSpan(lo, 12, "white");
	check("value below min clamps thumb to left (x === 0)", !!loThumb && loThumb.x === 0);
}

// --- custom min/max/width/height/colors + max===min divide-by-zero guard ---
{
	// min/max mapping: value 50 in [0,100] is the midpoint → same as t=0.5.
	const [mapped] = createRoot(() => Slider({ value: 50, min: 0, max: 100 }));
	mapped.paint();
	const mThumb = thumbSpan(mapped, 12, "white");
	check("custom min/max maps midpoint value to center (x === 38)", !!mThumb && mThumb.x === 38);

	// custom width/height/colors: width=200,height=40 → r=20, cy=20, thumb w=41.
	const [big] = createRoot(() =>
		Slider({ value: 1, width: 200, height: 40, track: "lime", thumb: "black" }),
	);
	big.paint();
	const bThumb = thumbSpan(big, 20, "black");
	check("custom size thumb disc paints", !!bThumb && bThumb.w === 41);
	check("custom thumb color forwarded", !!bThumb && bThumb.color === "black");
	check("custom thumb at max (x === width - 2r === 160)", !!bThumb && bThumb.x === 160);
	check(
		"custom track color forwarded",
		big.spans.some((s: any) => s.color === "lime"),
	);

	// max === min: range 0 → t=0 (no divide-by-zero) → thumb pinned left.
	const [flat] = createRoot(() => Slider({ value: 5, min: 3, max: 3 }));
	flat.paint();
	const fThumb = thumbSpan(flat, 12, "white");
	check("max===min guards divide-by-zero, thumb at left (x === 0)", !!fThumb && fThumb.x === 0);
}

done();
