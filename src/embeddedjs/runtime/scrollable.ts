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
// COMPOSITION (mirrors menu.ts's outer-clip + inner-Column + moveBy idiom): an
// OUTER clipping `Container` sized to the viewport (EXPLICIT width+height —
// gotcha 16) holds an INNER `Column` of the children. The Column flows the
// children top-to-bottom and MEASURES its own content height (the gotcha-16
// fix: a Column composes vertically where a bare Container measures 0 and draws
// nothing); it is pinned top:0/left:0 so `offset` 0 shows the content top, and
// the outer CLIPS the overflow to the viewport window.
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
// INDICATOR (a composed runtime/draw Canvas — like dots.ts, NOT a hand-drawn
// node): with `indicator`, an overlay {@link ContentIndicator} paints an up
// chevron while there is content ABOVE (offset > 0) and a down chevron while
// there is content BELOW (offset < contentHeight − viewport). `canUp`/`canDown`
// are boolean THUNKS read inside the Canvas `paint`, so they auto-subscribe to
// `offset` and the chevrons repaint for free on scroll (the dots.ts reactivity
// contract — no bind path, no manual invalidate). The down-chevron's max is
// DERIVED from the inner Column's MEASURED height (`column.height`, valid after
// Piu's post-mount measure pass), so an arbitrary-content viewport needs no
// content-height prop. The overlay carries no `fill`, so it composites over the
// scrolled content beneath it.
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): every Container / Column / Port / effect
// is built INSIDE the exported functions at call time — this module constructs
// NOTHING at top level (the one module-scope helper, `chevron`, is a PURE
// fillColor-span emitter that builds no host object), so nothing freezes into a
// broken preload instance, and the exports are `function` declarations exactly
// like menu.ts / statusbar.ts.
import { effect } from "runtime/signals";
import { appendChild, screen, type JSXNode } from "runtime/jsx-runtime";
import { Canvas, type DrawContext } from "runtime/draw";
import type {
	Color,
	Content,
	Container as PiuContainer,
} from "../../../types/moddable/piu/MC-types";

// Chevron geometry (px), shared by both arrows: PAD insets the apex from the
// edge, HALF_W is each arm's horizontal reach, ARM_H its vertical drop, THICK
// the stroke width. "white" reads on the black watchfaces the examples ship.
const PAD = 3;
const HALF_W = 8;
const ARM_H = 6;
const THICK = 2;
const CHEVRON: Color = "white";

// Paint one chevron as two diagonal strokes meeting at an apex (draw.ts's
// line() DDA-stamps each). apex at (cx, apexY); the arms reach to
// (cx ± HALF_W, apexY + armDy) — a POSITIVE armDy drops the arms BELOW the apex
// ("^", points up), a NEGATIVE armDy raises them ABOVE it ("v", points down).
// Pure: it only emits fillColor spans through `g`, constructing no host object,
// so it is safe at module scope (like draw.ts's isqrt). A const arrow, not a
// `function` (preloaded-module alias rule, gotcha 13).
const chevron = (g: DrawContext, cx: number, apexY: number, armDy: number): void => {
	g.line(cx - HALF_W, apexY + armDy, cx, apexY, THICK, CHEVRON);
	g.line(cx, apexY, cx + HALF_W, apexY + armDy, THICK, CHEVRON);
};

/** Props for {@link ContentIndicator}. */
export type ContentIndicatorProps = {
	/** Thunk — true while there is content ABOVE (paints the up chevron). Read a signal inside so it tracks. */
	canUp: () => boolean;
	/** Thunk — true while there is content BELOW (paints the down chevron). Read a signal inside so it tracks. */
	canDown: () => boolean;
	/** Overlay width in px. Defaults to the screen width (a width-less port measures 0 — gotcha 16). */
	width?: number;
	/** Overlay height in px — the chevrons sit at its top and bottom edges. Defaults to the screen height. */
	height?: number;
};

/**
 * ContentIndicator — a transparent Canvas overlay painting an up chevron
 * (top-center) while `canUp()` and a down chevron (bottom-center) while
 * `canDown()`: Pebble's ContentIndicator, the "more content this way" hint.
 *
 *   <ContentIndicator canUp={() => off() > 0} canDown={() => off() < max}
 *     width={140} height={140} />
 *
 * `canUp`/`canDown` are boolean THUNKS: reading them inside {@link Canvas}'s
 * `paint` auto-subscribes to whatever signals they touch, so the chevrons
 * repaint for free when the scroll position changes (the dots.ts idiom — no
 * bind path, no manual invalidate). BOTH thunks are evaluated every frame (each
 * gates one chevron), so both stay subscribed regardless of which arrow draws.
 * There is no `fill`, so the port composites over the content beneath it.
 * Returns a single Piu Port. See the module header.
 */
export function ContentIndicator(props: ContentIndicatorProps): Content {
	const width = props.width ?? screen.width;
	const height = props.height ?? screen.height;
	const canUp = props.canUp;
	const canDown = props.canDown;
	const cx = width / 2;
	return Canvas({
		width,
		height,
		paint: (g) => {
			// up chevron near the top edge (apex up, arms drop toward the center)
			if (canUp()) chevron(g, cx, PAD, ARM_H);
			// down chevron near the bottom edge (apex down, arms rise toward center)
			if (canDown()) chevron(g, cx, height - 1 - PAD, -ARM_H);
		},
	});
}

/** Props for {@link Scrollable}. */
export type ScrollableProps = {
	/** Viewport height in px — the clip window the content scrolls within (a size-less container measures 0 — gotcha 16). */
	height: number;
	/** Viewport width in px. Defaults to the screen width. */
	width?: number;
	/** Scroll position in px (content shifted UP) — a THUNK; read a signal inside so scrolling is live. Rounded to whole px. */
	offset: () => number;
	/** Overlay up/down chevrons (a Pebble ContentIndicator) reflecting the travel remaining. Default off. */
	indicator?: boolean;
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
 * Hand-builds an outer clipping Container over an inner Column of the children
 * (menu.ts's idiom); ONE effect scrolls the Column via the device-proven moveBy
 * DELTA (flow.ts's Move — rounded, guarded), and an optional overlay
 * {@link ContentIndicator} paints the chevrons. Unlike {@link Menu} /
 * VirtualList (fixed-shape rows), the content is anything and its height is
 * MEASURED, not declared. See the module header for the composition + scroll +
 * indicator contract.
 */
export function Scrollable(props: ScrollableProps): Content {
	const height = props.height;
	const width = props.width ?? screen.width;
	const offset = props.offset;

	// OUTER clip window: EXPLICIT width + height (gotcha 16 — a size-less
	// container measures 0 and draws nothing) + clip so the overflowing content
	// stays inside the viewport (the whole point of a scroller).
	const outer = new Container(null, { width, height, clip: true }) as PiuContainer;
	// INNER content column: explicit width, pinned top-left; its height is
	// MEASURED from the children (a Column flows them vertically — the gotcha-16
	// fix), so it can exceed the viewport and be clipped.
	const column = new Column(null, { left: 0, top: 0, width }) as PiuContainer;
	if (props.children !== undefined) appendChild(column, props.children);
	outer.add(column);

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

	if (props.indicator) {
		// The chevrons track `offset` (read inside these thunks → auto-subscribed in
		// the Canvas paint). Down-travel remains while offset is short of the max
		// scroll = MEASURED content height − viewport (column.height is valid after
		// Piu's post-mount measure pass; before it, a still-unmeasured height only
		// suppresses the down chevron for the first, non-drawing tracking frame).
		const canUp = () => Math.round(offset()) > 0;
		const canDown = () => Math.round(offset()) < column.height - height;
		outer.add(ContentIndicator({ canUp, canDown, width, height }));
	}

	return outer;
}
