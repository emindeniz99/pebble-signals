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
// gotcha 16: a width-less/duplicated port is a measured cliff).
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
		text(str, style, color, x, y) {
			if (!drawing) return;
			(
				port as unknown as {
					drawString(
						s: string,
						st: Style,
						c: Color,
						x: number,
						y: number,
						w: number,
						h: number,
					): void;
				}
			).drawString(str, style, color, x, y, w, h);
		},
	};

	const dict: Record<string, unknown> = { width: w, height: h };
	if (props.left !== undefined) dict.left = props.left;
	if (props.right !== undefined) dict.right = props.right;
	if (props.top !== undefined) dict.top = props.top;
	if (props.bottom !== undefined) dict.bottom = props.bottom;
	dict.behavior = {
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

	// ONE effect: re-run paint in the (non-drawing) tracking pass to subscribe,
	// then schedule the repaint. Runs on mount (paints the first frame) and on
	// every dependency change. invalidate() is safe here — outside onDraw.
	effect(() => {
		paint(g);
		node.invalidate();
	});

	return node;
}
