// Scrollable suite — runtime/scrollable (opt-in free-form scroll viewport +
// ContentIndicator chevrons). Proves: WITHOUT `indicator`, Scrollable returns an
// clipping Container with EXPLICIT width+height (gotcha 16) wrapping an inner
// Column of the children; ONE effect scrolls the inner Column via the
// device-proven moveBy DELTA — ROUNDED (a float offset doesn't drift) and
// GUARDED (an unchanged offset issues no moveBy, Move's lx/ly guard). WITH
// `indicator`, it returns a Column of THREE non-overlapping bands — a "^" Label
// gutter, the clip window, a "v" Label gutter — and an effect flips each Label's
// `string` between the glyph and "" as `offset` crosses the ends (a device-safe
// Label write, NOT a draw Canvas overlay — gotcha 21). The standalone
// ContentIndicator flips ONE chevron Label from its boolean `show` thunk;
// defaults resolve to the screen width / GUTTER; and disposal stops the scroll
// effect. StubContent (load-runtime) is the Container/Column/Label and records
// movedY/moveCalls + the reactive `.string`. Style is the load-runtime Style
// stub (the lazy chevron Style) — no manual injection.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // Scrollable/ContentIndicator default their width here (gotcha 16)
jsxM.screen.height = 168; // (indicator gutters default their height to GUTTER, not this)
const { signal, createRoot } = signals;
const { Scrollable, ContentIndicator } = await loadModule("runtime/scrollable");
const { check, done } = makeChecker("scrollable");
const GUTTER = 26; // scrollable.ts's reserved chevron band height

// --- structure + defaults: clip viewport, inner column, mounted children ---
{
	const off = signal(0);
	const [node] = createRoot(() =>
		Scrollable({ height: 100, offset: () => off.value, children: ["A", "B", "C"] }),
	);
	check("Scrollable returns a container", node && typeof node.add === "function");
	// clip viewport carries an EXPLICIT width + height and CLIPS (gotcha 16) — a
	// size-less container measures 0 and draws nothing on device.
	check(
		"clip window is an explicit viewport (default width=screen, height as given)",
		node.width === 144 && node.height === 100 && node.clip === true,
	);
	const col = node.contents[0];
	check(
		"clip wraps exactly one inner Column (no indicator by default)",
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

// --- indicator gutters (app-provided `max`): chevron Labels flip at the ends ---
// clip height 140; app-provided max scroll 160.
{
	const off = signal(0);
	const [node] = createRoot(() =>
		Scrollable({
			height: 140,
			offset: () => off.value,
			max: 160,
			indicator: true,
			children: ["a", "b"],
		}),
	);
	// wrap is a Column of THREE non-overlapping bands: up gutter, clip, down gutter.
	check("with indicator, wrap holds THREE bands (up / clip / down)", node.contents.length === 3);
	check("wrap reserves a GUTTER band on each side of the clip", node.height === 140 + 2 * GUTTER);
	const up = node.contents[0];
	const clip = node.contents[1];
	const down = node.contents[2];
	const col = clip.contents[0];
	check(
		"the clip window sits between the two gutters, holding the inner column",
		clip.clip === true && clip.height === 140 && col && col.contents.length === 2,
	);
	check(
		"the gutters are Labels (NOT draw Ports — gotcha 21) sized to a GUTTER band",
		up.height === GUTTER && down.height === GUTTER && up.paint === undefined,
	);

	// at the top (offset 0): nothing above -> up blank; content below -> "v".
	off.value = 0;
	check('at the top (offset 0): up blank, down "v"', up.string === "" && down.string === "v");

	// mid-scroll: content both above and below -> both chevrons.
	off.value = 80;
	check('mid-scroll: both chevrons ("^" and "v")', up.string === "^" && down.string === "v");

	// at the max (offset == 160): content above -> "^"; nothing below -> down blank.
	off.value = 160;
	check(
		'at the bottom (offset == max): up "^", down blank',
		up.string === "^" && down.string === "",
	);

	// the SAME offset signal both scrolled the column and drove the chevrons.
	check(
		"the indicator shares the offset that scrolled the column",
		col.moveCalls === 2 && col.movedY === -160,
	);
}

// --- indicator WITHOUT `max`: the down chevron falls back to measured height ---
{
	const off = signal(0);
	const [node] = createRoot(() =>
		Scrollable({ height: 140, offset: () => off.value, indicator: true, children: ["a", "b"] }),
	);
	const down = node.contents[2];
	const col = node.contents[1].contents[0];
	// simulate Piu's post-mount measure pass: content taller than the 140 window.
	col.height = 300; // fallback max scroll = 300 - 140 = 160
	off.value = 10; // re-runs the effect now that column.height is valid
	check("fallback: down chevron derives max from measured column.height", down.string === "v"); // 10 < 160
	off.value = 200;
	check("fallback: down chevron hides past the measured max", down.string === ""); // 200 < 160 is false
}

// --- standalone ContentIndicator: edge, show flip, explicit size + style ---
{
	const s = signal(false);
	const styleObj = { font: "bold 24px Gothic" };
	const [up] = createRoot(() =>
		ContentIndicator({ edge: "up", show: () => s.value, width: 100, height: 40, style: styleObj }),
	);
	check(
		"ContentIndicator returns a Label sized as given, with the provided style",
		typeof up.add === "undefined" && up.width === 100 && up.height === 40 && up.style === styleObj,
	);
	check('edge "up", show false -> blank', up.string === "");
	s.value = true;
	check('edge "up", show true -> "^"', up.string === "^");
}

// --- standalone ContentIndicator: edge down + width/height defaults ---
{
	const d = signal(true);
	const [down] = createRoot(() => ContentIndicator({ edge: "down", show: () => d.value }));
	check('edge "down", show true -> "v"', down.string === "v");
	check(
		"ContentIndicator defaults width to the screen, height to GUTTER (gotcha 16)",
		down.width === 144 && down.height === GUTTER,
	);
	d.value = false;
	check('edge "down", show false -> blank', down.string === "");
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
