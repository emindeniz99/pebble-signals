// A page/step DotIndicator — the opt-in `runtime/dots` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/dots` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a DotIndicator is just a `runtime/
// draw` Canvas that paints a ROW of `count` filled discs (`fillCircle`), evenly
// spaced across `width` and vertically centered. The disc at `active` is drawn
// in the `on` color a touch larger (radius+1); the rest are `off`. It owns no
// Port, no effect, and no reactivity of its own — it inherits ALL of that from
// Canvas.
//
// REACTIVITY IS FREE (mirrors badge.ts): `active` may be a thunk. Canvas re-runs
// `paint` in a non-drawing tracking pass on every reactive change, so an `active`
// read inside `paint` auto-subscribes — the highlighted dot moves when the
// signal it reads changes. No bind path, no manual invalidate.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link DotIndicator}. */
export type DotIndicatorProps = {
	/** How many dots to draw (a page/step count). Values ≤ 0 draw nothing. */
	count: number;
	/** The highlighted index. A thunk (`() => i`) makes it reactive; a bare number is static. Clamped to `[0, count-1]`. */
	active: number | (() => number);
	/** Row width in px. Defaults to 96. */
	width?: number;
	/** Row height in px. Defaults to 12. */
	height?: number;
	/** Active-dot color. Defaults to `"white"`. */
	on?: Color;
	/** Inactive-dot color. Defaults to `"#606060"`. */
	off?: Color;
	/** Inactive-dot radius in px; the active dot is `radius+1`. Defaults to 3. */
	radius?: number;
};

/**
 * DotIndicator — a reactive row of dots with one highlighted, on ONE Piu Port.
 *
 *   const [page] = useState(0);
 *   <DotIndicator count={4} active={page} />       // reactive: the dot moves
 *   <DotIndicator count={3} active={1} on="cyan" /> // static
 *
 * Composes {@link Canvas}: `active` read inside `paint` auto-tracks, so the
 * highlight moves for free when a signal it reads changes. See the module header.
 */
export function DotIndicator(props: DotIndicatorProps): Content {
	const count = props.count;
	const width = props.width ?? 96;
	const height = props.height ?? 12;
	const on = props.on ?? "white";
	const off = props.off ?? "#606060";
	const radius = props.radius ?? 3;
	const active = props.active;
	// Evenly space `count` dots: each occupies a 1/count slot, centered in it.
	const step = count > 0 ? width / count : 0;
	const cy = height / 2;
	return Canvas({
		width,
		height,
		paint: (g) => {
			if (count <= 0) return;
			const raw = typeof active === "function" ? active() : active;
			// clamp the highlighted index into range so an out-of-bounds value
			// (e.g. a wrapped page counter) still lights exactly one dot.
			const hot = raw < 0 ? 0 : raw > count - 1 ? count - 1 : raw;
			for (let i = 0; i < count; i++) {
				const cx = step * (i + 0.5);
				if (i === hot) g.fillCircle(cx, cy, radius + 1, on);
				else g.fillCircle(cx, cy, radius, off);
			}
		},
	});
}
