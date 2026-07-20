// A free-form scrolling viewport + up/down ContentIndicator — the opt-in
// `runtime/scrollable` module. OPT-IN & ZERO-COST: an app that never imports
// `runtime/scrollable` never ships it (the manifest prunes to the import
// closure — README tree-shaking), so this module costs non-users nothing.
//
// WHAT (Rule 2 — no new substrate): React-Native's <ScrollView> + Pebble's
// ContentIndicator — the one foundational primitive the catalog lacked:
// FREE-FORM scroll of ARBITRARY children. Menu / VirtualList scroll FIXED-shape
// rows; Scrollable scrolls anything you nest in it. DISPLAY-ONLY (Rule 8): the
// APP owns the scroll position (a signal moved by buttons / a rotary) and hands
// it in as `offset`; the widget only shifts the content and reflects how far it
// can still travel. No input handling, no momentum, no touch — a loader is the
// sole self-owning widget and this is not one.
//
// COMPOSITION (mirrors menu.ts's clip + inner-Column + moveBy idiom): a CLIPPING
// `Container` sized to the content window (EXPLICIT width+height — gotcha 16)
// holds an INNER `Column` of the children. The Column flows the children
// top-to-bottom and MEASURES its own content height (the gotcha-16 fix: a Column
// composes vertically where a bare Container measures 0 and draws nothing); it
// is pinned top:0/left:0 so `offset` 0 shows the content top, and the clip hides
// the overflow.
//
// SCROLL (the device-proven Move idiom, flow.ts): coordinate props are
// construction-time statics on this port — a post-mount position WRITE crashes
// it — so the ONLY safe way to scroll a mounted subtree is content.moveBy on the
// inner Column (2026-07 probe: moveBy stepped a box across gabbro with 0 aborts,
// unlike position / `visible` writes, which crash the port). ONE effect tracks
// `offset` (a thunk), rounds it to whole px (a float source — an animate() tween
// — never accumulates sub-pixel drift, like Move), and applies the DELTA from
// the last-applied offset via moveBy(0, -(next - last)) — GUARDED so an
// unchanged offset issues no moveBy at all (Move's lx/ly guard). The content
// shifts UP as the offset grows, so the y delta handed to moveBy is negative.
//
// INDICATOR — LABEL CHEVRONS IN RESERVED GUTTERS (gotcha 24, MEASURED on gabbro
// 2026-07, the whole reason this is not a draw-Canvas overlay): with `indicator`
// the viewport becomes a Column of THREE stacked, NON-overlapping bands — a "^"
// gutter, the clip window, a "v" gutter. Each gutter is a `Label` whose string
// an effect flips between the glyph and "" as `offset` crosses the ends, so the
// chevron appears/vanishes for free (a device-safe Label `.string` write — the
// bind path's own mechanism). It is DELIBERATELY a Label and NOT a runtime/draw
// Canvas: a Canvas Port that OVERLAPS a moveBy'd content Column WEDGES the
// firmware (the screenshot / watch-info transport times out — the Piu run loop
// never idles), and even TWO non-overlapping chevron Canvases beside a moveBy'd
// Column wedge it the same way (MEASURED: `dots`'s single Canvas renders; an
// overlapping chevron Port, or a second chevron Canvas, does not). Labels carry
// no such cost (8 rows + moveBy already scroll fine). The glyphs are ASCII
// "^"/"v" because Pebble Gothic renders no ▲/▼/↑/↓ (MEASURED: all tofu). The
// down-chevron's max is DERIVED from the inner Column's MEASURED height
// (`column.height`, valid once the enclosing Column has measured it).
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): every Container / Column / Label / Style
// / effect is built INSIDE the exported functions at call time — this module
// constructs NOTHING at top level (the lazy `chevStyle` is created on the first
// indicator, at runtime), so nothing freezes into a broken preload instance, and
// the exports are `function` declarations exactly like menu.ts / statusbar.ts.
import { effect } from "runtime/signals";
import { appendChild, screen, type JSXNode } from "runtime/jsx-runtime";
import type {
	Content,
	Container as PiuContainer,
	Label as PiuLabel,
	Style as PiuStyle,
} from "../../../types/moddable/piu/MC-types";

// Default gutter (chevron band) height in px — the reserved, non-overlapping
// strip at each edge that a chevron Label sits in. Tall enough for the bold 24px
// caret with a pixel of breathing room.
const GUTTER = 26;

// The default chevron Style, created ONCE but LAZILY — on the first indicator,
// at RUNTIME. It must NOT be constructed at module scope: `runtime/scrollable`
// is a PRELOADED module and a top-level `new Style(...)` would freeze into a
// broken preload instance and render blank on-device (gotcha 13, badge.ts).
// Centered so the caret sits mid-gutter; "white" reads on the black watchfaces
// the examples ship.
let chevStyle: PiuStyle | undefined;
const getChevStyle = (): PiuStyle =>
	(chevStyle ??= new Style({ font: "bold 24px Gothic", color: "white", horizontal: "center" }));

/** Props for {@link ContentIndicator}. */
export type ContentIndicatorProps = {
	/** Which chevron: `"up"` (a "^") or `"down"` (a "v"). */
	edge: "up" | "down";
	/** Thunk — true while there is content in that direction (shows the chevron). Read a signal inside so it tracks. */
	show: () => boolean;
	/** Gutter width in px. Defaults to the screen width (a width-less label measures 0 — gotcha 16). */
	width?: number;
	/** Gutter (band) height in px. Defaults to `GUTTER` (26). */
	height?: number;
	/** Override the chevron {@link Style}. Defaults to a lazily-created centered bold 24px Gothic style. */
	style?: PiuStyle;
};

/**
 * ContentIndicator — a one-line {@link Label} showing ONE chevron ("^" for up,
 * "v" for down) while `show()` is true, else blank: Pebble's ContentIndicator,
 * the "more content this way" hint.
 *
 *   <ContentIndicator edge="down" show={() => off() < max} width={140} />
 *
 * It is a GUTTER band, placed in FLOW above/below the content (that is how
 * {@link Scrollable} composes it). It is a Label — NOT a draw Canvas — ON
 * PURPOSE: a Canvas Port beside/over a moveBy'd content Column wedges the
 * firmware (gotcha 24, MEASURED on gabbro). `show` is a boolean THUNK: an
 * `effect` reads it and writes the Label's `string` (the bind path's own
 * mechanism), so the chevron appears/vanishes for free when the scroll position
 * changes. Returns a single Piu Label. See the module header.
 */
export function ContentIndicator(props: ContentIndicatorProps): Content {
	const width = props.width ?? screen.width;
	const height = props.height ?? GUTTER;
	const glyph = props.edge === "up" ? "^" : "v";
	const show = props.show;
	const style = props.style ?? getChevStyle();
	const label = new Label(null, { width, height, style, string: "" }) as PiuLabel;
	// reactive show/hide: the effect writes the glyph or "" as `show()` flips — a
	// device-safe Label `.string` write (gotcha 24 — NEVER a draw Canvas beside
	// the moveBy'd content). Registered under the running owner, disposed with the
	// screen.
	effect(() => {
		label.string = show() ? glyph : "";
	});
	return label as unknown as Content;
}

/** Props for {@link Scrollable}. */
export type ScrollableProps = {
	/** Height of the clip window the content scrolls within, in px (a size-less container measures 0 — gotcha 16). With `indicator`, two `GUTTER`-tall chevron bands are added OUTSIDE it, so the widget renders `height + 2·GUTTER` tall. */
	height: number;
	/** Viewport width in px. Defaults to the screen width. */
	width?: number;
	/** Scroll position in px (content shifted UP) — a THUNK; read a signal inside so scrolling is live. Rounded to whole px. */
	offset: () => number;
	/** Reserve up/down chevron gutters (a Pebble ContentIndicator) reflecting the travel remaining. Default off. */
	indicator?: boolean;
	/** Max scroll in px (content height − `height`) for the down chevron. A plain number is correct from the first frame; omit and the widget falls back to the inner Column's MEASURED height (accurate once measured — the initial frame may miss the down chevron). */
	max?: number;
	/** The content to scroll — any nodes; stacked in an inner Column and clipped to the viewport. */
	children?: JSXNode;
};

/**
 * Scrollable — a free-form scrolling viewport for ARBITRARY content: RN's
 * <ScrollView> on a watch. DISPLAY-ONLY — the app owns the scroll position and
 * drives `offset` (buttons / a rotary); the widget shifts the content and, with
 * `indicator`, shows how far it can still travel.
 *
 *   const [y, setY] = useState(0);
 *   <Scrollable height={140} offset={() => y()} indicator>
 *     <Label ... /> <Label ... /> ...
 *   </Scrollable>
 *
 * Hand-builds a clipping Container over an inner Column of the children
 * (menu.ts's idiom); ONE effect scrolls the Column via the device-proven moveBy
 * DELTA (flow.ts's Move — rounded, guarded). With `indicator`, the viewport is a
 * Column of THREE non-overlapping bands — "^" gutter, clip window, "v" gutter —
 * whose chevrons are {@link ContentIndicator} Labels (NOT draw Canvases: a Canvas
 * beside a moveBy'd Column wedges the firmware — gotcha 24, MEASURED). Unlike
 * {@link Menu} / VirtualList (fixed-shape rows), the content is anything and its
 * height is MEASURED, not declared. See the module header for the composition +
 * scroll + indicator contract.
 */
export function Scrollable(props: ScrollableProps): Content {
	const width = props.width ?? screen.width;
	const offset = props.offset;
	// The clip window is EXACTLY `height`; with `indicator` the two chevron bands
	// are added OUTSIDE it, so `height` means the same content window with or
	// without the indicator — the app's max-scroll math (content − height) is
	// unchanged by toggling it, and stays decoupled from GUTTER.
	const innerH = props.height;

	// CLIP window: EXPLICIT width + height (gotcha 16 — a size-less container
	// measures 0 and draws nothing) + clip so the overflowing content stays inside
	// the window (the whole point of a scroller).
	const clip = new Container(null, { width, height: innerH, clip: true }) as PiuContainer;
	// INNER content column: explicit width, pinned top-left; its height is
	// MEASURED from the children (a Column flows them vertically — the gotcha-16
	// fix), so it can exceed the window and be clipped.
	const column = new Column(null, { left: 0, top: 0, width }) as PiuContainer;
	if (props.children !== undefined) appendChild(column, props.children);
	clip.add(column);

	// Last-applied scroll offset (px the content has shifted UP). Persists across
	// effect runs so each change scrolls INCREMENTALLY (Move's lx/ly), not from
	// scratch — the offset is state, not recomputed each time.
	let last = 0;
	effect(() => {
		const next = Math.round(offset()); // whole px — a float source never drifts
		if (next !== last) {
			column.moveBy(0, -(next - last)); // content shifts UP as offset grows → negative
			last = next;
		}
	});

	if (!props.indicator) return clip;

	// The chevrons track `offset` (read inside these thunks → the ContentIndicator
	// effects subscribe to it). Down-travel remains while offset is short of the
	// max scroll: an app-provided `max` (a plain number, correct from the first
	// frame) if given, else the inner Column's MEASURED height − clip window
	// (`column.height` is a host property, not a signal — valid after Piu measures
	// the Column, so the down chevron settles from the first scroll). NOTE: we do
	// NOT poke a signal from onDisplaying to force an early re-read — a Piu
	// property write during the display phase wedges the firmware (gotcha 24, same
	// out-of-sequence class as an in-onDraw invalidate; MEASURED on gabbro).
	const maxScroll = props.max;
	const canUp = () => Math.round(offset()) > 0;
	const canDown = () => Math.round(offset()) < (maxScroll ?? column.height - innerH);
	// THREE non-overlapping bands stacked top-to-bottom: the chevron Labels sit in
	// FLOW beside the content (gotcha 24 — NEVER a draw Canvas over the moveBy'd
	// Column). The wrap is GUTTER taller on each side than the clip window.
	const wrap = new Column(null, { width, height: props.height + 2 * GUTTER }) as PiuContainer;
	wrap.add(ContentIndicator({ edge: "up", show: canUp, width, height: GUTTER }));
	wrap.add(clip);
	wrap.add(ContentIndicator({ edge: "down", show: canDown, width, height: GUTTER }));
	return wrap;
}
