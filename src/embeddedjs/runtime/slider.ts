// A reactive value Slider — the opt-in `runtime/slider` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/slider` never ships
// it (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Slider is a horizontal
// `runtime/draw` Canvas that paints TWO shapes — a thin rounded pill TRACK
// (fillRoundRect, centered vertically) and a filled circle THUMB (fillCircle)
// positioned along that track by the mapped value. It owns no Port, no effect,
// and no reactivity of its own — it inherits ALL of that from Canvas. There is
// no text, so (unlike Badge) it needs no Style at all — nothing to construct
// lazily, nothing to freeze in the preload compartment.
//
// DISPLAY-ONLY (unit brief Rule 4): the Slider does NOT own the value or react
// to touch — the APP drives it (a signal moved by buttons). The widget just
// RENDERS the current value. Reactivity is free: `value` may be a thunk, and
// reading it INSIDE `paint` auto-subscribes, so the thumb moves whenever the
// signal it reads changes (value change → Canvas effect → invalidate →
// repaint). No bind path, no manual invalidate.
//
// MAPPING: value in [min,max] maps to t in [0,1] (t=0 when max===min — no
// divide-by-zero), clamped so an out-of-range value pins the thumb to an end.
// The thumb center then rides from `r` (left) to `width-r` (right) and is
// clamped within [r, width-r] so it never spills past the track ends.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link Slider}. */
export type SliderProps = {
	/** The value to display. A thunk (`() => v`) makes the slider reactive; a bare number is static. */
	value: number | (() => number);
	/** Low end of the value range. Defaults to 0. */
	min?: number;
	/** High end of the value range. Defaults to 1. */
	max?: number;
	/** Track width in px. Defaults to 100. */
	width?: number;
	/** Track height (and thumb diameter) in px. Defaults to 24. */
	height?: number;
	/** Track fill color. Defaults to `"#555555"`. */
	track?: Color;
	/** Thumb fill color. Defaults to `"white"`. */
	thumb?: Color;
};

/**
 * Slider — a reactive horizontal track with a thumb marking a value, on ONE
 * Piu Port.
 *
 *   const [v, setV] = useState(0.5);
 *   <Slider value={v} />                    // reactive: thumb follows v
 *   <Slider value={30} min={0} max={100} /> // static
 *
 * Composes {@link Canvas}: the `value` read inside `paint` auto-tracks, so the
 * thumb repaints for free when a signal it reads changes. See the module header.
 */
export function Slider(props: SliderProps): Content {
	const value = props.value;
	const min = props.min ?? 0;
	const max = props.max ?? 1;
	const width = props.width ?? 100;
	const height = props.height ?? 24;
	const track = props.track ?? "#555555";
	const thumb = props.thumb ?? "white";

	const r = height / 2; // thumb radius = half the track height (full-height disc)
	const cy = height / 2; // vertical center of both track and thumb
	const trackH = Math.max(2, Math.round(height / 6)); // thin pill behind the thumb
	const trackY = (height - trackH) / 2;

	return Canvas({
		width,
		height,
		paint: (g) => {
			const v = typeof value === "function" ? value() : value;
			// map [min,max] → [0,1]; max===min avoids a divide-by-zero (t=0).
			const range = max - min;
			const raw = range > 0 ? (v - min) / range : 0;
			const t = raw < 0 ? 0 : raw > 1 ? 1 : raw; // clamp out-of-range to an end
			// thumb center rides [r, width-r]; clamp defensively within the track.
			const thumbX = Math.max(r, Math.min(width - r, r + t * (width - 2 * r)));
			g.fillRoundRect(0, trackY, width, trackH, trackH / 2, track);
			g.fillCircle(thumbX, cy, r, thumb);
		},
	});
}
