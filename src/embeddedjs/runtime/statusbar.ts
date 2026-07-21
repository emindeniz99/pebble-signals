// A top status strip (title left, time right) — the opt-in `runtime/statusbar`
// module. OPT-IN & ZERO-COST: an app that never imports `runtime/statusbar`
// never ships it (the manifest prunes to the import closure — README
// tree-shaking), so this module costs non-users nothing.
//
// SUBSTRATE (Rule 2 — no new machinery): a StatusBar is a full-width `Container`
// anchored to the top (left:0,right:0,top:0, fixed `height`) holding up to two
// `Label`s — `title` anchored left, `time` anchored right. It is the hand-built
// Piu-node idiom (like flow.ts's Move), NOT a Canvas composition (like Badge):
// there is no drawing, just two positioned text nodes.
//
// REACTIVITY (idiom 5b — hand-built node + driving effect): a `title` or `time`
// passed as a THUNK (`() => s`) gets ONE effect that writes `lbl.string` on every
// change — the thunk's signal reads inside the effect auto-subscribe, so the
// label re-renders when they change. A plain string `title` is written ONCE at
// construction (static, no effect). Each effect registers under the running
// owner and disposes with the screen (no leak on navigate-away). `time` is a
// thunk-only prop (a status bar's clock is inherently live); omitting it renders
// no time Label.
//
// FONT/COLOR (gotcha — an invalid font key or a module-scope `new Style` renders
// BLANK): the label Style is built PER-CALL inside StatusBar (runtime, never
// module scope — a preloaded module's top-level `new Style` freezes into a
// broken instance, measured on Badge), with the valid Pebble system font key
// "18px Gothic" (tools/fontcheck) and the caller's `color`. An optional
// `background` becomes a fill Skin, likewise built per-call — never at module
// scope.
import { effect } from "runtime/signals";
import { appendChild, screen } from "runtime/jsx-runtime";
import type {
	Color,
	Content,
	Container as PiuContainer,
	Style,
} from "../../../types/moddable/piu/MC-types";

/** Props for {@link StatusBar}. */
export type StatusBarProps = {
	/** Title — left on rect, centered on a round screen (top of the centered stack). A thunk (`() => s`) makes it reactive; a bare string is static. Omitted = no title Label. */
	title?: string | (() => string);
	/** Time — a thunk (a clock is inherently live). Right on rect, centered below the title on round. Omitted = no time Label. */
	time?: () => string;
	/** Strip height in px. Defaults to 20. */
	height?: number;
	/** Text color. Defaults to `"white"`. */
	color?: Color;
	/** Optional strip background fill. Omitted = transparent (no Skin). */
	background?: Color;
};

// Add one positioned Label to the bar. A thunk value drives it with an effect
// (idiom 5b — reads inside the effect auto-track, so the label follows the
// signal); a bare string is written once at construction (static). `anchor` is
// the FULL position dict — on rect it carries the horizontal edge (left title /
// right time) filling the strip height; on round it is a full-width centered row.
function addLabel(
	bar: PiuContainer,
	value: string | (() => string),
	anchor: Record<string, number>,
	style: Style,
): void {
	const reactive = typeof value === "function";
	const lbl = new Label(null, {
		...anchor,
		style,
		string: reactive ? "" : String(value),
	});
	if (reactive) {
		const fn = value;
		effect(() => {
			lbl.string = String(fn());
		});
	}
	appendChild(bar, lbl);
}

/**
 * StatusBar — a top strip with a left title and a right time, on ONE Container.
 *
 *   const time = () => clock();
 *   <StatusBar title="Inbox" time={time} />   // static title, live time
 *   <StatusBar title={() => `${n()} new`} />  // reactive title, no time
 *
 * Hand-builds a full-width top-anchored Container with up to two Labels; thunk
 * props are driven by effects (idiom 5b). See the module header.
 */
export function StatusBar(props: StatusBarProps): Content {
	// ROUND HARMONY (gotcha 24 family — MEASURED: a top-left title clips to "ıx"):
	// the top strip lives in the circle's NARROWEST band, and left/right edge
	// anchors put the title/time in the bezel dead-zone. On round, CENTER the
	// content and STACK it (title over time), and drop the strip below the very
	// top so it sits where the circle is wide enough (Pebble's round convention —
	// center, don't edge-anchor). On rect, keep the classic title-left/time-right.
	const round = screen.round;
	const height = props.height ?? (round ? 48 : 20);
	const color = props.color ?? "white";
	const style = new Style({ font: "18px Gothic", color, horizontal: round ? "center" : "left" });
	// EXPLICIT width (gotcha 16): a left+right-anchored container measures 0 in
	// Piu's measure pass and draws NOTHING — the strip must carry a real width
	// (screen.width) and height, exactly like Card's outer box. On round, `top`
	// drops it ~10px below the bezel dead-zone.
	const dict: Record<string, unknown> = {
		left: 0,
		top: round ? 14 : 0,
		width: screen.width,
		height,
	};
	if (props.background !== undefined) dict.skin = new Skin({ fill: props.background });
	const bar = new Container(null, dict);
	if (round) {
		// centered stack with a little breathing room: title on the top row, time on
		// the row below (a 2px inset + a wider title/time gap read calmer on round).
		if (props.title !== undefined)
			addLabel(bar, props.title, { left: 0, right: 0, top: 2, height: 22 }, style);
		if (props.time !== undefined)
			addLabel(bar, props.time, { left: 0, right: 0, top: 24, height: 22 }, style);
	} else {
		if (props.title !== undefined)
			addLabel(bar, props.title, { left: 4, top: 0, bottom: 0 }, style);
		if (props.time !== undefined) addLabel(bar, props.time, { right: 4, top: 0, bottom: 0 }, style);
	}
	return bar;
}
