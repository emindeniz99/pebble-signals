// A modal centered ACTION LIST (Pebble ActionMenu analog) — the opt-in
// `runtime/actionmenu` module. OPT-IN & ZERO-COST: an app that never imports
// `runtime/actionmenu` never ships it (the manifest prunes to the import
// closure — README tree-shaking), so this module costs non-users nothing.
//
// DISTINCT FROM MENU: Menu (runtime/menu) is a FULL-SCREEN, SCROLLING selectable
// list with no backdrop. ActionMenu is a MODAL — a filled backdrop behind a
// SMALL, FIXED action set (no scrolling): an optional title over a Column of
// action rows, the active one highlighted. Reach for Menu when the list
// overflows and must scroll; reach for ActionMenu for a short "what do you want
// to do?" sheet whose whole content fits the backdrop.
//
// DISPLAY-ONLY (Rule 8 — no substrate): ActionMenu renders the sheet and
// reflects which action is active; it does NOT own the active index. The app
// owns `active` (a signal) and drives it (buttons up/down, a rotary, etc.);
// ActionMenu just highlights the row. No navigation, no touch, no dismiss, no
// self-owned timer — a loader is the sole self-owning widget, and this is not
// one (the Node suite asserts it registers zero timers).
//
// COMPOSITION (the hand-built Piu-node idiom, like menu.ts / card.ts — NOT a
// Canvas): an OUTER `Container` carrying the backdrop `Skin` (fill=background)
// wraps an inner `Column` that stacks an optional title `Label` (titleFont) over
// one action `Label` per action. The Column is CONTENT-height (shorter than the
// backdrop) with no coordinates, so Piu centers it within the outer — the
// "centered" in the name (the full-screen-default backdrop simply fills). Two
// shared Styles + one Skin cover every action row (indices, not per-row
// allocations — Rule 4, the 32KB heap): the active row wears `activeStyle`
// (activeColor text) + the `activeFill` Skin; the rest wear `inactiveStyle`
// (color text) + a null skin (the tabs.ts highlight idiom).
//
// REACTIVITY (idiom 5b — hand-built nodes + ONE driving effect): an `active`
// passed as a THUNK (`() => i`) gets ONE effect that RE-HIGHLIGHTS the rows on
// every change — the thunk's signal reads inside the effect auto-subscribe, so
// the highlight follows the selection with no bind wiring. A bare number
// `active` is applied ONCE at construction (static, no effect). The effect
// registers under the running owner and disposes with the screen (no leak on
// navigate-away). The raw index is clamped to `[0, actions.length-1]` so a
// wrapped/out-of-range counter still lights exactly one row. The `title` is a
// STATIC string (a sheet header is fixed) — no thunk, no effect.
//
// GOTCHA 16 (an anchor-only / size-less container measures 0 and draws
// NOTHING): the outer Container carries an EXPLICIT numeric width AND height
// (the backdrop); the inner Column an explicit width AND content height; every
// row Label an explicit width AND rowHeight. Vertical stacking uses a Piu
// `Column` (a bare Container stacks children at one y — a measured bug; Column
// lays them out top-to-bottom), the vertical mirror of tabs.ts's Row rule. The
// backdrop carries NO `clip` (unlike menu.ts, which clips a scrolling body):
// a fixed action set is sized to fit, so there is nothing to clip.
//
// FONT / HOST OBJECTS (an invalid font key or a module-scope `new Style/Skin`
// renders BLANK): the backdrop Skin, the two row Styles, the title Style and the
// active-fill Skin are ALL built PER-CALL inside ActionMenu (runtime, never
// module scope — a preloaded module's top-level `new Style/Skin` freezes into a
// broken ROM instance, measured on Badge). The default fonts "bold 24px Gothic"
// (title) and "18px Gothic" (rows) are valid Pebble system font keys
// (tools/fontcheck) — an invalid one renders blank. The title has no dedicated
// color prop, so it borrows `activeColor` (default white): the sheet's
// "prominent text" color, which reads on the backdrop and tracks a caller who
// re-themes for a light background.
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Label as PiuLabel,
} from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font keys (tools/fontcheck): a bold title, a regular row.
const TITLE_FONT = "bold 24px Gothic";
const ROW_FONT = "18px Gothic";
// Black backdrop; muted gray inactive text; white active text; dark teal fill.
const DEFAULT_BACKGROUND: Color = "#000000";
const DEFAULT_COLOR: Color = "#808080";
const DEFAULT_ACTIVE_COLOR: Color = "white";
const DEFAULT_ACTIVE_FILL: Color = "#1a4d4d";
// Default per-row height in px (the title row and each action row).
const DEFAULT_ROW_HEIGHT = 30;

/** Props for {@link ActionMenu}. */
export type ActionMenuProps = {
	/** The action captions, top to bottom. One `rowHeight`-tall Label per action. */
	actions: string[];
	/**
	 * The active action index. A thunk (`() => i`) makes the sheet reactive — one
	 * effect re-highlights on change (idiom 5b); a bare number is applied once at
	 * construction (static). Clamped to `[0, actions.length-1]`.
	 */
	active: number | (() => number);
	/** Optional bold sheet header, above the actions. STATIC — omit for no title Label. */
	title?: string;
	/** Backdrop width in px. Defaults to the screen width (a width-less container measures 0 — gotcha 16). */
	width?: number;
	/** Backdrop height in px. Defaults to the screen height. */
	height?: number;
	/** Backdrop fill color. Defaults to black (`"#000000"`). */
	background?: Color;
	/** Inactive action text color. Defaults to `"#808080"`. */
	color?: Color;
	/** Active action text color — also the title color. Defaults to `"white"`. */
	activeColor?: Color;
	/** Active action background fill. Defaults to a dark teal (`"#1a4d4d"`). */
	activeFill?: Color;
	/** Title font — a valid Pebble system font key. Defaults to `"bold 24px Gothic"`. */
	titleFont?: string;
	/** Action-row font — a valid Pebble system font key. Defaults to `"18px Gothic"`. */
	font?: string;
	/** Per-row height in px (the title and each action). Defaults to 30. */
	rowHeight?: number;
};

/**
 * ActionMenu — a reactive modal action sheet, display-only.
 *
 *   const [act] = useState(0);
 *   <ActionMenu actions={["Reply", "Archive", "Delete"]} active={act} title="Message" />  // reactive
 *   <ActionMenu actions={opts} active={1} width={130} height={140} background="#202020" /> // static
 *
 * DISPLAY-ONLY — the app owns `active` and drives it; ActionMenu highlights the
 * row. Hand-builds a backdrop Container over a content-height Column (Piu centers
 * it) holding an optional title Label and one action Label per action; the active
 * row is restyled + skinned by ONE effect when `active` is a thunk (idiom 5b), or
 * once at construction for a bare number. `active` clamps to `[0, actions.length-1]`.
 * See the module header for the composition + reactivity + gotcha-16 contract.
 */
export function ActionMenu(props: ActionMenuProps): Content {
	const actions = props.actions;
	const width = props.width ?? screen.width;
	const height = props.height ?? screen.height;
	const background = props.background ?? DEFAULT_BACKGROUND;
	const color = props.color ?? DEFAULT_COLOR;
	const activeColor = props.activeColor ?? DEFAULT_ACTIVE_COLOR;
	const activeFill = props.activeFill ?? DEFAULT_ACTIVE_FILL;
	const titleFont = props.titleFont ?? TITLE_FONT;
	const font = props.font ?? ROW_FONT;
	const rowHeight = props.rowHeight ?? DEFAULT_ROW_HEIGHT;

	// Two shared Styles cover every action row (active vs inactive text color);
	// one Skin backs the active row; one Skin is the backdrop. Built per-call at
	// runtime — never module scope (a preloaded top-level `new Style/Skin` freezes
	// into a broken ROM instance, measured on Badge).
	const backdrop = new Skin({ fill: background });
	const activeStyle = new Style({ font, color: activeColor });
	const inactiveStyle = new Style({ font, color });
	const activeSkin = new Skin({ fill: activeFill });

	const n = actions.length;
	const title = props.title;
	// Column content height: an optional title row + one row per action. Shorter
	// than the backdrop, so Piu centers the whole list (the "centered" sheet).
	const contentHeight = (title !== undefined ? rowHeight : 0) + n * rowHeight;

	// OUTER backdrop box: EXPLICIT width + height (gotcha 16 — a size-less
	// container measures 0 and draws nothing), carrying the backdrop fill Skin.
	const outer = new Container(null, {
		skin: backdrop,
		width,
		height,
	}) as PiuContainer;

	// INNER content column: explicit width + content height (gotcha 16). A Piu
	// Column (not a bare Container) stacks its children top-to-bottom (gotcha 16
	// mirror). No coordinates, so Piu centers it within the backdrop.
	const column = new Column(null, { width, height: contentHeight }) as PiuContainer;
	outer.add(column);

	// Optional STATIC title row (borrows activeColor, titleFont). It is NOT in
	// `cells`, so the highlight never touches it.
	if (title !== undefined) {
		const titleStyle = new Style({ font: titleFont, color: activeColor });
		const titleLabel = new Label(null, {
			width,
			height: rowHeight,
			string: title,
			style: titleStyle,
		}) as PiuLabel;
		column.add(titleLabel);
	}

	// One action Label per action; applyActive (below) styles + skins them.
	const cells: PiuLabel[] = [];
	for (let i = 0; i < n; i++) {
		const cell = new Label(null, {
			width,
			height: rowHeight,
			string: actions[i],
		}) as PiuLabel;
		column.add(cell);
		cells.push(cell);
	}

	// Restyle the rows for a raw index: clamp into `[0, n-1]`, then point the hot
	// row at the active Style + Skin and the rest at the inactive Style + a null
	// skin (tabs.ts highlight idiom). n=0 makes the loop a no-op (an empty sheet).
	const applyActive = (raw: number): void => {
		const hot = raw < 0 ? 0 : raw > n - 1 ? n - 1 : raw;
		for (let i = 0; i < n; i++) {
			const cell = cells[i];
			cell.style = i === hot ? activeStyle : inactiveStyle;
			cell.skin = i === hot ? activeSkin : null;
		}
	};

	// Reactive thunk -> ONE effect re-highlights on change (idiom 5b, auto-tracks
	// active's signal); a bare number is applied once at construction (static).
	const active = props.active;
	if (typeof active === "function") {
		effect(() => {
			applyActive(active());
		});
	} else {
		applyActive(active);
	}

	return outer;
}
