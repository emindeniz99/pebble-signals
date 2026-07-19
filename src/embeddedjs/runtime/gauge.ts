// A circular gauge/dial — the opt-in `runtime/gauge` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/gauge` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Gauge is just a square
// `runtime/draw` Canvas that paints TWO ring segments with `g.arc` — a full-
// sweep `track` underneath and a foreground `fill` arc from `startDeg` over
// `sweepDeg * value`, plus an optional centered label. It owns no Port, no
// effect, and no reactivity of its own — it inherits ALL of that from Canvas.
// Both arcs are the JS-rasterized `arc` ring segment (there is no native arc on
// the Piu Port — see draw.ts's substrate note): angles are DEGREES, 0 = the +x
// axis (3 o'clock), increasing CLOCKWISE. The default 135°→405° sweep is the
// familiar bottom-gap dial.
//
// REACTIVITY IS FREE (mirrors badge.ts / progressbar.ts): `value` may be a
// thunk. Canvas re-runs `paint` in a non-drawing tracking pass on every reactive
// change, so a `value` read inside `paint` auto-subscribes — the gauge repaints
// when the signal it reads changes. No bind path, no manual invalidate: the
// enclosing Canvas effect (registered under the running owner, disposed with the
// screen) does it. The widget is DISPLAY-ONLY — the app drives the value.
//
// FONT / NO host object at MODULE SCOPE (badge.ts's blank-screen lesson): the
// optional label uses a default "24px Gothic" Style (a valid Pebble system font
// key — an invalid one renders BLANK, tools/fontcheck). It is created LAZILY —
// on the first Gauge that needs it, at RUNTIME — NOT at module scope: this is a
// PRELOADED module, and a top-level `new Style(...)` would run in the build-time
// preload compartment and freeze into a broken instance (measured: blank on
// device). A gauge with no `label` constructs no Style at all.
import { Canvas } from "runtime/draw";
import type { Color, Content, Style } from "../../../types/moddable/piu/MC-types";

// Centering heuristic for one line of "24px Gothic": ~7px per glyph half-width,
// ~12px font half-height. draw.ts's `text` positions from the top-left, so
// subtracting these from the gauge center lands a short label on the dial's
// center. Good enough for a percent string — no per-string measure (Rule 2).
const HALF_CHAR_W = 7;
const FONT_HALF = 12;

// The default label style, created ONCE but LAZILY — on the first Gauge with a
// label, at RUNTIME. It must NOT be constructed at module scope: `runtime/gauge`
// is a PRELOADED module, and a top-level `new Style(...)` would freeze into a
// broken preload instance and render blank on-device (measured, badge.ts).
let defaultStyle: Style | undefined;
const getDefaultStyle = (): Style => (defaultStyle ??= new Style({ font: "24px Gothic" }));

/** Props for {@link Gauge}. */
export type GaugeProps = {
	/** Fill fraction, 0..1 (clamped). A thunk (`() => v`) makes the gauge reactive; a bare number is static. */
	value: number | (() => number);
	/** Diameter of the square canvas in px. Defaults to 100. */
	size?: number;
	/** Angle where the arc begins, in degrees (0 = 3 o'clock, clockwise). Defaults to 135. */
	startDeg?: number;
	/** Total sweep of a full (value=1) arc, in degrees. Defaults to 270 (a bottom-gap dial). */
	sweepDeg?: number;
	/** Ring band thickness in px, grown inward from the edge. Defaults to 8. */
	thickness?: number;
	/** Background (full-sweep) arc color. Defaults to `"#303030"`. */
	track?: Color;
	/** Foreground (value) arc color. Defaults to `"#00d0ff"`. */
	fill?: Color;
	/** Optional centered label, given the clamped value (e.g. `v => Math.round(v*100)+"%"`). */
	label?: (v: number) => string;
	/** Text color for the label. Defaults to `"white"`. */
	labelColor?: Color;
	/** Override the label {@link Style}. Defaults to a lazily-created 24px Gothic style. */
	labelStyle?: Style;
};

/**
 * Gauge — a reactive circular gauge/dial on ONE Piu Port.
 *
 *   const [v] = useState(0.5);
 *   <Gauge value={v} label={(x) => Math.round(x * 100) + "%"} /> // reactive
 *   <Gauge value={0.25} size={80} />                             // static
 *
 * Composes {@link Canvas}: the `value` read inside `paint` auto-tracks, so the
 * gauge repaints for free when a signal it reads changes. `value` is clamped to
 * `[0,1]`; `0` draws only the track (no fill arc). See the module header.
 */
export function Gauge(props: GaugeProps): Content {
	const size = props.size ?? 100;
	const startDeg = props.startDeg ?? 135;
	const sweepDeg = props.sweepDeg ?? 270;
	const thickness = props.thickness ?? 8;
	const track = props.track ?? "#303030";
	const fill = props.fill ?? "#00d0ff";
	const value = props.value;
	const label = props.label;
	const labelColor = props.labelColor ?? "white";
	return Canvas({
		width: size,
		height: size,
		paint: (g) => {
			const c = size / 2;
			const r = size / 2;
			const raw = typeof value === "function" ? value() : value;
			const v = raw < 0 ? 0 : raw > 1 ? 1 : raw; // clamp to [0,1]
			// background track over the full sweep
			g.arc(c, c, r, startDeg, startDeg + sweepDeg, thickness, track);
			// foreground fill from startDeg over sweepDeg*v — nothing at v=0
			if (v > 0) g.arc(c, c, r, startDeg, startDeg + sweepDeg * v, thickness, fill);
			if (label) {
				const s = label(v);
				const style = props.labelStyle ?? getDefaultStyle();
				g.text(s, style, labelColor, c - s.length * HALF_CHAR_W, c - FONT_HALF);
			}
		},
	});
}
