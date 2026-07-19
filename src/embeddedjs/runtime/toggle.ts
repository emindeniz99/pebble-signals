// A reactive on/off Toggle — the opt-in `runtime/toggle` module. OPT-IN &
// ZERO-COST: an app that never imports `runtime/toggle` never ships it (the
// manifest prunes to the import closure — README tree-shaking), so this module
// costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Toggle is just a small
// `runtime/draw` Canvas that paints ONE rounded pill (fillRoundRect) with ONE
// filled knob disc (fillCircle) on top. It owns no Port, no effect, and no
// reactivity of its own — it inherits ALL of that from Canvas. The pill is a
// JS-rasterized round-rect and the knob a JS-rasterized disc (there is no native
// round-rect/circle on the Piu Port — see draw.ts's substrate note).
//
// REACTIVITY IS FREE (mirrors badge.ts): `on` may be a thunk. Canvas re-runs
// `paint` in a non-drawing tracking pass on every reactive change, so an `on`
// read inside `paint` auto-subscribes — the toggle repaints (and the knob
// slides) when the signal it reads flips. No bind path, no manual invalidate:
// the enclosing Canvas effect (registered under the running owner, disposed with
// the screen) does it. The Toggle is DISPLAY-ONLY — the app drives `on` via a
// signal/button; the widget just renders the current state reactively.
//
// GEOMETRY: the pill fills the whole surface, corner radius = height/2 (a true
// stadium). The knob is a disc of radius height/2 − 2 (a 2px inset), vertically
// centered, its center height/2 in from the RIGHT edge when on and height/2 in
// from the LEFT edge when off — so it sits flush in the rounded end it slides to.
//
// NO MODULE-SCOPE HOST OBJECTS: this module constructs no Piu Style/Skin at all
// (the pill + knob are pure fillColor spans), so there is nothing to make lazy —
// it sidesteps the preloaded-module "blank on device" trap by construction.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link Toggle}. */
export type ToggleProps = {
	/** Toggle state. A thunk (`() => b`) makes it reactive; a bare boolean is static. */
	on: boolean | (() => boolean);
	/** Pill width in px. Defaults to 44. */
	width?: number;
	/** Pill height in px (also sets the corner radius = height/2). Defaults to 24. */
	height?: number;
	/** Pill color when on. Defaults to `"#00a000"`. */
	onColor?: Color;
	/** Pill color when off. Defaults to `"#606060"`. */
	offColor?: Color;
	/** Knob disc color. Defaults to `"white"`. */
	knob?: Color;
};

/**
 * Toggle — a reactive on/off pill with a sliding knob, on ONE Piu Port.
 *
 *   const [on, setOn] = useState(false);
 *   <Toggle on={on} />                        // reactive: knob slides when on flips
 *   <Toggle on={true} onColor="blue" />       // static
 *
 * Composes {@link Canvas}: the `on` read inside `paint` auto-tracks, so the
 * toggle repaints (knob moves right when on, left when off) for free when a
 * signal it reads changes. See the module header.
 */
export function Toggle(props: ToggleProps): Content {
	const w = Math.max(0, props.width ?? 44);
	const h = Math.max(0, props.height ?? 24);
	const onColor = props.onColor ?? "#00a000";
	const offColor = props.offColor ?? "#606060";
	const knob = props.knob ?? "white";
	const on = props.on;
	const r = h / 2; // stadium corner radius
	const knobR = Math.max(0, r - 2); // 2px inset from the pill edge
	return Canvas({
		width: w,
		height: h,
		paint: (g) => {
			const isOn = typeof on === "function" ? on() : on;
			g.fillRoundRect(0, 0, w, h, r, isOn ? onColor : offColor);
			const knobCx = isOn ? w - r : r; // right end when on, left end when off
			g.fillCircle(knobCx, r, knobR, knob);
		},
	});
}
