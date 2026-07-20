// Scrollable suite — runtime/scrollable (opt-in free-form scroll viewport +
// ContentIndicator chevrons). Proves: Scrollable returns an outer clipping
// Container with EXPLICIT width+height (gotcha 16) wrapping an inner Column of
// the children; ONE effect scrolls the inner Column via the device-proven moveBy
// DELTA — ROUNDED (a float offset doesn't drift) and GUARDED (an unchanged
// offset issues no moveBy, Move's lx/ly guard); the optional overlay
// ContentIndicator paints an up chevron ONLY while offset>0 and a down chevron
// ONLY while offset<contentHeight-viewport, both flipping at the ends as
// `offset` moves; the standalone ContentIndicator paints from its two boolean
// thunks (all four up/down combinations); defaults resolve to the screen; and
// disposal stops the scroll effect (no moveBy after teardown). StubContent
// (load-runtime) is the Container/Column and records movedY/moveCalls for the
// scroll assertions; StubPort records the chevron fillColor spans and replays
// onDraw via .paint(). No Skin/Style injection is needed — Scrollable and Canvas
// build only Container/Column/Port.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // Scrollable/ContentIndicator default their width here (gotcha 16)
jsxM.screen.height = 168; // ContentIndicator defaults its height here
const { signal, createRoot } = signals;
const { Scrollable, ContentIndicator } = await loadModule("runtime/scrollable");
const { check, done } = makeChecker("scrollable");

// --- structure + defaults: clip viewport, inner column, mounted children ---
{
	const off = signal(0);
	const [node] = createRoot(() =>
		Scrollable({ height: 100, offset: () => off.value, children: ["A", "B", "C"] }),
	);
	check("Scrollable returns a container", node && typeof node.add === "function");
	// outer viewport carries an EXPLICIT width + height and CLIPS (gotcha 16) — a
	// size-less container measures 0 and draws nothing on device.
	check(
		"outer clips to an explicit viewport (default width=screen, height as given)",
		node.width === 144 && node.height === 100 && node.clip === true,
	);
	const col = node.contents[0];
	check(
		"outer wraps exactly one inner Column (no indicator by default)",
		node.contents.length === 1 && col && typeof col.add === "function",
	);
	check(
		"inner column is pinned top-left with an explicit width",
		col.left === 0 && col.top === 0 && col.width === 144,
	);
	check(
		"children mount as rows in the inner column, in order",
		col.contents.length === 3 && col.contents[0].string === "A" && col.contents[2].string === "C",
	);
	check("a freshly-built scrollable has not scrolled (offset 0)", (col.moveCalls || 0) === 0);
}

// --- childless scrollable: an empty inner column, no crash ---
{
	const [node] = createRoot(() => Scrollable({ height: 40, offset: () => 0 }));
	check(
		"a childless Scrollable is a viewport over an empty column",
		node.contents.length === 1 && node.contents[0].contents.length === 0,
	);
}

// --- scroll: moveBy DELTA, width override, rounding, and the Move guard ---
{
	const off = signal(0);
	const [node] = createRoot(() =>
		Scrollable({ height: 60, width: 120, offset: () => off.value, children: ["r"] }),
	);
	check(
		"explicit width overrides the default viewport width",
		node.width === 120 && node.height === 60,
	);
	const col = node.contents[0];
	check("no scroll at construction (offset 0)", (col.moveCalls || 0) === 0);

	off.value = 20;
	check(
		"scrolling to offset 20 shifts the column UP by 20 (moveBy delta)",
		col.movedY === -20 && col.moveCalls === 1,
	);

	off.value = 50;
	check(
		"scrolling on to offset 50 applies the +30 delta (up another 30)",
		col.movedY === -50 && col.moveCalls === 2,
	);

	off.value = 20;
	check(
		"scrolling back to offset 20 applies a downward +30 delta",
		col.movedY === -20 && col.moveCalls === 3,
	);

	// fractional offsets round to whole px BEFORE diffing (like Move) — a sub-px
	// wiggle within the same rounded px issues no moveBy at all (the guard).
	off.value = 20.4;
	check(
		"a sub-px change (20 -> 20.4 rounds to 20) issues no moveBy (guard holds)",
		col.moveCalls === 3 && col.movedY === -20,
	);
	off.value = 20.6;
	check(
		"crossing to 20.6 (rounds to 21) shifts up exactly 1 more px",
		col.movedY === -21 && col.moveCalls === 4,
	);
}

// --- indicator overlay: chevrons flip canUp/canDown at the ends of the scroll ---
// viewport height 140; simulated measured content height 300 -> max scroll 160.
{
	const off = signal(0);
	const [node] = createRoot(() =>
		Scrollable({ height: 140, offset: () => off.value, indicator: true, children: ["a", "b"] }),
	);
	check("with indicator, outer holds the column AND the overlay", node.contents.length === 2);
	const col = node.contents[0];
	const ind = node.contents[1];
	check(
		"the overlay is a Port sized to the viewport",
		ind.width === 144 && ind.height === 140 && typeof ind.paint === "function",
	);
	// simulate Piu's post-mount measure pass: content taller than the 140 viewport.
	col.height = 300; // max scroll = 300 - 140 = 160
	const HALF = 70; // height/2 — up-chevron spans sit above it, down-chevron below

	// at the top (offset 0): nothing above -> NO up chevron; content below -> down.
	off.value = 0;
	ind.paint();
	check(
		"at the top (offset 0) only the DOWN chevron paints",
		ind.spans.length > 0 &&
			!ind.spans.some((s) => s.y < HALF) &&
			ind.spans.some((s) => s.y >= HALF),
	);

	// mid-scroll: content both above and below -> BOTH chevrons.
	off.value = 80;
	ind.paint();
	check(
		"mid-scroll paints BOTH chevrons (top and bottom)",
		ind.spans.some((s) => s.y < HALF) && ind.spans.some((s) => s.y >= HALF),
	);

	// at the max (offset == 160): content above -> UP chevron; nothing below -> NO down.
	off.value = 160;
	ind.paint();
	check(
		"at the bottom (offset == max) only the UP chevron paints",
		ind.spans.some((s) => s.y < HALF) && !ind.spans.some((s) => s.y >= HALF),
	);

	// the SAME offset signal both scrolled the column and drove the chevrons.
	check(
		"the indicator shares the offset that scrolled the column",
		col.moveCalls === 2 && col.movedY === -160,
	);
}

// --- standalone ContentIndicator: all four up/down paint combinations ---
{
	const up = signal(false);
	const down = signal(false);
	const [ind] = createRoot(() =>
		ContentIndicator({ canUp: () => up.value, canDown: () => down.value, width: 100, height: 80 }),
	);
	check(
		"ContentIndicator returns a Port sized as given",
		typeof ind.paint === "function" && ind.width === 100 && ind.height === 80,
	);
	const HALF = 40; // height/2

	ind.paint();
	check("neither flag -> no chevrons drawn", ind.spans.length === 0);

	up.value = true;
	ind.paint();
	check(
		"canUp only -> a chevron near the top, none at the bottom",
		ind.spans.length > 0 && ind.spans.every((s) => s.y < HALF),
	);

	up.value = false;
	down.value = true;
	ind.paint();
	check(
		"canDown only -> a chevron near the bottom, none at the top",
		ind.spans.length > 0 && ind.spans.every((s) => s.y >= HALF),
	);

	up.value = true;
	ind.paint();
	check(
		"both flags -> chevrons at both ends",
		ind.spans.some((s) => s.y < HALF) && ind.spans.some((s) => s.y >= HALF),
	);
}

// --- ContentIndicator defaults its width/height to the screen ---
{
	const [ind] = createRoot(() => ContentIndicator({ canUp: () => false, canDown: () => false }));
	check(
		"ContentIndicator defaults width/height to the screen (gotcha 16)",
		ind.width === 144 && ind.height === 168,
	);
}

// --- disposal stops the scroll effect (no moveBy after teardown) ---
{
	const off = signal(0);
	const [node, dispose] = createRoot(() =>
		Scrollable({ height: 50, offset: () => off.value, children: ["x"] }),
	);
	const col = node.contents[0];
	off.value = 10;
	check(
		"pre-dispose: an offset change scrolls the column",
		col.moveCalls === 1 && col.movedY === -10,
	);
	dispose();
	off.value = 40;
	check(
		"post-dispose: the scroll effect is gone (no further moveBy)",
		col.moveCalls === 1 && col.movedY === -10,
	);
}

done();
