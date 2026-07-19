// Tabs suite — runtime/tabs (opt-in horizontal tab bar, display-only). Proves:
// Tabs returns an explicit full-width/height Row (gotcha 16) of `labels.length`
// equal Label cells whose strings match; the `active` cell wears `activeColor`
// (+ an optional `activeFill` Skin) while the rest wear `color`; a reactive
// `active` thunk moves the highlight on signal change (idiom 5b — drive the
// signal, re-read the cells' styles); an out-of-range `active` clamps to the
// ends; and every prop branch (width/height/color/activeColor defaults vs
// overrides, activeFill present vs absent, static number vs thunk, empty labels)
// is covered. `Style`/`Skin` are host compartment globals (absent in the Node
// sandbox) — inject stubs BEFORE loading tabs, the same idiom card.test uses, so
// each cell's `.style.d.color` / `.skin.d.fill` is assertable. StubContent
// (load-runtime) is the Row, StubLeaf the Labels.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // Tabs reads screen.width for its default width (gotcha 16)
// Style/Skin stubs: store the construction dict so color/fill are assertable.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
sandbox.Skin = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { Tabs } = await loadModule("runtime/tabs");
const { check, done } = makeChecker("tabs");

// --- defaults + static number active: cells, strings, colors, no activeFill ---
{
	const [row] = createRoot(() => Tabs({ labels: ["Home", "Stats", "Set"], active: 1 }));
	check("Tabs returns a Row container", row && typeof row.add === "function");
	// explicit width + height (gotcha 16) — a measure-0 Row draws nothing on device
	check(
		"Row carries explicit default width (screen) + height",
		row.width === 144 && row.height === 24,
	);
	check("one cell per label", row.contents.length === 3);
	check(
		"cell strings match the labels in order",
		row.contents[0].string === "Home" &&
			row.contents[1].string === "Stats" &&
			row.contents[2].string === "Set",
	);
	check("cells are equal 1/n slices of the width", row.contents[0].width === 144 / 3);
	check("cell height fills the bar", row.contents[0].height === 24);
	// active cell (index 1) uses the default activeColor; the rest use the default color
	check("active cell uses activeColor (default white)", row.contents[1].style.d.color === "white");
	check(
		"inactive cells use color (default #808080)",
		row.contents[0].style.d.color === "#808080" && row.contents[2].style.d.color === "#808080",
	);
	check(
		"default font is the valid 18px Gothic key",
		row.contents[1].style.d.font === "18px Gothic",
	);
	// no activeFill → the Skin path is skipped entirely (cells keep no skin)
	check(
		"no activeFill leaves cells unskinned",
		row.contents[0].skin === undefined && row.contents[1].skin === undefined,
	);
}

// --- reactive active thunk moves the highlight + activeFill Skin + overrides ---
{
	const a = signal(0);
	const [row] = createRoot(() =>
		Tabs({
			labels: ["A", "B", "C"],
			active: () => a.value,
			width: 120,
			height: 30,
			color: "#111",
			activeColor: "cyan",
			activeFill: "#004",
		}),
	);
	check("explicit width/height overrides applied", row.width === 120 && row.height === 30);
	check("override cell width is 1/n of the explicit width", row.contents[0].width === 40);
	// initial highlight on index 0: activeColor text + activeFill skin; others cleared
	check("initial active cell uses activeColor override", row.contents[0].style.d.color === "cyan");
	check("initial active cell wears the activeFill skin", row.contents[0].skin.d.fill === "#004");
	check("initial inactive cell uses color override", row.contents[1].style.d.color === "#111");
	check("initial inactive cell skin is cleared to null", row.contents[1].skin === null);
	// drive the signal → the highlight moves to index 2 (idiom 5b)
	a.value = 2;
	check(
		"reactive active moves the highlight",
		row.contents[2].style.d.color === "cyan" && row.contents[2].skin.d.fill === "#004",
	);
	check(
		"the previously-active cell reverts to inactive",
		row.contents[0].style.d.color === "#111" && row.contents[0].skin === null,
	);
}

// --- out-of-range active clamps to the ends ---
{
	const [over] = createRoot(() => Tabs({ labels: ["X", "Y"], active: 5 }));
	check(
		"an over-range index clamps to the last cell",
		over.contents[1].style.d.color === "white" && over.contents[0].style.d.color === "#808080",
	);
	const [under] = createRoot(() => Tabs({ labels: ["X", "Y"], active: -3 }));
	check(
		"a negative index clamps to the first cell",
		under.contents[0].style.d.color === "white" && under.contents[1].style.d.color === "#808080",
	);
}

// --- empty labels: an empty bar, no cells, no crash (n=0 branch) ---
{
	const [row] = createRoot(() => Tabs({ labels: [], active: 0 }));
	check("empty labels yield a cell-less Row", row.contents.length === 0);
	check("empty bar still carries an explicit width/height", row.width === 144 && row.height === 24);
}

done();
