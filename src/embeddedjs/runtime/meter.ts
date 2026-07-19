// A segmented linear Meter (battery / signal bars) — the opt-in `runtime/meter`
// module. OPT-IN & ZERO-COST: an app that never imports `runtime/meter` never
// ships it (the manifest prunes to the import closure — README tree-shaking),
// so this module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Meter is just a `runtime/draw`
// Canvas that paints N equal rounded bars left-to-right. It owns no Port, no
// effect, and no reactivity of its own — it inherits ALL of that from Canvas.
// Each bar is a `fillRoundRect` (JS-rasterized on the port — see draw.ts's
// substrate note); the first `round(value*segments)` bars are painted `on`, the
// rest `off`, separated by `gap` px.
//
// REACTIVITY IS FREE (mirrors badge.ts): `value` may be a thunk. Canvas re-runs
// `paint` in a non-drawing tracking pass on every reactive change, so a `value`
// read inside `paint` auto-subscribes — the meter repaints when the signal it
// reads changes. No bind path, no manual invalidate: the enclosing Canvas
// effect (registered under the running owner, disposed with the screen) does it.
//
// NO HOST OBJECT AT MODULE SCOPE (batch-1/2 lesson): unlike badge, a Meter
// draws NO text, so it needs no Style — there is nothing to construct lazily.
// It stays a pure function returning Canvas({...}), safe to preload.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link Meter}. */
export type MeterProps = {
	/** Fill level, 0..1 (clamped). A thunk (`() => v`) makes the meter reactive; a bare number is static. */
	value: number | (() => number);
	/** Number of bars. Defaults to 5. */
	segments?: number;
	/** Total width in px. Defaults to 100. */
	width?: number;
	/** Bar height in px. Defaults to 20. */
	height?: number;
	/** Lit-bar color. Defaults to `"#00c000"`. */
	on?: Color;
	/** Unlit-bar color. Defaults to `"#303030"`. */
	off?: Color;
	/** Gap between bars in px. Defaults to 2. */
	gap?: number;
};

/**
 * Meter — a reactive segmented linear meter (battery / signal bars), on ONE
 * Piu Port.
 *
 *   const [level] = useState(0.6);
 *   <Meter value={level} />                    // reactive: repaints when level changes
 *   <Meter value={0.4} segments={4} on="lime" />// static, 4 bars
 *
 * Composes {@link Canvas}: the `value` read inside `paint` auto-tracks, so the
 * meter repaints for free when a signal it reads changes. See the module header.
 */
export function Meter(props: MeterProps): Content {
	const segments = props.segments ?? 5;
	const width = props.width ?? 100;
	const height = props.height ?? 20;
	const on = props.on ?? "#00c000";
	const off = props.off ?? "#303030";
	const gap = props.gap ?? 2;
	const value = props.value;
	return Canvas({
		width,
		height,
		paint: (g) => {
			// Guard degenerate geometry — never emit a negative/zero-width span.
			if (segments < 1 || width <= 0 || height <= 0) return;
			const segWidth = (width - (segments - 1) * gap) / segments;
			if (segWidth <= 0) return;
			const raw = typeof value === "function" ? value() : value;
			const v = raw < 0 ? 0 : raw > 1 ? 1 : raw; // clamp to [0,1]
			const lit = Math.round(v * segments);
			const radius = Math.floor(Math.min(height, segWidth) / 4);
			for (let i = 0; i < segments; i++) {
				const x = i * (segWidth + gap);
				g.fillRoundRect(x, 0, segWidth, height, radius, i < lit ? on : off);
			}
		},
	});
}
