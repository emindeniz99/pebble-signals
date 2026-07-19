// A horizontal tab bar (the active tab highlighted) — the opt-in `runtime/tabs`
// module. OPT-IN & ZERO-COST: an app that never imports `runtime/tabs` never
// ships it (the manifest prunes to the import closure — README tree-shaking),
// so this module costs non-users nothing.
//
// DISPLAY-ONLY (Rule 2 — no substrate): Tabs renders the BAR, nothing more. The
// app owns the active index (a signal) and swaps the body content itself; Tabs
// just reflects which cell is active. No navigation, no touch, no content.
//
// COMPOSITION (like statusbar.ts / card.ts, NOT a Canvas): a Tabs is a full-
// width `Row` of `labels.length` equal-width `Label` cells. It is the hand-built
// Piu-node idiom — there is no drawing, just positioned text with per-cell
// Style/Skin swaps. The active cell wears `activeStyle` (the `activeColor` text)
// plus an optional `activeFill` background Skin; the rest wear `inactiveStyle`
// (the `color` text). Two shared Styles + one optional Skin cover every cell
// (indices, not per-cell allocations — Rule 4, the 32KB heap).
//
// REACTIVITY (idiom 5b — hand-built nodes + one driving effect): an `active`
// passed as a THUNK (`() => i`) gets ONE effect that restyles the cells on every
// change — the thunk's signal reads inside the effect auto-subscribe, so the
// highlight moves when they change. A bare number `active` is applied ONCE at
// construction (static, no effect). The effect registers under the running owner
// and disposes with the screen (no leak on navigate-away). The raw index is
// clamped to `[0, labels.length-1]` so a wrapped/out-of-range counter still
// lights exactly one cell.
//
// GOTCHA 16 (an anchor-only container measures 0 and draws NOTHING): the Row is
// built with an EXPLICIT width (`screen.width`) AND height, exactly like
// StatusBar's strip and Card's outer box. Each cell also carries an explicit
// width (an equal slice) and height so the Row distributes them.
//
// FONT/HOST OBJECTS (gotcha — an invalid font key or a module-scope `new Style`
// renders BLANK): the two label Styles and the optional fill Skin are built
// PER-CALL inside Tabs (runtime, never module scope — a preloaded module's
// top-level `new Style/Skin` freezes into a broken instance, measured on Badge),
// with the valid Pebble system font key "18px Gothic" (tools/fontcheck).
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Label as PiuLabel,
} from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font key for the cell labels (tools/fontcheck).
const TAB_FONT = "18px Gothic";
// Muted gray for the inactive tabs; white for the active tab's text.
const DEFAULT_COLOR: Color = "#808080";
const DEFAULT_ACTIVE_COLOR: Color = "white";

/** Props for {@link Tabs}. */
export type TabsProps = {
	/** The tab captions, left to right. One equal-width cell per label. */
	labels: string[];
	/** The active tab index. A thunk (`() => i`) makes the bar reactive; a bare number is static. Clamped to `[0, labels.length-1]`. */
	active: number | (() => number);
	/** Bar width in px. Defaults to the screen width (a width-less Row measures 0 — gotcha 16). */
	width?: number;
	/** Bar height in px. Defaults to 24. */
	height?: number;
	/** Inactive tab text color. Defaults to `"#808080"`. */
	color?: Color;
	/** Active tab text color. Defaults to `"white"`. */
	activeColor?: Color;
	/** Active tab background fill. Omitted = no background (the active tab is set apart by `activeColor` alone). */
	activeFill?: Color;
};

/**
 * Tabs — a reactive horizontal tab bar: a Row of captions, the active one lit.
 *
 *   const [tab] = useState(0);
 *   <Tabs labels={["Home", "Stats", "Set"]} active={tab} />       // reactive
 *   <Tabs labels={["A", "B"]} active={1} activeFill="#004" />     // static
 *
 * DISPLAY-ONLY — the app owns `active` and swaps the body; Tabs renders the bar.
 * Hand-builds a full-width Row of equal Label cells; the `active` cell wears the
 * `activeColor` text (+ optional `activeFill` Skin), driven by one effect when
 * `active` is a thunk (idiom 5b). See the module header.
 */
export function Tabs(props: TabsProps): Content {
	const labels = props.labels;
	const width = props.width ?? screen.width;
	const height = props.height ?? 24;
	const color = props.color ?? DEFAULT_COLOR;
	const activeColor = props.activeColor ?? DEFAULT_ACTIVE_COLOR;

	// Two shared Styles cover every cell (active vs inactive text color); an
	// optional fill Skin backs the active cell. Built per-call at runtime — never
	// module scope (a preloaded top-level `new Style/Skin` freezes broken).
	const activeStyle = new Style({ font: TAB_FONT, color: activeColor });
	const inactiveStyle = new Style({ font: TAB_FONT, color });
	const activeSkin =
		props.activeFill !== undefined ? new Skin({ fill: props.activeFill }) : undefined;

	// EXPLICIT width + height (gotcha 16): a measure-0 Row draws nothing. A Piu
	// Row (not a bare Container) LAYS OUT its children left-to-right — a plain
	// Container stacks them all at the same x (measured: the cells overlapped).
	const row = new Row(null, { width, height }) as PiuContainer;
	const n = labels.length;
	// Equal slice per cell (n>0 guarded so an empty labels list is a no-op bar).
	const cellW = n > 0 ? width / n : 0;
	const cells: PiuLabel[] = [];
	for (let i = 0; i < n; i++) {
		const cell = new Label(null, {
			width: cellW,
			height,
			string: labels[i],
		}) as PiuLabel;
		row.add(cell);
		cells.push(cell);
	}

	// Restyle the cells for a given raw index: clamp into range, then point the
	// hot cell at the active Style (+ Skin) and the rest at the inactive Style.
	const applyActive = (raw: number): void => {
		const hot = raw < 0 ? 0 : raw > n - 1 ? n - 1 : raw;
		for (let i = 0; i < n; i++) {
			const cell = cells[i];
			cell.style = i === hot ? activeStyle : inactiveStyle;
			if (activeSkin !== undefined) cell.skin = i === hot ? activeSkin : null;
		}
	};

	// Reactive thunk -> one effect restyles on change (idiom 5b, auto-tracks); a
	// bare number is applied once at construction (static).
	const active = props.active;
	if (typeof active === "function") {
		effect(() => {
			applyActive(active());
		});
	} else {
		applyActive(active);
	}

	return row;
}
