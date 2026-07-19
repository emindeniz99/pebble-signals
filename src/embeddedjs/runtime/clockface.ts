// An analog clock face — the opt-in `runtime/clockface` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/clockface` never ships
// it (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): a ClockFace is just a square
// `runtime/draw` Canvas that paints 12 hour ticks around the rim plus an
// hour/minute (and optional second) hand as `g.line` segments radiating from the
// center. It owns no Port, no effect, and no reactivity of its own — it inherits
// ALL of that from Canvas (each `line`/tick reduces to `fillColor` scanline
// spans — see draw.ts's substrate note). The dial background is Canvas's own
// `fill` (Piu does NOT auto-clear a Port, so an opaque `face` keeps the previous
// frame's hands from smearing). There is NO module-scope host object (no
// `new Style/Skin` — badge.ts's blank-on-device lesson), so nothing to lazily
// construct here.
//
// REACTIVITY IS FREE (mirrors badge.ts / draw.ts): `hours`/`minutes`/`seconds`
// may each be a thunk. Canvas re-runs `paint` in a non-drawing tracking pass on
// every reactive change, so a `minutes()` read inside `paint` auto-subscribes —
// the face repaints when the signal it reads changes. No bind path, no manual
// invalidate.
//
// ANGLES: 12 o'clock is straight up. A clock sweeps CLOCKWISE, which on the
// screen's y-down axis is exactly what `cx + len·cos(rad)`, `cy + len·sin(rad)`
// produces once you offset the angle by −90° (rotating 3 o'clock back to 12).
// So hour hand = ((h%12)+m/60)/12·360 − 90, minute = m/60·360 − 90, second =
// s/60·360 − 90; the hour hand is short, the minute hand longer, the second hand
// longest and thin.
import { Canvas } from "runtime/draw";
import type { Color, Content } from "../../../types/moddable/piu/MC-types";

const DEG = Math.PI / 180;

/** Props for {@link ClockFace}. */
export type ClockFaceProps = {
	/** Hour (0–23; `%12` is applied). A thunk (`() => h`) makes the face reactive; a bare number is static. */
	hours: number | (() => number);
	/** Minute (0–59). A thunk makes the face reactive; a bare number is static. */
	minutes: number | (() => number);
	/** Optional second (0–59). When present, a thin second hand is drawn. A thunk is reactive. */
	seconds?: number | (() => number);
	/** Face diameter in px. Defaults to 144. */
	size?: number;
	/** Dial background color. Defaults to `"black"`. */
	face?: Color;
	/** Hour + minute hand color. Defaults to `"white"`. */
	hand?: Color;
	/** Second hand color. Defaults to `"#e01818"`. */
	second?: Color;
	/** Hour-tick color. Defaults to `"#606060"`. */
	ticks?: Color;
};

/**
 * ClockFace — a reactive analog clock (hour/minute[/second] hands + hour ticks)
 * on ONE Piu Port.
 *
 *   const [m] = useState(30);
 *   <ClockFace hours={10} minutes={m} />            // reactive: repaints when m changes
 *   <ClockFace hours={3} minutes={15} seconds={45} /> // static, with a second hand
 *
 * Composes {@link Canvas}: the `hours`/`minutes`/`seconds` reads inside `paint`
 * auto-track, so the face repaints for free when a signal it reads changes.
 * Omitting `seconds` draws no second hand. See the module header for the angle
 * contract.
 */
export function ClockFace(props: ClockFaceProps): Content {
	const size = props.size ?? 144;
	const face = props.face ?? "black";
	const hand = props.hand ?? "white";
	const second = props.second ?? "#e01818";
	const ticks = props.ticks ?? "#606060";
	const { hours, minutes, seconds } = props;

	const c = size / 2;
	const rim = c - 2; // outer end of the ticks, just inside the edge
	const tickInner = c - 8; // inner end — a ~6px tick mark
	const hourLen = c * 0.5;
	const minuteLen = c * 0.72;
	const secondLen = c * 0.82;

	// endpoint of a hand of length `len` at `deg` (0 = 12 o'clock, clockwise)
	const ex = (deg: number, len: number): number => c + len * Math.cos((deg - 90) * DEG);
	const ey = (deg: number, len: number): number => c + len * Math.sin((deg - 90) * DEG);

	return Canvas({
		width: size,
		height: size,
		fill: face,
		paint: (g) => {
			// 12 hour ticks around the rim (offset is irrelevant on a full ring).
			for (let i = 0; i < 12; i++) {
				const deg = i * 30;
				g.line(ex(deg, tickInner), ey(deg, tickInner), ex(deg, rim), ey(deg, rim), 2, ticks);
			}
			const h = typeof hours === "function" ? hours() : hours;
			const m = typeof minutes === "function" ? minutes() : minutes;
			// hour hand: short, thick — smoothly advanced by the minute.
			const hDeg = (((h % 12) + m / 60) / 12) * 360;
			g.line(c, c, ex(hDeg, hourLen), ey(hDeg, hourLen), 3, hand);
			// minute hand: longer, medium.
			const mDeg = (m / 60) * 360;
			g.line(c, c, ex(mDeg, minuteLen), ey(mDeg, minuteLen), 2, hand);
			// optional second hand: longest, thin.
			if (seconds !== undefined) {
				const s = typeof seconds === "function" ? seconds() : seconds;
				const sDeg = (s / 60) * 360;
				g.line(c, c, ex(sDeg, secondLen), ey(sDeg, secondLen), 1, second);
			}
		},
	});
}
