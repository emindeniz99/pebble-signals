// Draw suite — runtime/draw (opt-in immediate-mode Canvas). Exercises the
// JS-rasterized fillColor scanline geometry (the substrate the drawprobe
// measured — no native circle on the Piu Port), the auto-tracked reactive
// repaint (paint reruns in a non-drawing tracking pass → invalidate), and
// every prop/guard branch. StubPort (load-runtime) records fillColor spans +
// drawString and simulates a Piu repaint via node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, draw } = await loadRuntime();
const { signal, createRoot } = signals;
const { Canvas } = draw;
const { check, done } = makeChecker("draw");

// --- fillCircle geometry: 2r+1 rows, widest row centered ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 100, height: 100, paint: (g) => g.fillCircle(50, 50, 10, "red") }),
	);
	check("mount runs the effect once (invalidate)", node.invalidated === 1);
	check("tracking pass draws nothing (drawing=false)", node.spans.length === 0);
	node.paint();
	check("fillCircle emits 2r+1 rows", node.spans.length === 21);
	const mid = node.spans.find((s) => s.y === 50);
	check("widest row spans the diameter", mid.w === 21);
	check("widest row starts at cx-r", mid.x === 40);
	check("widest row color forwarded", mid.color === "red");
	const top = node.spans.find((s) => s.y === 40); // dy=-10 → dx=0 → width 1
	check("cap row is a single pixel", top.w === 1 && top.x === 50);
}

// --- fillCircle r<=0 draws nothing ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 40, paint: (g) => g.fillCircle(20, 20, 0, "red") }),
	);
	node.paint();
	check("r<=0 draws nothing", node.spans.length === 0);
}

// --- reactivity: signal change repaints with the new value ---
{
	const r = signal(4);
	const [node] = createRoot(() =>
		Canvas({ width: 60, height: 60, paint: (g) => g.fillCircle(30, 30, r.value, "blue") }),
	);
	check("initial invalidate", node.invalidated === 1);
	node.paint();
	check("r=4 → 9 rows", node.spans.length === 9);
	r.value = 6;
	check("signal change re-invalidates", node.invalidated === 2);
	node.paint();
	check("r=6 → 13 rows after change", node.spans.length === 13);
}

// --- dispose stops the effect (no repaint after teardown) ---
{
	const r = signal(3);
	const [node, dispose] = createRoot(() =>
		Canvas({ width: 40, height: 40, paint: (g) => g.fillCircle(20, 20, r.value, "red") }),
	);
	check("pre-dispose invalidate", node.invalidated === 1);
	dispose();
	r.value = 9;
	check("no invalidate after dispose", node.invalidated === 1);
}

// --- fillRect: normal + zero/negative clamp ---
{
	const [node] = createRoot(() =>
		Canvas({
			width: 50,
			height: 50,
			paint: (g) => {
				g.fillRect(5, 5, 10, 8, "green");
				g.fillRect(0, 0, 0, 8, "green"); // w<=0 → skip
				g.fillRect(0, 0, 8, -1, "green"); // h<=0 → skip
			},
		}),
	);
	node.paint();
	check("fillRect emits one span, zero/neg clamped", node.spans.length === 1);
	check("fillRect forwards its rect", node.spans[0].w === 10 && node.spans[0].h === 8);
}

// --- fill background: an opaque canvas paints the full surface first ---
{
	const [node] = createRoot(() =>
		Canvas({
			width: 30,
			height: 20,
			fill: "black",
			paint: (g) => g.fillRect(1, 1, 2, 2, "white"),
		}),
	);
	node.paint();
	check("background is the first span", node.spans[0].color === "black");
	check("background covers the whole surface", node.spans[0].w === 30 && node.spans[0].h === 20);
	check("foreground paints after", node.spans[1].color === "white");
}

// --- strokeCircle: default 1px ring leaves a hole; caps are solid ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 60, height: 60, paint: (g) => g.strokeCircle(30, 30, 10, "white") }),
	);
	node.paint();
	const midRows = node.spans.filter((s) => s.y === 30);
	check("ring middle row splits into two side spans", midRows.length === 2);
	check("side span is 1px (thickness default)", midRows[0].w === 1);
	// a near-cap row (dy just outside the inner circle) is a single solid span
	const solid = node.spans.filter((s) => s.y === 21); // dy=-9, outside inner r=9
	check("cap row is a single solid span", solid.length === 1);
}

// --- strokeCircle: thickness >= r fills a solid disc (inner<=0 branch) ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 40, paint: (g) => g.strokeCircle(20, 20, 6, "red", 9) }),
	);
	node.paint();
	const midRows = node.spans.filter((s) => s.y === 20);
	check("thick stroke → solid center row (no hole)", midRows.length === 1);
	check("solid row spans the diameter", midRows[0].w === 13);
}

// --- strokeCircle r<=0 draws nothing ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 20, height: 20, paint: (g) => g.strokeCircle(10, 10, 0, "red") }),
	);
	node.paint();
	check("strokeCircle r<=0 draws nothing", node.spans.length === 0);
}

// --- text passthrough to drawString ---
{
	const [node] = createRoot(() =>
		Canvas({
			width: 80,
			height: 30,
			paint: (g) => g.text("hi", null, "white", 4, 6),
		}),
	);
	node.paint();
	check("text records one drawString", node.strings.length === 1);
	check("text forwards string + position", node.strings[0].str === "hi" && node.strings[0].x === 4);
}

// --- width/height default to screen; box props pass through ---
{
	jsxM.screen.width = 144;
	jsxM.screen.height = 168;
	let dict;
	const OrigPort = globalThis.Port;
	const [node] = createRoot(() =>
		Canvas({ left: 3, right: 4, top: 5, bottom: 6, paint: () => {} }),
	);
	dict = node; // StubPort merged the construction dict onto itself
	check("width defaults to screen", node.width === 144);
	check("height defaults to screen", node.height === 168);
	check("left/right/top/bottom pass through", dict.left === 3 && dict.bottom === 6);
	void OrigPort;
}

done();
