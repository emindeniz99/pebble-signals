// A mini line chart from an array of numbers — the opt-in `runtime/sparkline`
// module. OPT-IN & ZERO-COST: an app that never imports `runtime/sparkline`
// never ships it (the manifest prunes to the import closure — README
// tree-shaking), so this module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Sparkline is just a `runtime/draw`
// Canvas that connects consecutive data points with `g.line`. It owns no Port,
// no effect, and no reactivity of its own — it inherits ALL of that from Canvas
// (each `line` reduces to `fillColor` scanline spans — see draw.ts's substrate
// note). There is NO module-scope host object (no `new Style/Skin` — badge.ts's
// blank-on-device lesson), so nothing to lazily construct here.
//
// REACTIVITY IS FREE (mirrors badge.ts): `data` may be a thunk. Canvas re-runs
// `paint` in a non-drawing tracking pass on every reactive change, so a `data()`
// read inside `paint` auto-subscribes — the chart repaints when the signal it
// reads changes. No bind path, no manual invalidate.
//
// MAPPING: point i maps to x = i/(n-1)·width and y = height − (v−min)/(max−min)·
// height, so the largest value sits at the TOP (y=0) and the smallest at the
// BOTTOM (y=height), matching the screen's y-down axis. GUARDS (Rule 7): an
// empty or single-point array draws nothing (a segment needs two points, and
// x's divisor n−1 would be 0); an all-equal array (max===min) would divide by
// zero, so it falls back to a flat mid-line at y=height/2.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link Sparkline}. */
export type SparklineProps = {
	/** The series to plot. A thunk (`() => number[]`) makes the chart reactive; a bare array is static. */
	data: number[] | (() => number[]);
	/** Chart width in px. Defaults to 144. */
	width?: number;
	/** Chart height in px. Defaults to 48. */
	height?: number;
	/** Line color. Defaults to `"#00c0ff"`. */
	color?: Color;
	/** Line thickness in px. Defaults to 1. */
	thickness?: number;
};

/**
 * Sparkline — a reactive mini line chart on ONE Piu Port.
 *
 *   const [xs] = useState([3, 1, 4, 1, 5]);
 *   <Sparkline data={xs} />                       // reactive: repaints when xs changes
 *   <Sparkline data={[1, 2, 3]} color="lime" />   // static
 *
 * Composes {@link Canvas}: the `data` read inside `paint` auto-tracks, so the
 * chart repaints for free when a signal it reads changes. See the module header
 * for the mapping + edge-case contract.
 */
export function Sparkline(props: SparklineProps): Content {
	const width = props.width ?? 144;
	const height = props.height ?? 48;
	const color = props.color ?? "#00c0ff";
	const thickness = props.thickness ?? 1;
	const data = props.data;
	return Canvas({
		width,
		height,
		paint: (g) => {
			const pts = typeof data === "function" ? data() : data;
			const n = pts.length;
			// A segment needs two points; fewer than two also makes x's divisor
			// (n−1) zero, so draw nothing.
			if (n < 2) return;
			let min = pts[0];
			let max = pts[0];
			for (let i = 1; i < n; i++) {
				const v = pts[i];
				if (v < min) min = v;
				if (v > max) max = v;
			}
			const range = max - min;
			// range === 0 (all-equal): flat mid-line, avoiding a divide-by-zero.
			const yOf = (v: number): number =>
				range === 0 ? height / 2 : height - ((v - min) / range) * height;
			const dx = width / (n - 1);
			let x0 = 0;
			let y0 = yOf(pts[0]);
			for (let i = 1; i < n; i++) {
				const x1 = i * dx;
				const y1 = yOf(pts[i]);
				g.line(x0, y0, x1, y1, thickness, color);
				x0 = x1;
				y0 = y1;
			}
		},
	});
}
