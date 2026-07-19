// Toggle suite — runtime/toggle (opt-in on/off Toggle composed over
// runtime/draw's Canvas). Proves: Toggle returns a Port node; node.paint()
// rasterizes ONE rounded pill (its color = onColor when on, offColor when off)
// plus ONE knob disc whose center sits in the RIGHT half when on and the LEFT
// half when off; a reactive `on` thunk re-invalidates on signal change and the
// next paint slides the knob AND swaps the pill color (WHY: the knob's side and
// the pill's color are the entire visual meaning of the control — if either
// stopped tracking `on`, the widget would silently show the wrong state); and a
// bare boolean `on` with every prop overridden also renders. StubPort
// (load-runtime) records the spans and simulates a Piu repaint via node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { Toggle } = await loadModule("runtime/toggle");
const { check, done } = makeChecker("toggle");

// The center-row (y === height/2) knob span is the widest knob span: fillCircle
// paints color at x = cx − knobR, width = 2*knobR + 1 on that row. Isolate it by
// color (the knob color differs from both pill colors), then recover cx.
const knobCenterX = (node, midY, knobColor, knobR) => {
	const s = node.spans.find((sp) => sp.y === midY && sp.color === knobColor);
	return s ? s.x + knobR : undefined; // cx = leftEdge + radius
};

// --- defaults + reactive thunk `on`: pill color + knob side track the signal ---
{
	const on = signal(true);
	const [node] = createRoot(() => Toggle({ on: () => on.value }));
	check("Toggle returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);

	// defaults: width 44, height 24 → r=12 (mid row y=12), knobR=10.
	node.paint();
	check(
		"on pill uses onColor default",
		node.spans.some((s) => s.color === "#00a000"),
	);
	check("on pill never uses offColor", !node.spans.some((s) => s.color === "#606060"));
	const onCx = knobCenterX(node, 12, "white", 10);
	check(
		"knob is a full disc (center span 2r+1 wide)",
		node.spans.some((s) => s.y === 12 && s.color === "white" && s.w === 21),
	);
	check("knob sits in the RIGHT half when on", onCx === 44 - 12 && onCx > 22);

	// reactive flip: the thunk read inside paint auto-tracks the signal.
	on.value = false;
	check("signal flip re-invalidates", node.invalidated === 2);
	node.paint();
	check(
		"off pill swaps to offColor",
		node.spans.some((s) => s.color === "#606060"),
	);
	check("off pill drops onColor", !node.spans.some((s) => s.color === "#00a000"));
	const offCx = knobCenterX(node, 12, "white", 10);
	check("knob slides to the LEFT half when off", offCx === 12 && offCx < 22);
	check("knob actually moved left on the flip", offCx < onCx);
}

// --- bare boolean `on` (non-thunk branch) + every prop overridden ---
{
	const [node] = createRoot(() =>
		Toggle({ on: false, width: 60, height: 30, onColor: "green", offColor: "#333", knob: "black" }),
	);
	node.paint();
	// width 60, height 30 → r=15 (mid row y=15), knobR=13.
	check(
		"custom offColor pill renders",
		node.spans.some((s) => s.color === "#333"),
	);
	check("bare boolean off never uses onColor", !node.spans.some((s) => s.color === "green"));
	const cx = knobCenterX(node, 15, "black", 13);
	check("custom knob color + left placement when off", cx === 15 && cx < 30);
}

done();
