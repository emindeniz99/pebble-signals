// Wrapped multi-line paragraph text — the opt-in `runtime/textflow` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/textflow` never ships
// it (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// DISPLAY-ONLY (Rule 8 — no substrate): TextFlow renders a block of text and
// nothing else. It owns no state — the app supplies the string (bare or as a
// thunk); TextFlow only reflects it. It clamps its own wrap budget/line count so
// a hostile input can never crash it, but it never drives its own content.
//
// COMPOSITION (the hand-built-nodes idiom, like statusbar.ts / tabs.ts / card.ts,
// NOT a Canvas): a TextFlow is a `Column` (vertical stack — Rule 2's Column-not-
// Container) of one `Label` per wrapped line. There is NO drawing — Piu 'Text' is
// deliberately AVOIDED (unverified on device; the harness maps it to a childless
// leaf — Rule 3), so wrapping is done by hand: `wrapText` greedily packs words
// into <=`charsPerLine`-char lines and each line becomes a Label. ONE shared
// Style backs every line (font + color + horizontal alignment) — indices, not
// per-line allocations (Rule 4, the 32KB heap).
//
// REACTIVITY (idiom 5b — hand-built nodes + ONE driving effect): a `text` passed
// as a THUNK (`() => s`) gets ONE effect that re-wraps and REBUILDS the line
// Labels on change — the thunk's signal reads inside the effect auto-subscribe,
// so the paragraph re-flows when they change. A bare string `text` is wrapped +
// built ONCE at construction (static, no effect, no tracking). The effect
// registers under the running owner and disposes with the screen (no leak on
// navigate-away). Text changes are infrequent (a paragraph swap, not a
// per-frame list), so a full rebuild is the simplest correct shape.
//
// REBUILD SHAPE (a measured device lesson, flow.ts): the rebuild CLEARS the
// Column with the remove-one-by-one loop `while (col.first) col.remove(col.first)`
// — the exact shape flow.ts's Show uses for a full swap — NOT `Column.empty()`,
// which flow.ts's For MEASURED destabilizing the Piu port (app death after ~15-25
// cycles). Same visual result, device-safe cadence.
//
// GOTCHA 16 (an anchor-only / dimensionless container measures 0 and draws
// NOTHING): the Column carries an EXPLICIT numeric width AND height (height =
// lines.length * lineHeight), and every line Label carries an explicit width +
// height — exactly like Tabs's Row/cells and StatusBar's strip. The height is
// (re)written inside `rebuild`, so the re-add of Labels in the SAME synchronous
// pass forces Piu's measure/place with the fresh height in place (see the notes
// for the on-device caveat + fixed-height fallback).
//
// FONT / HOST OBJECTS (gotcha — an invalid font key or a module-scope `new Style`
// renders BLANK): the one line Style is built PER-CALL inside TextFlow (runtime,
// never module scope — a preloaded module's top-level `new Style` freezes into a
// broken ROM instance, measured on Badge), with the valid Pebble system font key
// "18px Gothic" by default (tools/fontcheck). No module-scope host objects exist.
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Label as PiuLabel,
} from "../../../types/moddable/piu/MC-types";

// The body default — a valid Pebble system font key (tools/fontcheck). An
// invalid key renders BLANK on device, so callers should stay on the catalog.
const DEFAULT_FONT = "18px Gothic";
// White text on the usual black watch background.
const DEFAULT_COLOR: Color = "white";
// Per-line vertical pitch (line box height) in px.
const DEFAULT_LINE_HEIGHT = 22;
// Drop lines past this so a runaway string can never grow an unbounded Column.
const DEFAULT_MAX_LINES = 8;
// Approx px per glyph at the default font — the default `charsPerLine` divisor.
const PX_PER_CHAR = 9;

/**
 * Greedily word-wrap `text` into at most `maxLines` lines, each at most
 * `charsPerLine` characters long (counting the single spaces that join words).
 * Pure — no Piu, no signals — so it is unit-testable in isolation and reused by
 * {@link TextFlow}.
 *
 * Rules (all device-safe — none can crash or loop):
 * - Whitespace runs split words; leading / trailing / repeated whitespace
 *   collapses (empty tokens are skipped).
 * - A word joins the current line when `line + " " + word` still fits; otherwise
 *   the current line is committed and the word begins the next.
 * - A single word LONGER than `charsPerLine` takes its own line — it overflows
 *   visually but is never split and never crashes (the first word of a line is
 *   always placed regardless of the budget).
 * - At most `maxLines` lines are returned; remaining words are dropped.
 *   `maxLines <= 0` yields no lines; empty / whitespace-only text yields no lines.
 *
 * @param text the paragraph to wrap
 * @param charsPerLine per-line character budget (a lone word may exceed it)
 * @param maxLines hard cap on returned lines (extra lines dropped)
 * @returns the wrapped lines, in order
 */
export function wrapText(text: string, charsPerLine: number, maxLines: number): string[] {
	const lines: string[] = [];
	if (maxLines <= 0) return lines; // no budget -> no lines (a valid degenerate cap)
	const words = text.split(/\s+/);
	let cur = "";
	for (let i = 0; i < words.length; i++) {
		const w = words[i];
		if (w.length === 0) continue; // empty token from leading/trailing/double whitespace
		if (cur === "") {
			// first word of a line — always placed, even when longer than the
			// budget (a too-long word gets its own line, never split, never crash)
			cur = w;
		} else if (cur.length + 1 + w.length <= charsPerLine) {
			cur += " " + w; // fits with a single joining space
		} else {
			lines.push(cur); // commit the full line; the word starts the next one
			if (lines.length >= maxLines) return lines; // budget hit — drop the rest
			cur = w;
		}
	}
	// the else-return above caps `lines` at maxLines, so a trailing line never
	// overflows the budget — no length guard needed here.
	if (cur !== "") lines.push(cur);
	return lines;
}

// Per-line char budget for a block of N lines centered in a circle of `radius`.
// Line i's box sits `dy` px off the vertical center; a horizontal chord there is
// 2·sqrt(r²−dy²) wide, so the top/bottom lines (large |dy|) get a NARROW budget
// and the middle lines a WIDE one — the paragraph silhouette becomes a lens that
// FILLS the circle instead of a square. `fill` (0..1) trims a bezel margin.
function circleBudget(
	i: number,
	n: number,
	radius: number,
	lineHeight: number,
	pxPerChar: number,
	fill: number,
): number {
	const dy = (i - (n - 1) / 2) * lineHeight;
	const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
	return Math.max(1, Math.floor((2 * half * fill) / pxPerChar));
}

// Greedy wrap where each line's budget comes from `budgetFor(lineIndex)` — the
// same packing as wrapText, but the per-line budget varies (used by wrapCircle
// to narrow the top/bottom lines). Pure; caps at `maxLines`.
function wrapVariable(
	words: string[],
	budgetFor: (i: number) => number,
	maxLines: number,
): string[] {
	const lines: string[] = [];
	if (maxLines <= 0) return lines;
	let cur = "";
	for (let k = 0; k < words.length; k++) {
		const w = words[k];
		if (w.length === 0) continue;
		if (cur === "") {
			cur = w;
		} else if (cur.length + 1 + w.length <= budgetFor(lines.length)) {
			cur += " " + w;
		} else {
			lines.push(cur);
			if (lines.length >= maxLines) return lines;
			cur = w;
		}
	}
	if (cur !== "") lines.push(cur);
	return lines;
}

/**
 * Word-wrap `text` to FILL a circle of `radius` (centered vertically): each line
 * is packed to the chord width at its own height, so the top and bottom lines
 * hold fewer words and the paragraph forms a lens/circle rather than a square.
 * Pure — no Piu, no signals — so it is unit-testable and reused by {@link TextFlow}
 * (`shape="circle"`).
 *
 * The line COUNT and the per-line budgets are mutually dependent (a taller block
 * pushes its end lines further off-center, narrowing them), so this iterates to a
 * fixed point: wrap with the current N, and if the result has a different line
 * count, re-wrap with that N (bounded to a few passes — this is layout, not exact
 * arithmetic). Lines are meant to be CENTER-aligned; the caller sizes the Column
 * to the full width so each centered line has its chord available.
 *
 * @param text the paragraph to wrap
 * @param radius the circle radius in px (typically screen radius minus a bezel)
 * @param lineHeight per-line vertical pitch in px (sets each line's `dy`)
 * @param maxLines hard cap on returned lines (extra lines dropped)
 * @param pxPerChar approximate px per glyph at the font
 * @param fill fraction of each chord to fill, 0..1 (a bezel/breath margin)
 * @returns the wrapped lines, in order, forming a circular silhouette
 */
export function wrapCircle(
	text: string,
	radius: number,
	lineHeight: number,
	maxLines: number,
	pxPerChar: number,
	fill: number,
): string[] {
	const words = text.split(/\s+/);
	// seed N from a wrap at the widest (center) budget, then refine to a fixed
	// point — at most a handful of passes, and it always terminates on the cap.
	let n = Math.max(1, Math.min(maxLines, 4));
	let lines: string[] = [];
	for (let pass = 0; pass < 6; pass++) {
		lines = wrapVariable(
			words,
			(i) => circleBudget(i, n, radius, lineHeight, pxPerChar, fill),
			maxLines,
		);
		if (lines.length === n || lines.length === 0) break;
		n = lines.length;
	}
	return lines;
}

/** Props for {@link TextFlow}. */
export type TextFlowProps = {
	/** The paragraph text. A thunk (`() => s`) re-wraps + rebuilds on change; a bare string wraps once (static). */
	text: string | (() => string);
	/** Block width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16). */
	width?: number;
	/**
	 * Block height in px. A REACTIVE `text` thunk always gets a fixed
	 * construction-time height (this value, else `maxLines * lineHeight`) —
	 * Piu position/size is construction-time state, so the re-wrap must not
	 * resize a mounted box. A bare string still shrinks to its own wrap.
	 */
	height?: number;
	/** Per-line character budget for the wrap. Defaults to `max(1, floor(width / 9))`. */
	charsPerLine?: number;
	/** Text font — a valid Pebble system font key. Defaults to `"18px Gothic"`. */
	font?: string;
	/** Text color. Defaults to `"white"`. */
	color?: Color;
	/** Per-line height in px (each Label's height + the Column's row pitch). Defaults to 22. */
	lineHeight?: number;
	/** Horizontal alignment. `"left"` (default, the reliable one) or `"center"`. Forced to `"center"` when `shape="circle"`. */
	align?: "left" | "center";
	/** Max wrapped lines; extra lines are dropped. Defaults to 8. */
	maxLines?: number;
	/**
	 * Wrap silhouette. `"block"` (default) wraps to a fixed rectangle. `"circle"`
	 * wraps each line to the circle's chord at its height, so the text FILLS the
	 * round screen (a lens shape) instead of a square — designed for round
	 * screens, always center-aligned. See {@link wrapCircle}.
	 */
	shape?: "block" | "circle";
	/** Circle-fill fraction (0..1) — how much of each chord to use, leaving a bezel margin. Defaults to 0.92. Only used when `shape="circle"`. */
	fill?: number;
};

/**
 * TextFlow — a wrapped multi-line paragraph: a Column of Label lines.
 *
 *   <TextFlow text="A long paragraph that wraps across several lines." />
 *   <TextFlow text={() => msg()} width={140} align="center" />   // reactive re-wrap
 *
 * DISPLAY-ONLY — the app supplies the string; TextFlow wraps it (manual word-wrap
 * via {@link wrapText}, NOT Piu 'Text') into one Label per line. A `text` thunk is
 * driven by ONE effect that re-wraps + rebuilds the lines (idiom 5b); a bare
 * string builds once. `align="left"` is the reliable default; `align="center"`
 * centers each line within the block width via the shared Style's `horizontal`
 * key. See the module header for the composition, rebuild shape and gotchas.
 */
export function TextFlow(props: TextFlowProps): Content {
	const width = props.width ?? screen.width;
	const charsPerLine = props.charsPerLine ?? Math.max(1, Math.floor(width / PX_PER_CHAR));
	const font = props.font ?? DEFAULT_FONT;
	const color = props.color ?? DEFAULT_COLOR;
	const lineHeight = props.lineHeight ?? DEFAULT_LINE_HEIGHT;
	const maxLines = props.maxLines ?? DEFAULT_MAX_LINES;
	// `shape="circle"` fills the round screen with a lens of text (each line
	// wrapped to its chord) and is inherently center-aligned; `"block"` honors the
	// caller's `align` (default left, the reliable one).
	const circle = props.shape === "circle";
	const align = circle ? "center" : (props.align ?? "left");
	const fill = props.fill ?? 0.92;
	// Circle radius: the screen's inscribed radius less a 2px bezel margin (the
	// lens is centered on the screen, so the caller should center this Column).
	const radius = Math.min(screen.width, screen.height) / 2 - 2;

	// ONE shared Style backs every line Label (font + color + horizontal
	// alignment) — indices, not per-line allocations (Rule 4). Built PER-CALL at
	// runtime, NEVER module scope: a preloaded module's top-level `new Style`
	// freezes into a broken ROM instance and renders blank (measured on Badge).
	const style = new Style({ font, color, horizontal: align });

	// EXPLICIT width (gotcha 16): a width-less Column measures 0 and draws
	// nothing. HEIGHT depends on which text form this is:
	//  - bare string: written once from the wrap in `rebuild`, BEFORE the node is
	//    ever mounted, so the box shrinks to its own content (unchanged).
	//  - thunk: FIXED here, at construction. `rebuild` runs again on every change
	//    — i.e. after mount — and the runtime's own `bindErr()` rejects reactive
	//    `height` precisely because Piu position/size is construction-time state
	//    and post-mount writes can crash the port. The documented reflow path was
	//    bypassing that gate on itself (codex P2). `maxLines * lineHeight` is the
	//    tallest wrap this instance can ever produce, so no line is ever cut off;
	//    pass `height` to reserve less.
	const reflow = typeof props.text === "function";
	const boxHeight = props.height ?? (reflow ? maxLines * lineHeight : undefined);
	const column = new Column(
		null,
		boxHeight === undefined ? { width } : { width, height: boxHeight },
	) as PiuContainer;

	// Clear + re-add the line Labels for a given wrap. The remove-one-by-one loop
	// is flow.ts's device-safe full-rebuild shape (Show uses it) — NOT
	// Column.empty(), which For measured destabilizing the Piu port after ~15-25
	// cycles. The height is written here ONLY when the box has none of its own —
	// the bare-string path, which runs exactly once, pre-mount (see above).
	const rebuild = (lines: string[]): void => {
		while (column.first) column.remove(column.first);
		if (boxHeight === undefined) column.height = lines.length * lineHeight;
		for (let i = 0; i < lines.length; i++) {
			// each line = one Label with an explicit width + height (gotcha 16),
			// sharing the one Style; its `string` is the wrapped line.
			const line = new Label(null, {
				width,
				height: lineHeight,
				style,
				string: lines[i],
			}) as PiuLabel;
			column.add(line);
		}
	};

	// Reactive thunk -> ONE effect re-wraps + rebuilds on change (idiom 5b: the
	// `text()` read inside the effect auto-subscribes, the effect writes nodes, no
	// loop). A bare string wraps + builds ONCE at construction (static, no effect).
	const wrap = (s: string): string[] =>
		circle
			? wrapCircle(s, radius, lineHeight, maxLines, PX_PER_CHAR, fill)
			: wrapText(s, charsPerLine, maxLines);
	const text = props.text;
	if (typeof text === "function") {
		effect(() => {
			rebuild(wrap(text()));
		});
	} else {
		rebuild(wrap(text));
	}

	return column;
}
