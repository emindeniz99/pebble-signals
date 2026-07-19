// A horizontal ProgressBar — the opt-in `runtime/progressbar` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/progressbar` never
// ships it (the manifest prunes to the import closure — README tree-shaking),
// so this module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a ProgressBar is just a short, wide
// `runtime/draw` Canvas that paints TWO rounded rects — a full-width `track`
// underneath and a left-anchored `fill` whose width is `value * width`. It owns
// no Port, no effect, and no reactivity of its own — it inherits ALL of that
// from Canvas. Both rects are the fillRoundRect isqrt scanline (there is no
// native round-rect on the Piu Port — see draw.ts's substrate note).
//
// REACTIVITY IS FREE (mirrors badge.ts / draw.ts): `value` may be a thunk.
// Canvas re-runs `paint` in a non-drawing tracking pass on every reactive
// change, so a `value` read inside `paint` auto-subscribes — the bar repaints
// when the signal it reads changes. No bind path, no manual invalidate: the
// enclosing Canvas effect (registered under the running owner, disposed with
// the screen) does it. The widget is DISPLAY-ONLY — the app drives the value.
//
// NO host object at MODULE SCOPE (badge.ts's blank-screen lesson): this module
// constructs nothing at top level — no Style/Skin (it draws no text). It just
// resolves defaults and returns a Canvas, so there is nothing to freeze into a
// broken preload instance.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link ProgressBar}. */
export type ProgressBarProps = {
	/** Progress in `0..1` (clamped). A thunk (`() => v`) makes the bar reactive; a bare number is static. */
	value: number | (() => number);
	/** Bar width in px. Defaults to 100. */
	width?: number;
	/** Bar height in px. Defaults to 10. */
	height?: number;
	/** Filled-portion color. Defaults to `"#1560bd"`. */
	fill?: Color;
	/** Track (background) color. Defaults to `"#404040"`. */
	track?: Color;
	/** Corner radius in px. Defaults to `height / 2` (a pill). */
	radius?: number;
};

/**
 * ProgressBar — a reactive horizontal progress bar on ONE Piu Port.
 *
 *   const [v] = useState(0.5);
 *   <ProgressBar value={v} />               // reactive: repaints when v changes
 *   <ProgressBar value={0.25} width={80} /> // static
 *
 * Composes {@link Canvas}: the `value` read inside `paint` auto-tracks, so the
 * bar repaints for free when a signal it reads changes. `value` is clamped to
 * `[0,1]`; `0` draws no fill, `1` fills the whole track. See the module header.
 */
export function ProgressBar(props: ProgressBarProps): Content {
	const width = props.width ?? 100;
	const height = props.height ?? 10;
	const fill = props.fill ?? "#1560bd";
	const track = props.track ?? "#404040";
	const radius = props.radius ?? height / 2;
	const value = props.value;
	return Canvas({
		width,
		height,
		paint: (g) => {
			const raw = typeof value === "function" ? value() : value;
			const v = raw < 0 ? 0 : raw > 1 ? 1 : raw;
			g.fillRoundRect(0, 0, width, height, radius, track);
			const fillW = Math.round(v * width);
			if (fillW > 0) g.fillRoundRect(0, 0, fillW, height, radius, fill);
		},
	});
}
