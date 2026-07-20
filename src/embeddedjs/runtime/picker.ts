// A value CAROUSEL / spinner (React-Native `<Picker>` analog) — the opt-in
// `runtime/picker` module. OPT-IN & ZERO-COST: an app that never imports
// `runtime/picker` never ships it (the manifest prunes to the import closure —
// README tree-shaking), so this module costs non-users nothing.
//
// DISPLAY-ONLY (unit brief Rule 8 — no substrate): the Picker renders a 3-row
// WINDOW onto an options list — the current option centered in the bold
// `activeColor`, the previous option faded above and the next faded below. The
// APP owns the selected index (a signal) and moves it with buttons; the Picker
// just reflects it. It owns NO state (Rule 8 — a display widget must not own the
// value it shows), so the current index is CLAMPED into `[0, options.length-1]`:
// an out-of-range counter still centers a valid option.
//
// COMPOSITION (like statusbar.ts / card.ts, NOT a Canvas): a Picker is a
// `Column` (vertical stack) of EXACTLY THREE `Label` rows — prev, current, next.
// It is the hand-built Piu-node idiom (idiom 5b): positioned text with fixed
// per-row Styles, no drawing. A Piu `Column` (never a bare `Container`) LAYS the
// rows out top-to-bottom — a plain Container would pile all three at the same y
// (the vertical twin of tabs.ts's measured Row-not-Container bug).
//
// REACTIVITY (idiom 5b — hand-built nodes + ONE driving effect): a `selected`
// passed as a THUNK (`() => i`) gets ONE effect that rewrites the three rows'
// `.string` on every change — the thunk's signal reads inside the effect
// auto-subscribe, so the window slides when they change. A bare number is
// applied ONCE at construction (static, no effect). The effect registers under
// the running owner and disposes with the screen (no leak on navigate-away).
//
// STYLES ARE POSITIONALLY FIXED — why this is NOT tabs.ts's per-change re-style:
// Tabs re-styles on change because its highlighted CELL moves between positions;
// the Picker's bold row is ALWAYS the middle one, so styling is fixed PER ROW,
// not per index. The two Styles (one shared by both faded neighbors, one for the
// bold current row) are therefore assigned ONCE at construction and only the
// `.string`s rotate in the effect — re-styling per change would be pure redundant
// work on the 32KB heap (Rule 2). TWO Styles cover all THREE rows (Rule 4 —
// shared objects, not per-row allocations).
//
// NEIGHBORS: prev = index-1, next = index+1. Out of range they are BLANK ("")
// when `wrap` is false, or WRAP modulo `options.length` when `wrap` is true (a
// true carousel — the last option's next is the first, and the first's prev is
// the last).
//
// FONT / HOST OBJECTS (gotcha — an invalid font key or a module-scope `new
// Style` renders BLANK): the two Styles are built PER-CALL inside Picker
// (runtime, never module scope — a preloaded module's top-level `new Style`
// freezes into a broken ROM instance, measured on Badge), with valid Pebble
// system font keys — "24px Gothic" (current) / "18px Gothic" (neighbors),
// tools/fontcheck. GOTCHA 16: the Column carries an EXPLICIT numeric width AND
// height, and every Label an explicit width + height (a measure-0 container
// draws nothing).
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
} from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font keys (tools/fontcheck): a larger key for the bold
// current row, a smaller one for the faded neighbors — an invalid key is BLANK.
const CURRENT_FONT = "24px Gothic";
const SIDE_FONT = "18px Gothic";
// Muted gray for the faded neighbors; white for the centered current option.
const DEFAULT_COLOR: Color = "#808080";
const DEFAULT_ACTIVE_COLOR: Color = "white";
// Default window height; the three rows split it evenly (Math.floor(height/3)).
const DEFAULT_HEIGHT = 96;

/** Props for {@link Picker}. */
export type PickerProps = {
	/** The option strings, in list order. The Picker shows a sliding 3-row window onto them. */
	options: string[];
	/** The centered (current) option's index — an INTEGER. A thunk (`() => i`) makes it reactive; a bare number is static. Clamped to `[0, options.length-1]`. */
	selected: number | (() => number);
	/** Picker width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16). */
	width?: number;
	/** Picker height in px (the 3 rows split it evenly). Defaults to 96. */
	height?: number;
	/** Faded neighbor (prev/next) text color. Defaults to `"#808080"`. */
	color?: Color;
	/** Current (centered) text color. Defaults to `"white"`. */
	activeColor?: Color;
	/** Current row font — a valid Pebble system font key. Defaults to `"24px Gothic"`. */
	font?: string;
	/** Neighbor rows font — a valid Pebble system font key. Defaults to `"18px Gothic"`. */
	sideFont?: string;
	/** Carousel wrap: `true` makes the list circular (last↔first neighbors); `false` leaves out-of-range neighbors blank. Defaults to `false`. */
	wrap?: boolean;
};

/**
 * Picker — a reactive value carousel: the current option centered and bold, its
 * neighbors faded above and below (a 3-row window), on a Column of Labels.
 *
 *   const [i, setI] = useState(0);
 *   <Picker options={FRUITS} selected={i} wrap />       // reactive carousel
 *   <Picker options={["A","B","C"]} selected={1} />     // static, no wrap
 *
 * DISPLAY-ONLY — the app owns `selected` and moves it (e.g. up/down buttons);
 * the Picker renders the window and CLAMPS the index into range (Rule 8).
 * Hand-builds a full-width/height Column of three Labels; a thunk `selected` is
 * driven by one effect that re-strings the rows (idiom 5b). See the module
 * header for the fixed-style / wrap / gotcha-16 contract.
 */
export function Picker(props: PickerProps): Content {
	const options = props.options;
	const width = props.width ?? screen.width;
	const height = props.height ?? DEFAULT_HEIGHT;
	const color = props.color ?? DEFAULT_COLOR;
	const activeColor = props.activeColor ?? DEFAULT_ACTIVE_COLOR;
	const font = props.font ?? CURRENT_FONT;
	const sideFont = props.sideFont ?? SIDE_FONT;
	const wrap = props.wrap ?? false;
	const n = options.length;
	const rowH = Math.floor(height / 3);

	// Two Styles cover all three rows (Rule 4 — shared, not per-row): one for the
	// two faded neighbors, one for the bold current row. Built PER-CALL at runtime
	// — never module scope (a preloaded top-level `new Style` freezes broken).
	const sideStyle = new Style({ font: sideFont, color });
	const currentStyle = new Style({ font, color: activeColor });

	// EXPLICIT width + height (gotcha 16): a measure-0 Column draws nothing. A Piu
	// Column (not a bare Container) STACKS its children top-to-bottom.
	const column = new Column(null, { width, height }) as PiuContainer;
	// Each row: explicit width + rowH (gotcha 16); Piu centers the text in the box.
	// Styles are assigned ONCE here (positionally fixed — see the module header).
	const prevLabel = new Label(null, { width, height: rowH, style: sideStyle, string: "" });
	const currentLabel = new Label(null, { width, height: rowH, style: currentStyle, string: "" });
	const nextLabel = new Label(null, { width, height: rowH, style: sideStyle, string: "" });
	column.add(prevLabel);
	column.add(currentLabel);
	column.add(nextLabel);

	// Resolve a neighbor slot's text: in range → the option; out of range → blank
	// (wrap off) or the modulo-wrapped option (wrap on — a circular carousel).
	// Only reached when n>0 (apply guards n===0), so the modulo never divides by 0.
	const neighbor = (i: number): string => {
		if (i >= 0 && i < n) return options[i];
		if (!wrap) return "";
		return options[((i % n) + n) % n];
	};

	// Rewrite the three rows for a raw selected index: CLAMP the current index
	// into range (Rule 8), then string the middle row and its two neighbors. With
	// no options (n===0) every row stays blank — a valid empty window, no crash.
	const apply = (raw: number): void => {
		if (n === 0) return;
		const cur = raw < 0 ? 0 : raw > n - 1 ? n - 1 : raw;
		prevLabel.string = neighbor(cur - 1);
		currentLabel.string = options[cur];
		nextLabel.string = neighbor(cur + 1);
	};

	// Reactive thunk → one effect re-strings on change (idiom 5b, auto-tracks); a
	// bare number is applied once at construction (static).
	const selected = props.selected;
	if (typeof selected === "function") {
		effect(() => {
			apply(selected());
		});
	} else {
		apply(selected);
	}

	return column;
}
