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

// --- onDisplaying forces the first paint once the port is attached ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 40, paint: (g) => g.fillCircle(20, 20, 8, "red") }),
	);
	const before = node.invalidated;
	node.behavior.onDisplaying(node); // Piu calls this when the port joins the tree
	check("onDisplaying invalidates to trigger the first frame", node.invalidated === before + 1);
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

// --- line: horizontal is ONE crisp span, full length × thickness, centered ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 60, height: 30, paint: (g) => g.line(10, 5, 30, 5, 3, "red") }),
	);
	node.paint();
	check("horizontal line emits exactly one span", node.spans.length === 1);
	const s = node.spans[0];
	// length = |30-10|+1 = 21, thickness 3, x at min, y centered (5 - (3>>1) = 4)
	check("horizontal span is full length × thickness", s.w === 21 && s.h === 3);
	check("horizontal span starts at min x, centered on y", s.x === 10 && s.y === 4);
	check("horizontal span forwards color", s.color === "red");
}

// --- line: right-to-left horizontal + thickness<=0 clamps to 1 ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 60, height: 30, paint: (g) => g.line(30, 8, 10, 8, 0, "red") }),
	);
	node.paint();
	check("R→L horizontal still one span", node.spans.length === 1);
	// x1<x0 → span pinned to the min x; thickness 0 → t=1 (no negative height)
	check("R→L span pinned to min x", node.spans[0].x === 10 && node.spans[0].w === 21);
	check("thickness<=0 treated as 1px", node.spans[0].h === 1 && node.spans[0].y === 8);
}

// --- line: vertical (both directions) is ONE crisp span ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 30, height: 40, paint: (g) => g.line(7, 2, 7, 12, 2, "blue") }),
	);
	node.paint();
	check("vertical line emits exactly one span", node.spans.length === 1);
	// height = |12-2|+1 = 11, width 2, x centered (7 - (2>>1) = 6), y at min
	check(
		"vertical span is thickness × full length",
		node.spans[0].w === 2 && node.spans[0].h === 11,
	);
	check("vertical span centered on x, y at min", node.spans[0].x === 6 && node.spans[0].y === 2);
}
{
	const [node] = createRoot(() =>
		Canvas({ width: 30, height: 40, paint: (g) => g.line(9, 20, 9, 4, 1, "blue") }),
	);
	node.paint();
	// y1<y0 → span pinned to the min y; height = |4-20|+1 = 17
	check("bottom→top vertical pinned to min y", node.spans[0].y === 4 && node.spans[0].h === 17);
}

// --- line: diagonals DDA into multiple t×t blocks along the major axis ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 40, paint: (g) => g.line(0, 0, 10, 4, 1, "green") }),
	);
	node.paint();
	// x-major: steps = max(10,4) = 10 → 11 stamped blocks
	check("x-major diagonal emits multiple blocks", node.spans.length === 11);
	check("each diagonal block is t×t", node.spans[0].w === 1 && node.spans[0].h === 1);
}
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 40, paint: (g) => g.line(0, 0, 4, 10, 1, "green") }),
	);
	node.paint();
	// y-major: steps = max(4,10) = 10 → 11 blocks (exercises the other axis branch)
	check("y-major diagonal emits multiple blocks", node.spans.length === 11);
}

// --- fillRoundRect: middle band full-width, corner rows inset, no gaps ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 60, height: 50, paint: (g) => g.fillRoundRect(0, 0, 40, 30, 6, "red") }),
	);
	node.paint();
	// middle band is one full-width span starting at y = r
	const mid = node.spans.find((s) => s.y === 6 && s.h > 1);
	check("round-rect middle band is one full-width span", mid.w === 40);
	// the very top corner row (y=0, dy=-r → dx=0) is inset by r on each side
	const corner = node.spans.find((s) => s.y === 0);
	check("round-rect corner row is inset (narrower)", corner.w === 28 && corner.w < 40);
	check("round-rect corner row insets both ends symmetrically", corner.x === 6);
}

// --- fillRoundRect: r>=w/2,h/2 exercises zero-width corner + empty middle band ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 20, height: 20, paint: (g) => g.fillRoundRect(0, 0, 10, 10, 8, "red") }),
	);
	node.paint();
	// rr clamps to min(8,5,5)=5; midH = 10-10 = 0 (no middle span); the extreme
	// corner rows (dy=±5 → dx=0 → width 0) are skipped, inner corner rows drawn
	check(
		"no full-height middle span when h==2r",
		node.spans.every((s) => s.h === 1),
	);
	check(
		"zero-width corner rows skipped",
		node.spans.every((s) => s.w > 0),
	);
	check("inner corner rows still drawn", node.spans.length > 0);
}

// --- fillRoundRect: r<=0 delegates to a single full-surface span ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 30, height: 20, paint: (g) => g.fillRoundRect(2, 3, 24, 14, 0, "blue") }),
	);
	node.paint();
	check("r<=0 delegates to a single full span", node.spans.length === 1);
	check("delegated span covers the whole rect", node.spans[0].w === 24 && node.spans[0].h === 14);
}

// --- strokeRect: 4 edge spans, each thickness px wide ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 30, paint: (g) => g.strokeRect(0, 0, 20, 10, 2, "white") }),
	);
	node.paint();
	check("strokeRect emits exactly 4 edge spans", node.spans.length === 4);
	check("top edge is w × t", node.spans[0].w === 20 && node.spans[0].h === 2);
	check("bottom edge sits at y+h-t", node.spans[1].y === 8);
	check("right edge sits at x+w-t", node.spans[3].x === 18 && node.spans[3].w === 2);
}

// --- strokeRect: thickness<=0 clamps each edge to 1px ---
{
	const [node] = createRoot(() =>
		Canvas({ width: 40, height: 30, paint: (g) => g.strokeRect(0, 0, 20, 10, 0, "white") }),
	);
	node.paint();
	check("strokeRect thickness<=0 → 1px edges", node.spans.length === 4 && node.spans[0].h === 1);
}

done();
