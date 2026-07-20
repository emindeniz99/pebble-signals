// Picker suite — runtime/picker (opt-in value carousel, display-only). Proves:
// Picker returns an explicit full-width/height Column (gotcha 16) of EXACTLY
// three Label rows (prev/current/next), each an explicit width + floor(height/3)
// slice; the current row wears `font`/`activeColor` while the two neighbors
// share ONE `sideFont`/`color` Style (Rule 4 — shared, not per-row); the window
// strings are correct for a middle index; out-of-range neighbors are blank when
// `wrap` is false and wrap modulo the list when `wrap` is true (last↔first); a
// reactive `selected` thunk slides all three rows on signal change (idiom 5b —
// drive the signal, re-read the rows), and disposing the root stops it; the
// current index CLAMPS to `[0, options.length-1]` at both ends (Rule 8); and the
// single-option and empty-options edges render without a crash. Every prop
// default vs override branch is exercised for 100% line/branch/function
// coverage. `Style` is a host compartment global (absent in the Node sandbox) —
// inject a dict-storing stub BEFORE loading picker (the tabs.test idiom) so each
// row's `.style.d.font` / `.style.d.color` is assertable. StubContent
// (load-runtime) is the Column, StubLeaf the Labels.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // Picker reads screen.width for its default width (gotcha 16)
// Style stub: store the construction dict so font/color are assertable. (Picker
// builds no Skin, so only Style is injected.)
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { Picker } = await loadModule("runtime/picker");
const { check, done } = makeChecker("picker");

// --- defaults + static middle index: rows, strings, fonts, colors, layout ---
{
	const [col] = createRoot(() => Picker({ options: ["A", "B", "C", "D"], selected: 1 }));
	check("Picker returns a Column container", col && typeof col.add === "function");
	// explicit width + height (gotcha 16) — a measure-0 Column draws nothing on device
	check(
		"Column carries explicit default width (screen) + height",
		col.width === 144 && col.height === 96,
	);
	check("exactly three rows (prev/current/next)", col.contents.length === 3);
	// each row: explicit width (the picker width) + floor(height/3) height
	check(
		"rows are explicit width + floor(height/3) slices",
		col.contents[0].width === 144 &&
			col.contents[0].height === 32 &&
			col.contents[1].height === 32 &&
			col.contents[2].height === 32,
	);
	// middle index 1 → prev=options[0], current=options[1], next=options[2]
	check(
		"middle index strings the window prev/current/next",
		col.contents[0].string === "A" &&
			col.contents[1].string === "B" &&
			col.contents[2].string === "C",
	);
	// current row uses the default current font/activeColor
	check(
		"current row uses default font + activeColor (24px Gothic / white)",
		col.contents[1].style.d.font === "24px Gothic" && col.contents[1].style.d.color === "white",
	);
	// both neighbors use the default side font/color
	check(
		"neighbor rows use default sideFont + color (18px Gothic / #808080)",
		col.contents[0].style.d.font === "18px Gothic" &&
			col.contents[0].style.d.color === "#808080" &&
			col.contents[2].style.d.font === "18px Gothic" &&
			col.contents[2].style.d.color === "#808080",
	);
	// Rule 4 — ONE shared side Style backs BOTH neighbors; the current row's is distinct
	check(
		"both neighbors share one Style object; current is a distinct Style",
		col.contents[0].style === col.contents[2].style &&
			col.contents[1].style !== col.contents[0].style,
	);
}

// --- wrap=false boundaries: an out-of-range neighbor is blank ---
{
	const [top] = createRoot(() => Picker({ options: ["A", "B", "C"], selected: 0 }));
	check(
		"index 0, wrap off → prev is blank, current/next fill",
		top.contents[0].string === "" &&
			top.contents[1].string === "A" &&
			top.contents[2].string === "B",
	);
	const [bot] = createRoot(() => Picker({ options: ["A", "B", "C"], selected: 2 }));
	check(
		"last index, wrap off → next is blank, prev/current fill",
		bot.contents[0].string === "B" &&
			bot.contents[1].string === "C" &&
			bot.contents[2].string === "",
	);
}

// --- wrap=true carousel: neighbors wrap modulo the list (last↔first) ---
{
	const [top] = createRoot(() => Picker({ options: ["A", "B", "C"], selected: 0, wrap: true }));
	check(
		"index 0, wrap on → prev wraps to the LAST option",
		top.contents[0].string === "C" &&
			top.contents[1].string === "A" &&
			top.contents[2].string === "B",
	);
	const [bot] = createRoot(() => Picker({ options: ["A", "B", "C"], selected: 2, wrap: true }));
	check(
		"last index, wrap on → next wraps to the FIRST option",
		bot.contents[0].string === "B" &&
			bot.contents[1].string === "C" &&
			bot.contents[2].string === "A",
	);
}

// --- reactive selected thunk slides the window (idiom 5b) + disposal stops it ---
{
	const sel = signal(1);
	const [col, dispose] = createRoot(() =>
		Picker({ options: ["A", "B", "C", "D", "E"], selected: () => sel.value, wrap: true }),
	);
	check(
		"reactive initial window renders",
		col.contents[0].string === "A" &&
			col.contents[1].string === "B" &&
			col.contents[2].string === "C",
	);
	// drive the signal → the whole window slides (idiom 5b — reads inside the effect auto-track)
	sel.value = 3;
	check(
		"reactive selected slides all three rows",
		col.contents[0].string === "C" &&
			col.contents[1].string === "D" &&
			col.contents[2].string === "E",
	);
	// at the last index with wrap on, the next row wraps to the first option
	sel.value = 4;
	check(
		"reactive last index wraps the next row (carousel)",
		col.contents[0].string === "D" &&
			col.contents[1].string === "E" &&
			col.contents[2].string === "A",
	);
	// disposing the root disposes the driving effect: a later write is inert
	dispose();
	sel.value = 0;
	check(
		"disposed Picker stops sliding",
		col.contents[0].string === "D" &&
			col.contents[1].string === "E" &&
			col.contents[2].string === "A",
	);
}

// --- overrides: width/height/color/activeColor/font/sideFont all forwarded ---
{
	const [col] = createRoot(() =>
		Picker({
			options: ["X", "Y", "Z"],
			selected: 1,
			width: 120,
			height: 60,
			color: "#111",
			activeColor: "cyan",
			font: "bold 24px Gothic",
			sideFont: "14px Gothic",
			wrap: false,
		}),
	);
	check("explicit width/height overrides applied", col.width === 120 && col.height === 60);
	check(
		"row slices track the explicit width + floor(height/3)",
		col.contents[0].width === 120 && col.contents[0].height === 20,
	);
	check(
		"current row uses font + activeColor overrides",
		col.contents[1].style.d.font === "bold 24px Gothic" && col.contents[1].style.d.color === "cyan",
	);
	check(
		"neighbor rows use sideFont + color overrides",
		col.contents[0].style.d.font === "14px Gothic" && col.contents[0].style.d.color === "#111",
	);
}

// --- out-of-range selected clamps the current index to the ends (Rule 8) ---
{
	// over-range: clamps to the last valid index (n-1)
	const [over] = createRoot(() => Picker({ options: ["A", "B"], selected: 5 }));
	check(
		"an over-range index clamps current to the last option",
		over.contents[1].string === "B" &&
			over.contents[0].string === "A" &&
			over.contents[2].string === "",
	);
	// negative: clamps to the first valid index (0)
	const [under] = createRoot(() => Picker({ options: ["A", "B"], selected: -3 }));
	check(
		"a negative index clamps current to the first option",
		under.contents[1].string === "A" &&
			under.contents[0].string === "" &&
			under.contents[2].string === "B",
	);
}

// --- single option: neighbors blank (wrap off) or the same option (wrap on) ---
{
	const [off] = createRoot(() => Picker({ options: ["Solo"], selected: 0 }));
	check(
		"one option, wrap off → current shows it, both neighbors blank",
		off.contents[0].string === "" &&
			off.contents[1].string === "Solo" &&
			off.contents[2].string === "",
	);
	const [on] = createRoot(() => Picker({ options: ["Solo"], selected: 0, wrap: true }));
	check(
		"one option, wrap on → all three rows show the single option",
		on.contents[0].string === "Solo" &&
			on.contents[1].string === "Solo" &&
			on.contents[2].string === "Solo",
	);
}

// --- empty options: three blank rows, explicit box, no crash (n===0 branch) ---
{
	const [col] = createRoot(() => Picker({ options: [], selected: 0 }));
	check("empty options still yields three rows", col.contents.length === 3);
	check(
		"empty options leaves every row blank",
		col.contents[0].string === "" && col.contents[1].string === "" && col.contents[2].string === "",
	);
	check(
		"empty Picker still carries an explicit width/height",
		col.width === 144 && col.height === 96,
	);
}

done();
