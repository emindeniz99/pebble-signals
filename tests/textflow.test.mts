// TextFlow suite — runtime/textflow (opt-in wrapped paragraph, display-only).
// Proves: `wrapText` is a pure greedy word-wrapper (known string -> expected line
// sequence for a budget; a lone over-budget word takes its own line; maxLines
// truncates; maxLines<=0 and empty/whitespace text yield no lines); and TextFlow
// returns an explicit-width Column (gotcha 16) whose height is lines.length*
// lineHeight, holding one explicit-width/height Label per line, all sharing ONE
// Style (font/color/horizontal). Every prop branch (width/charsPerLine/font/
// color/lineHeight/align/maxLines defaults vs overrides, the charsPerLine floor
// clamp, static string vs reactive thunk) is covered; a reactive thunk re-wraps
// and REBUILDS the Column on signal change (drive the signal, re-read the lines +
// count + height). `Style` is a host compartment global (absent in the Node
// sandbox) — inject a dict-storing stub BEFORE loading textflow (the tabs.test
// idiom) so each line's `.style.d.{font,color,horizontal}` is assertable.
// StubContent (load-runtime) is the Column, StubLeaf the line Labels.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // TextFlow reads screen.width for its default width (gotcha 16)
// Style stub: store the construction dict so font/color/horizontal are assertable.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
jsxM.screen.height = 168; // circle radius uses min(width,height)/2
const { signal, createRoot } = signals;
const { TextFlow, wrapText, wrapCircle } = await loadModule("runtime/textflow");
const { check, done } = makeChecker("textflow");

const LOREM =
	"Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam";

// --- wrapText: a known string wraps into the EXPECTED line sequence ---
{
	const lines = wrapText("the quick brown fox jumps over the lazy dog", 16, 8);
	check("wrapText greedily packs to the budget", lines.length === 3);
	check(
		"wrapText produces the exact expected lines",
		lines[0] === "the quick brown" && lines[1] === "fox jumps over" && lines[2] === "the lazy dog",
	);
	check(
		"no wrapped line exceeds the char budget",
		lines.every((l: string) => l.length <= 16),
	);
}

// --- wrapText: a lone word longer than the budget gets its OWN line (no crash) ---
{
	const lines = wrapText("hi supercalifragilistic yo", 5, 8);
	check("an over-budget word is placed on its own line", lines.length === 3);
	check(
		"the long word occupies a line by itself, unsplit",
		lines[0] === "hi" && lines[1] === "supercalifragilistic" && lines[2] === "yo",
	);
}

// --- wrapText: maxLines truncates (extra lines dropped, via the else-return) ---
{
	const lines = wrapText("a b c d e f", 3, 2);
	check("maxLines caps the returned line count", lines.length === 2);
	check("truncation keeps the FIRST maxLines lines", lines[0] === "a b" && lines[1] === "c d");
}

// --- wrapText: degenerate + empty inputs yield no lines (edge branches) ---
{
	check("maxLines<=0 yields no lines", wrapText("a b c", 5, 0).length === 0);
	check("empty text yields no lines", wrapText("", 16, 8).length === 0);
	check("whitespace-only text yields no lines", wrapText("   \t  ", 16, 8).length === 0);
	// leading whitespace exercises the empty-token skip WITH a real result
	const led = wrapText("  hello world", 20, 8);
	check("leading whitespace collapses to one line", led.length === 1 && led[0] === "hello world");
}

// --- TextFlow defaults: Column shape, one Label per line, shared default Style ---
{
	const [col] = createRoot(() =>
		TextFlow({ text: "the quick brown fox jumps over the lazy dog", charsPerLine: 16 }),
	);
	check("TextFlow returns a Column container", col && typeof col.add === "function");
	// explicit width (default screen) + height = lines.length * lineHeight (gotcha 16)
	check("Column carries the default screen width", col.width === 144);
	check("Column height is lines.length * lineHeight (3*22)", col.height === 3 * 22);
	check("one Label per wrapped line", col.contents.length === 3);
	check(
		"Label strings are the wrapped lines in order",
		col.contents[0].string === "the quick brown" &&
			col.contents[1].string === "fox jumps over" &&
			col.contents[2].string === "the lazy dog",
	);
	check(
		"each Label carries explicit width + lineHeight (gotcha 16)",
		col.contents[0].width === 144 && col.contents[0].height === 22,
	);
	// ONE shared Style backs every line — indices, not per-line allocations
	check(
		"all line Labels share the ONE Style object",
		col.contents[0].style === col.contents[1].style &&
			col.contents[1].style === col.contents[2].style,
	);
	check(
		"default font is the valid 18px Gothic key",
		col.contents[0].style.d.font === "18px Gothic",
	);
	check("default color is white", col.contents[0].style.d.color === "white");
	check(
		"default alignment is left (the reliable default)",
		col.contents[0].style.d.horizontal === "left",
	);
}

// --- TextFlow overrides: every prop branch + align=center + maxLines truncation ---
{
	const [col] = createRoot(() =>
		TextFlow({
			text: "a b c d e f g h i j k l",
			width: 100,
			charsPerLine: 10,
			font: "24px Gothic",
			color: "#0ff",
			lineHeight: 30,
			align: "center",
			maxLines: 2,
		}),
	);
	check("explicit width override applied to the Column", col.width === 100);
	check("maxLines truncates the Column to 2 lines", col.contents.length === 2);
	check("Column height uses the lineHeight override (2*30)", col.height === 2 * 30);
	check(
		"truncated lines are the first two packed lines",
		col.contents[0].string === "a b c d e" && col.contents[1].string === "f g h i j",
	);
	check("Label width follows the override", col.contents[0].width === 100);
	check("Label height follows the lineHeight override", col.contents[0].height === 30);
	check("font override applied", col.contents[0].style.d.font === "24px Gothic");
	check("color override applied", col.contents[0].style.d.color === "#0ff");
	check(
		"align=center sets the style horizontal to center",
		col.contents[0].style.d.horizontal === "center",
	);
}

// --- TextFlow: default charsPerLine is derived from width via floor(width/9) ---
{
	// width 90 -> floor(90/9) = 10 chars/line
	const [col] = createRoot(() => TextFlow({ text: "a b c d e f g h", width: 90 }));
	check(
		"default charsPerLine = floor(width/9) packs ~10 chars/line",
		col.contents[0].string === "a b c d e" && col.contents[0].string.length <= 10,
	);
	// tiny width -> floor(5/9) = 0 -> the max(1, ...) clamp keeps at least 1
	const [narrow] = createRoot(() => TextFlow({ text: "ab cd", width: 5 }));
	check(
		"charsPerLine clamps to >=1 for a tiny width (every word its own line)",
		narrow.contents.length === 2 &&
			narrow.contents[0].string === "ab" &&
			narrow.contents[1].string === "cd",
	);
}

// --- TextFlow reactive thunk: signal change re-wraps + REBUILDS the Column ---
{
	const t = signal("one two three");
	const [col] = createRoot(() =>
		TextFlow({ text: () => t.value, width: 60, charsPerLine: 7, lineHeight: 10, maxLines: 8 }),
	);
	// initial wrap of "one two three" at budget 7 -> ["one two", "three"]
	check("reactive TextFlow builds the initial wrap", col.contents.length === 2);
	check(
		"initial reactive lines match the wrap",
		col.contents[0].string === "one two" && col.contents[1].string === "three",
	);
	// a REACTIVE TextFlow reserves maxLines*lineHeight at CONSTRUCTION and never
	// touches height again — Piu size is construction-time state, and the runtime
	// rejects reactive `height` everywhere else for exactly that reason (codex P2)
	check("reactive height is reserved up front (maxLines*lineHeight = 8*10)", col.height === 80);
	const firstLabel = col.contents[0];
	// drive the signal -> the effect re-wraps and rebuilds the line Labels
	t.value = "alpha beta gamma delta";
	check("reactive re-wrap changes the line COUNT", col.contents.length === 4);
	check(
		"reactive re-wrap rebuilds the line strings",
		col.contents[0].string === "alpha" &&
			col.contents[1].string === "beta" &&
			col.contents[2].string === "gamma" &&
			col.contents[3].string === "delta",
	);
	check("reactive re-wrap does NOT resize the mounted Column", col.height === 80);
	// the Column was REBUILT — the old Labels were removed (remove-loop), not reused
	check("the rebuild replaced the old Label nodes", col.contents[0] !== firstLabel);
	check("the old removed Label is detached from the Column", firstLabel.container === null);
	check(
		"rebuilt line Labels still share the one Style",
		col.contents[0].style === col.contents[3].style,
	);
}

// --- wrapCircle: a lens silhouette — top/bottom lines NARROWER than the middle ---
{
	const lines = wrapCircle(LOREM, 130, 22, 9, 9, 0.92);
	check("wrapCircle returns lines within the maxLines cap", lines.length > 1 && lines.length <= 9);
	const mid = Math.floor(lines.length / 2);
	check(
		"the middle line is the WIDEST (fills the circle's widest chord)",
		lines[0].length <= lines[mid].length && lines[lines.length - 1].length <= lines[mid].length,
	);
	// every line stays within its own chord budget (never overflows the circle);
	// the middle chord budget floor(2*130*0.92/9)=26 is the max any line may hit.
	check(
		"no line exceeds the widest chord budget",
		lines.every((l: string) => l.length <= Math.floor((2 * 130 * 0.92) / 9)),
	);
}

// --- wrapCircle edge branches: maxLines<=0 -> none; empty text -> none; a tiny
//     radius forces the chord clamp (half=0 -> budget clamps to >=1) ---
{
	check(
		"wrapCircle with maxLines<=0 yields no lines",
		wrapCircle(LOREM, 130, 22, 0, 9, 0.92).length === 0,
	);
	check(
		"wrapCircle on empty text yields no lines",
		wrapCircle("", 130, 22, 9, 9, 0.92).length === 0,
	);
	// radius 20, lineHeight 22 -> lines past the center fall OUTSIDE the circle,
	// so their chord is 0 and the budget clamps to 1 (one word per line, no crash).
	const tiny = wrapCircle("alpha beta gamma delta", 20, 22, 9, 9, 0.92);
	check("a tiny radius still returns lines (chord clamp, no crash)", tiny.length > 0);
	check("tiny-radius lines never exceed one short word", tiny[0].length <= 5);
}

// --- TextFlow shape="circle": forces center align + fills via wrapCircle ---
{
	const [col] = createRoot(() =>
		TextFlow({ text: LOREM, shape: "circle", lineHeight: 22, maxLines: 9 }),
	);
	check("circle: Column carries the full screen width", col.width === 144);
	check("circle: produced a multi-line lens", col.contents.length > 2 && col.contents.length <= 9);
	check(
		"circle: alignment is forced to center (a lens is inherently centered)",
		col.contents[0].style.d.horizontal === "center",
	);
	// the top line holds fewer chars than a middle line — the circular silhouette
	const cmid = Math.floor(col.contents.length / 2);
	check(
		"circle: the top line is narrower than the middle (fills the circle)",
		col.contents[0].string.length <= col.contents[cmid].string.length,
	);
}

// --- TextFlow: empty text yields a cell-less Column (0 height), still sized wide ---
{
	const [col] = createRoot(() => TextFlow({ text: "", charsPerLine: 16 }));
	check("empty text yields a line-less Column", col.contents.length === 0);
	check("empty Column height is 0 (0 lines)", col.height === 0);
	check("empty Column still carries an explicit width", col.width === 144);
}

done();
