// A reactive notification/count Badge — the opt-in `runtime/badge` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/badge` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Badge is just a small square
// `runtime/draw` Canvas that paints ONE filled disc with a number centered on
// it. It owns no Port, no effect, and no reactivity of its own — it inherits
// ALL of that from Canvas. The disc is a JS-rasterized `fillCircle` (there is
// no native circle on the Piu Port — see draw.ts's substrate note); the number
// is a `drawString` passthrough.
//
// REACTIVITY IS FREE (mirrors draw.ts): `count` may be a thunk. Canvas re-runs
// `paint` in a non-drawing tracking pass on every reactive change, so a `count`
// read inside `paint` auto-subscribes — the badge repaints when the signal it
// reads changes. No bind path, no manual invalidate: the enclosing Canvas
// effect (registered under the running owner, disposed with the screen) does it.
//
// FONT (gotcha — an invalid font key renders BLANK): the default label style
// uses "18px Gothic", a valid Pebble system font (tools/fontcheck). It is
// created LAZILY (first Badge, at runtime) — NOT at module scope: this is a
// PRELOADED module, and a top-level `new Style(...)` would run in the
// build-time preload compartment and freeze into a broken instance (measured:
// blank on device). `Style` is a host compartment global (the Node test
// sandbox injects a stub before loading this module).
import { Canvas } from "runtime/draw";
import type { Color, Content, Style } from "../../../types/moddable/piu/MC-types";

// Centering heuristic for a single line of "18px Gothic": ~10px per glyph, ~18px
// tall. Half those give the top-left origin that lands the string on the disc's
// center (draw.ts's `text` positions from the top-left). Digits only, so a
// per-glyph average is close enough — no per-string measure (Rule 2).
const HALF_CHAR_W = 5;
const FONT_HALF = 9;

// The default label style, created ONCE but LAZILY — on the first Badge, at
// RUNTIME. It must NOT be constructed at module scope: `runtime/badge` is a
// PRELOADED module (frozen into ROM at build time), and a top-level
// `new Style(...)` would run in the build-time preload compartment, where a Piu
// Style constructs into a broken/frozen instance and the badge renders blank
// on-device (measured). A valid font key is mandatory — an invalid one renders
// blank too (tools/fontcheck).
let defaultStyle: Style | undefined;
const getDefaultStyle = (): Style => (defaultStyle ??= new Style({ font: "18px Gothic" }));

/** Props for {@link Badge}. */
export type BadgeProps = {
	/** The number to show. A thunk (`() => n`) makes the badge reactive; a bare number is static. */
	count: (() => number) | number;
	/** Disc diameter in px. Defaults to 28. */
	size?: number;
	/** Disc fill color. Defaults to `"red"`. */
	color?: Color;
	/** Number color. Defaults to `"white"`. */
	textColor?: Color;
	/** Override the label {@link Style}. Defaults to a lazily-created 18px Gothic style. */
	style?: Style;
};

/**
 * Badge — a reactive filled disc with a centered number, on ONE Piu Port.
 *
 *   const [n] = useState(3);
 *   <Badge count={n} />              // reactive: repaints when n changes
 *   <Badge count={7} color="blue" /> // static
 *
 * Composes {@link Canvas}: the `count` read inside `paint` auto-tracks, so the
 * badge repaints for free when a signal it reads changes. See the module header.
 */
export function Badge(props: BadgeProps): Content {
	const size = props.size ?? 28;
	const color = props.color ?? "red";
	const textColor = props.textColor ?? "white";
	const style = props.style ?? getDefaultStyle();
	const count = props.count;
	return Canvas({
		width: size,
		height: size,
		paint: (g) => {
			const n = typeof count === "function" ? count() : count;
			g.fillCircle(size / 2, size / 2, size / 2, color);
			const s = String(n);
			g.text(s, style, textColor, size / 2 - s.length * HALF_CHAR_W, size / 2 - FONT_HALF);
		},
	});
}
