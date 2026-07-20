// An animated LOADING spinner — the opt-in `runtime/spinner` module (React
// Native's ActivityIndicator analog). OPT-IN & ZERO-COST: an app that never
// imports `runtime/spinner` never ships it (the manifest prunes to the import
// closure — README tree-shaking), so this module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a Spinner is a square `runtime/draw`
// Canvas that paints an optional faint full-ring `trackColor` arc (0..360)
// behind ONE moving ring SEGMENT — `g.arc(c, c, r, angle, angle + sweepDeg,
// thickness, color)` — rotating around the center. Both are the JS-rasterized
// `arc` ring segment (there is no native arc on the Piu Port — see draw.ts's
// substrate note): angles are DEGREES, 0 = the +x axis (3 o'clock), increasing
// CLOCKWISE. `c = size/2` (center) and `r = size/2 - thickness` (outer band
// radius, inset by one thickness so the ring clears the canvas edge).
//
// OWNS ITS ANIMATION (the display-only EXCEPTION — Rule 8): unlike Gauge / Dots
// / ProgressBar (each takes a `value` the app drives), a loader's whole job is
// to spin by itself. So a Spinner holds an INTERNAL `angle` signal and a
// setInterval that advances it ~30fps (STEP=33 — flow.ts's cadence) by
// `360 * STEP / periodMs` degrees per tick, wrapping modulo 360. `angle` is read
// inside `paint`, so the Canvas effect auto-subscribes and repaints the rotated
// segment for FREE on every tick — no bind path, no manual invalidate (mirrors
// gauge.ts / draw.ts).
//
// TIMER DISCIPLINE (Rule 5 — mirrors flow.ts's ticker exactly): the timer id is
// created LAZILY at runtime, NEVER at module scope (a preloaded module's
// top-level timer state freezes into ROM and dies on first write — flow.ts's
// `ticker` lesson). One-shot vs interval is moot here — this is a real
// repeating interval — but the OTHER disciplines hold: `track(stopTimer)`
// registers the clear so the interval STOPS when the owning screen disposes (no
// leaked timer on navigate-away), and `startTimer`/`stopTimer` dedupe on the
// single live id so no path ever stacks or double-clears a timer. If `running`
// is a thunk, ONE effect starts/stops the interval as `running()` flips (clear
// when false, (re)start when true); a bare `running:false` never starts; the
// default (`true`) starts immediately.
//
// NO host object at MODULE SCOPE (badge.ts's blank-screen lesson) and NO FONTS
// (Rule 4 N/A — the spinner draws no text): this module constructs nothing at
// top level (only a plain `STEP` number, safe in ROM) and returns a Canvas per
// call, so there is nothing to freeze into a broken preload instance.
import { signal, effect, track } from "runtime/signals";
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

// ~30fps — flow.ts's shared-ticker cadence. A plain number is safe at module
// scope; only the TIMER STATE (the interval id) is created lazily per call.
const STEP = 33;

/** Props for {@link Spinner}. */
export type SpinnerProps = {
	/** Diameter of the (square) canvas in px. Defaults to 48. */
	size?: number;
	/** Moving-segment color. Defaults to `"#1560bd"`. */
	color?: Color;
	/** Optional faint full-ring drawn behind the segment. Omitted = no track ring. */
	trackColor?: Color;
	/** Ring-band thickness in px, grown inward from the edge. Defaults to 4. */
	thickness?: number;
	/** Arc length of the moving segment, in degrees. Defaults to 90. */
	sweepDeg?: number;
	/** Full-rotation period in ms (clamped to ≥1). Defaults to 1000. */
	periodMs?: number;
	/**
	 * Whether the spinner animates. A thunk (`() => b`) freezes/resumes it
	 * reactively; a bare `false` freezes it at angle 0 (never starts a timer).
	 * Defaults to `true` (starts immediately).
	 */
	running?: boolean | (() => boolean);
};

/**
 * Spinner — an animated indeterminate loading indicator on ONE Piu Port.
 *
 *   <Spinner />                                   // 48px, spins immediately
 *   <Spinner size={64} trackColor="#202020" />    // with a faint track ring
 *   const [busy] = useState(true);
 *   <Spinner running={busy} />                     // reactive: freezes when false
 *
 * Composes {@link Canvas}: an INTERNAL `angle` signal, advanced by a lazily
 * created ~30fps `setInterval`, is read inside `paint`, so the Canvas effect
 * auto-tracks and rotates the arc segment for free. Unlike the display-only
 * widgets, a Spinner OWNS its animation (a loader animates itself); the timer
 * stops on owner dispose via {@link track}, and a thunk `running` starts/stops
 * it reactively. See the module header for the full contract.
 */
export function Spinner(props: SpinnerProps): Content {
	const size = props.size ?? 48;
	const color = props.color ?? "#1560bd";
	const trackColor = props.trackColor;
	const thickness = props.thickness ?? 4;
	const sweepDeg = props.sweepDeg ?? 90;
	// Clamp the period to ≥1 like flow.ts's `ms > 0 ? ms : 1`: a 0/negative period
	// makes `advance` Infinity → NaN angles → a silently BLANK spinner (the exact
	// failure class this project fights). A ≥1 floor keeps a valid frame instead.
	const periodMs = props.periodMs ?? 1000;
	const period = periodMs > 0 ? periodMs : 1;
	const running = props.running ?? true;

	// Internal state (Rule 8 — the spinner OWNS its angle): `angle` is read inside
	// paint so the Canvas effect auto-tracks it. `advance` = degrees per ~30fps tick.
	const angle = signal(0);
	const advance = (360 * STEP) / period;

	// LAZY timer state (Rule 5 — NEVER module scope): `id` is undefined while
	// stopped; `acc` is the running angle total (mirrors flow.ts tickAll's
	// `elapsed` accumulator, and persists across stop→start so a paused spinner
	// resumes where it froze rather than snapping back to 0).
	let id: number | undefined;
	let acc = 0;
	const startTimer = (): void => {
		if (id !== undefined) return; // single live id — never stack a second timer
		id = setInterval(() => {
			acc = (acc + advance) % 360; // advance + wrap modulo 360
			angle.value = acc; // notifies the Canvas effect → invalidate → repaint
		}, STEP);
	};
	const stopTimer = (): void => {
		if (id !== undefined) {
			clearInterval(id);
			id = undefined;
		}
	};
	// Stop the interval when the owning screen disposes (mirrors flow.ts's
	// `track(stop)` — no leaked timer on navigate-away). stopTimer is idempotent.
	track(stopTimer);

	// `running` as a THUNK → ONE effect starts/stops as `running()` flips (its
	// signal reads auto-subscribe; start/stop dedupe on the single id so a benign
	// re-run never stacks a timer). A bare `true` starts now; a bare `false`
	// never starts (stays frozen at angle 0).
	if (typeof running === "function") {
		effect(() => {
			if (running()) startTimer();
			else stopTimer();
		});
	} else if (running) {
		startTimer();
	}

	const c = size / 2; // center x === center y (a square canvas)
	const r = size / 2 - thickness; // outer band radius, one thickness inside the edge
	return Canvas({
		width: size,
		height: size,
		paint: (g) => {
			// optional faint full ring behind the segment
			if (trackColor !== undefined) g.arc(c, c, r, 0, 360, thickness, trackColor);
			// the moving segment — reading `angle.value` here auto-subscribes the
			// Canvas effect, so each tick's write repaints the rotated arc.
			const a = angle.value;
			g.arc(c, c, r, a, a + sweepDeg, thickness, color);
		},
	});
}
