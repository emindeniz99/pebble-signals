// Immediate-mode drawing on ONE Piu Port — the opt-in `runtime/draw` module.
// OPT-IN & ZERO-COST: an app that never imports `runtime/draw` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing.
//
// SUBSTRATE (measured, `drawprobe` on gabbro — screenshots/drawprobe-gabbro.png,
// Rule 2): the Piu Port `onDraw` context exposes ONLY `fillColor` +
// draw{String,Texture,Skin,Content}. There is NO native `drawCircle`/`drawLine`/
// `drawRoundRect` on the port. So every shape here is JS-RASTERIZED into
// horizontal `fillColor(color, x, y, w, 1)` scanline spans — CPU for RAM, the
// house trade (Rule 4). ONE Port paints MANY shapes (never one Port per shape —
// gotcha 16: a width-less/duplicated port is a measured cliff). Every primitive
// — fillRect, fillCircle/strokeCircle, line, fillRoundRect, strokeRect — reduces
// to those same spans: axis-aligned lines are ONE crisp centered span, diagonals
// DDA a t×t block per step, and round-rect corners reuse the fillCircle isqrt
// scanline (no native round-rect/line on the port either).
//
// REACTIVITY (mirrors the Move idiom, flow.ts, and port.tsx:101): draw props do
// NOT go through the jsx bind path (createHost rejects non-REACTIVE_PROPS keys).
// Instead `Canvas` owns ONE `effect` that re-runs the caller's `paint` callback
// in a NON-drawing tracking pass — the signal reads happen while evaluating the
// arguments to `g.fillCircle(cx(), cy(), …)`, so the effect subscribes to
// exactly what the frame reads — then calls `port.invalidate()` to schedule the
// real repaint. `invalidate()` MUST run OUTSIDE `onDraw` (view is null there;
// inside, the firmware throws "out of sequence"), which is where the effect
// runs. The effect registers under the running owner, so it disposes with the
// screen (no leak on navigate-away).
import { effect } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type { Color, Content, Style } from "../../../types/moddable/piu/MC-types";

// A Port's dictionary/instance are typed loosely by the vendored stubs (the
// constructor returns `Content` and has no `fillColor`/`invalidate` on the
// public leaf type); this is the one dynamic Piu boundary, same `any` hop the
// examples take at `new Port(null, {…})`.
type RawPort = {
	fillColor(color: Color, x: number, y: number, w: number, h: number): void;
	invalidate(): void;
};

/**
 * The immediate-mode drawing surface handed to a {@link CanvasProps.paint}
 * callback. Every method rasterizes into `fillColor` spans on the owning Port.
 * Coordinates are Port-local (0,0 = top-left of the canvas). Colors are Piu
 * colors: a name (`"red"`), `#rgb`/`#rrggbb[aa]`, or a `0xRRGGBBAA` number.
 */
export type DrawContext = {
	/** Fill an axis-aligned rectangle. Negative width/height are clamped to 0. */
	fillRect(x: number, y: number, w: number, h: number, color: Color): void;
	/** Fill a solid disc of radius `r` centered at (`cx`,`cy`). r ≤ 0 draws nothing. */
	fillCircle(cx: number, cy: number, r: number, color: Color): void;
	/**
	 * Stroke a circle outline of radius `r`, `thickness` pixels wide (default 1),
	 * grown INWARD from `r`. Rasterized as the difference of two discs.
	 */
	strokeCircle(cx: number, cy: number, r: number, color: Color, thickness?: number): void;
	/**
	 * Draw a straight line from (`x0`,`y0`) to (`x1`,`y1`), `thickness` px wide
	 * (`thickness` ≤ 0 clamps to 1). Axis-aligned lines are ONE crisp span
	 * centered on the fixed coordinate; diagonals step via DDA along the major
	 * axis, stamping a `t`×`t` block per step.
	 */
	line(x0: number, y0: number, x1: number, y1: number, thickness: number, color: Color): void;
	/**
	 * Fill a rectangle with radius-`r` rounded corners. `r` clamps to
	 * `min(r, w>>1, h>>1)`; `r` ≤ 0 falls back to a single fillRect. The middle
	 * band is one full-width span; the top-`r`/bottom-`r` rows inset each end by
	 * the corner circle profile (the fillCircle isqrt scanline) — no gaps.
	 */
	fillRoundRect(x: number, y: number, w: number, h: number, r: number, color: Color): void;
	/**
	 * Stroke a rectangle outline as its 4 edges, each `thickness` px wide
	 * (`thickness` ≤ 0 clamps to 1). Corners are double-painted (overlap is fine).
	 */
	strokeRect(x: number, y: number, w: number, h: number, thickness: number, color: Color): void;
	/** Draw a text string at (`x`,`y`) in `style`/`color` (passthrough to drawString). */
	text(str: string, style: Style, color: Color, x: number, y: number): void;
};

/** Props for {@link Canvas}. */
export type CanvasProps = {
	/** Surface width in px. Defaults to the screen width (a width-less port measures 0 — gotcha 16). */
	width?: number;
	/** Surface height in px. Defaults to the screen height. */
	height?: number;
	left?: number;
	right?: number;
	top?: number;
	bottom?: number;
	/**
	 * Optional background color painted before every frame. Piu does NOT
	 * auto-clear a Port between repaints, so without this the surface keeps the
	 * previous frame's pixels — pass a `fill` for an opaque canvas.
	 */
	fill?: Color;
	/**
	 * The frame painter. Called once per repaint with a {@link DrawContext}.
	 * MUST be pure — it runs a second, non-drawing time each reactive change to
	 * collect dependencies (read your signals in here / in the args you pass to
	 * `g.*`, and the canvas repaints when they change).
	 */
	paint: (g: DrawContext) => void;
};

const isqrt = (n: number): number => (n <= 0 ? 0 : Math.floor(Math.sqrt(n)));

/**
 * Canvas — a reactive immediate-mode drawing surface on ONE Piu Port.
 *
 *   const cx = useState(64)[0];
 *   <Canvas width={128} height={128} fill="black"
 *     paint={(g) => g.fillCircle(cx(), 64, 20, "red")} />
 *
 * The circle follows `cx()` because `paint`'s reads are auto-tracked. See the
 * module header for the substrate + reactivity contract.
 */
export function Canvas(props: CanvasProps): Content {
	const w = props.width ?? screen.width;
	const h = props.height ?? screen.height;
	const paint = props.paint;
	const bg = props.fill;

	// `drawing` gates the rasterizers: true only inside onDraw (view live). The
	// effect calls paint with it false — methods no-op, but the ARGUMENTS were
	// already evaluated by the caller, so every signal the frame reads is
	// tracked. One shared context object (no per-frame allocation).
	let drawing = false;
	let port: RawPort;
	const g: DrawContext = {
		fillRect(x, y, rw, rh, color) {
			if (!drawing || rw <= 0 || rh <= 0) return;
			port.fillColor(color, x, y, rw, rh);
		},
		fillCircle(cx, cy, r, color) {
			if (!drawing || r <= 0) return;
			const r2 = r * r;
			for (let dy = -r; dy <= r; dy++) {
				const dx = isqrt(r2 - dy * dy);
				port.fillColor(color, cx - dx, cy + dy, 2 * dx + 1, 1);
			}
		},
		strokeCircle(cx, cy, r, color, thickness) {
			if (!drawing || r <= 0) return;
			const t = thickness && thickness > 0 ? thickness : 1;
			const inner = r - t; // inside this radius stays untouched
			const r2 = r * r;
			const i2 = inner > 0 ? inner * inner : -1;
			for (let dy = -r; dy <= r; dy++) {
				const yy = dy * dy;
				const dx = isqrt(r2 - yy);
				if (dx <= 0) continue;
				// inner half-width at this row (0 when the row misses the hole)
				const idx = inner > 0 && yy <= i2 ? isqrt(i2 - yy) : 0;
				if (idx <= 0) {
					// solid span — this row is entirely within the ring band
					port.fillColor(color, cx - dx, cy + dy, 2 * dx + 1, 1);
				} else {
					// two side spans, leaving the hole [cx-idx .. cx+idx] clear
					port.fillColor(color, cx - dx, cy + dy, dx - idx, 1);
					port.fillColor(color, cx + idx + 1, cy + dy, dx - idx, 1);
				}
			}
		},
		line(x0, y0, x1, y1, thickness, color) {
			if (!drawing) return;
			const t = thickness > 0 ? Math.round(thickness) : 1;
			const half = t >> 1;
			if (y0 === y1) {
				// crisp horizontal: ONE span, full length × t, centered on y
				const lx = x0 < x1 ? x0 : x1;
				port.fillColor(color, lx, y0 - half, Math.abs(x1 - x0) + 1, t);
				return;
			}
			if (x0 === x1) {
				// crisp vertical: ONE span, t × full length, centered on x
				const ly = y0 < y1 ? y0 : y1;
				port.fillColor(color, x0 - half, ly, t, Math.abs(y1 - y0) + 1);
				return;
			}
			// DDA along the major axis; stamp a t×t block centered at each step
			const dx = x1 - x0;
			const dy = y1 - y0;
			const steps = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
			const xInc = dx / steps;
			const yInc = dy / steps;
			let fx = x0;
			let fy = y0;
			for (let i = 0; i <= steps; i++) {
				port.fillColor(color, Math.round(fx) - half, Math.round(fy) - half, t, t);
				fx += xInc;
				fy += yInc;
			}
		},
		fillRoundRect(x, y, w, h, r, color) {
			if (!drawing) return;
			const rr = Math.min(r, w >> 1, h >> 1);
			if (rr <= 0) {
				// no corner to carve — a plain rectangle in one span
				port.fillColor(color, x, y, w, h);
				return;
			}
			const r2 = rr * rr;
			// top-r rows: inset each end by the corner circle's half-width
			for (let dy = -rr; dy < 0; dy++) {
				const dxi = isqrt(r2 - dy * dy);
				const rowW = w - 2 * rr + 2 * dxi;
				if (rowW > 0) port.fillColor(color, x + rr - dxi, y + rr + dy, rowW, 1);
			}
			// middle band (between the corner arcs): one full-width span
			const midH = h - 2 * rr;
			if (midH > 0) port.fillColor(color, x, y + rr, w, midH);
			// bottom-r rows: mirror of the top band
			for (let dy = 1; dy <= rr; dy++) {
				const dxi = isqrt(r2 - dy * dy);
				const rowW = w - 2 * rr + 2 * dxi;
				if (rowW > 0) port.fillColor(color, x + rr - dxi, y + h - 1 - rr + dy, rowW, 1);
			}
		},
		strokeRect(x, y, w, h, thickness, color) {
			if (!drawing) return;
			const t = thickness > 0 ? Math.round(thickness) : 1;
			port.fillColor(color, x, y, w, t); // top edge
			port.fillColor(color, x, y + h - t, w, t); // bottom edge
			port.fillColor(color, x, y, t, h); // left edge
			port.fillColor(color, x + w - t, y, t, h); // right edge
		},
		text(str, style, color, x, y) {
			if (!drawing) return;
			// FIVE args only (str, style, color, x, y) — the device-proven call
			// shape (examples/port.tsx). Passing a 6th `width` sends the firmware
			// down its field-alignment path (PiuFontGetWidth) and the whole
			// onDraw frame throws → the port paints BLANK (measured: adding a
			// 7-arg drawString erased an otherwise-working circle).
			(
				port as unknown as {
					drawString(s: string, st: Style, c: Color, x: number, y: number): void;
				}
			).drawString(str, style, color, x, y);
		},
	};

	const dict: Record<string, unknown> = { width: w, height: h };
	if (props.left !== undefined) dict.left = props.left;
	if (props.right !== undefined) dict.right = props.right;
	if (props.top !== undefined) dict.top = props.top;
	if (props.bottom !== undefined) dict.bottom = props.bottom;
	dict.behavior = {
		// onDisplaying fires ONCE, when the port joins the display tree — the
		// first moment invalidate() actually marks anything dirty. The effect's
		// mount-time invalidate below runs during BUILD, before the port is
		// attached, so Piu drops it; without this hook a static Canvas (or one
		// whose signals never change) would never paint its first frame (measured:
		// "Pixels drawn: 0"). view is null here, so invalidate() is in-sequence.
		onDisplaying(p: RawPort) {
			p.invalidate();
		},
		onDraw(p: RawPort) {
			port = p; // p === our port, but with the draw view live
			drawing = true;
			if (bg !== undefined) p.fillColor(bg, 0, 0, w, h);
			paint(g);
			drawing = false;
		},
	};
	const node = new Port(null, dict as ConstructorParameters<typeof Port>[1]) as unknown as RawPort &
		Content;
	port = node;

	// ONE effect: re-run paint in the (non-drawing) tracking pass to SUBSCRIBE
	// to the signals the frame reads, then schedule a repaint. The first run is
	// at mount (its invalidate is dropped — the port isn't attached yet; the
	// onDisplaying hook above owns the first paint); every later dependency
	// change re-runs it and the invalidate lands. Safe here — outside onDraw.
	effect(() => {
		paint(g);
		node.invalidate();
	});

	return node;
}
