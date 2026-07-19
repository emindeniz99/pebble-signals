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
	/** Left-aligned title. A thunk (`() => s`) makes it reactive; a bare string is static. Omitted = no title Label. */
	title?: string | (() => string);
	/** Right-aligned time — a thunk (a clock is inherently live). Omitted = no time Label. */
	time?: () => string;
	/** Strip height in px. Defaults to 20. */
	height?: number;
	/** Text color. Defaults to `"white"`. */
	color?: Color;
	/** Optional strip background fill. Omitted = transparent (no Skin). */
	background?: Color;
};

// Add one anchored Label to the bar. A thunk value drives it with an effect
// (idiom 5b — reads inside the effect auto-track, so the label follows the
// signal); a bare string is written once at construction (static). `anchor`
// carries the horizontal edge (left for title, right for time). `top:0,bottom:0`
// vertically fills the strip so the text centers on the row.
function addLabel(
	bar: PiuContainer,
	value: string | (() => string),
	anchor: { left: number } | { right: number },
	style: Style,
): void {
	const reactive = typeof value === "function";
	const lbl = new Label(null, {
		...anchor,
		top: 0,
		bottom: 0,
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
	const height = props.height ?? 20;
	const color = props.color ?? "white";
	const style = new Style({ font: "18px Gothic", color });
	// EXPLICIT width (gotcha 16): a left+right-anchored container measures 0 in
	// Piu's measure pass and draws NOTHING — the strip must carry a real width
	// (screen.width) and height, exactly like Card's outer box.
	const dict: Record<string, unknown> = { left: 0, top: 0, width: screen.width, height };
	if (props.background !== undefined) dict.skin = new Skin({ fill: props.background });
	const bar = new Container(null, dict);
	if (props.title !== undefined) addLabel(bar, props.title, { left: 4 }, style);
	if (props.time !== undefined) addLabel(bar, props.time, { right: 4 }, style);
	return bar;
}
