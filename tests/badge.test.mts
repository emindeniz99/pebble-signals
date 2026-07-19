// Badge suite — runtime/badge (opt-in count Badge composed over runtime/draw's
// Canvas). Proves: Badge returns a Port node; node.paint() rasterizes ONE disc
// (a wide fillColor span on the vertical-center row) plus a drawString of the
// count; a reactive `count` thunk re-invalidates on signal change and the next
// paint shows the new number; a bare numeric count also renders; and every
// prop default (size/color/textColor/style) resolves. StubPort (load-runtime)
// records the spans + strings and simulates a Piu repaint via node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
// `Style` is a host compartment global (absent in the Node sandbox); inject a
// stub BEFORE loading badge so its module-scope default Style constructs — the
// same idiom jsx.test.mts uses for the crash-boundary Style.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { Badge } = await loadModule("runtime/badge");
const { check, done } = makeChecker("badge");

// --- defaults + reactive thunk count: disc + number, repaint on change ---
{
	const c = signal(3);
	const [node] = createRoot(() => Badge({ count: () => c.value }));
	check("Badge returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();
	// default size 28 → cx=cy=14, r=14 → the vertical-center row spans 2r+1=29px.
	const mid = node.spans.find((s) => s.y === 14);
	check("disc paints a wide span on the center row", mid && mid.w === 29);
	check("disc fill defaults to red", mid.color === "red");
	check("number is drawn once", node.strings.length === 1);
	check("number equals the count", node.strings[0].str === "3");
	// reactive: the thunk read inside paint auto-tracks the signal.
	c.value = 12;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	check("repaint shows the new number", node.strings[0].str === "12");
	check(
		"disc still paints after change",
		node.spans.some((s) => s.y === 14 && s.w === 29),
	);
}

// --- all props provided + bare numeric count (non-thunk branch) ---
{
	const style = new sandbox.Style({ font: "24px Gothic" });
	const [node] = createRoot(() =>
		Badge({ count: 7, size: 40, color: "blue", textColor: "black", style }),
	);
	node.paint();
	// size 40 → cx=cy=20, r=20 → center row spans 41px.
	const mid = node.spans.find((s) => s.y === 20);
	check("custom size disc paints a wide center span", mid && mid.w === 41);
	check("custom disc color forwarded", mid.color === "blue");
	check("numeric (non-thunk) count renders", node.strings[0].str === "7");
}

done();
