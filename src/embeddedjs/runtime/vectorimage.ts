// A resolution-independent PDC VECTOR image — the opt-in `runtime/vectorimage`
// module. OPT-IN & ZERO-COST: an app that never imports `runtime/vectorimage`
// never ships it (the manifest prunes to the import closure — README
// tree-shaking), so this module costs non-users nothing.
//
// SUBSTRATE (the host `SVGImage` class — Pebble Draw Command / PDC vector art):
// a ~600B flat-vector `.pdc` renders at ANY scale for free, with ZERO pixel RAM —
// versus a raster sheet's KBs plus a native-heap decode. `new SVGImage(null,
// { path, width, height })` builds the node; width/height are the SCALED display
// box (a 60px viewbox drawn at 2x needs a 120px box, or the 2x drawing spills the
// content bounds — slothvec's note). The node, its behavior and its effect are
// ALL built INSIDE the exported function at call time (Rule 1 — a preloaded
// module's top-level `new SVGImage`/timer/mutable object freezes into a broken
// ROM instance and dies on first use).
//
// THE FOUR HARD SVGImage-TRANSFORM RULES ON THIS PORT — device-proven at app
// level by src/tsx/examples/slothvec.tsx (the "invisible circle" saga, project
// CLAUDE.md Rule 1; every official Pebble example applies transforms POST-mount):
//  (a) transforms MUST be applied AFTER the node is mounted — `PiuSVGImageBind`
//      overwrites cx/cy at bind time (clobbering anything set during build), AND
//      the image does NOT draw at all until SOME transform has been applied. So
//      this module applies the INITIAL transforms in a Piu `onDisplaying`
//      behavior hook (fires exactly once, when the node first joins the display
//      tree — the clean post-mount moment, mirroring runtime/draw.ts's Canvas)
//      and FORCES at least scale(1,1) so a transform-less VectorImage still draws.
//  (b) center(cx,cy) is REQUIRED — `doTransform` subtracts cx*8 from every point
//      (1/8-px units), so the DEFAULT center (0,0 here) keeps whole-pixel art on
//      screen; an unset center displaces it off-screen (the invisible-circle
//      bug). translate(tx,ty) DEFAULTS to the same center point: screen x =
//      content + cx + s(x-cx) + tx, so centering and translating by the pivot
//      keeps scaled art in place (slothvec pivots at the branch grip 30,7).
//  (c) scale() multiplies path POINTS + stroke widths but NOT circle radii —
//      scalable art must be all paths/polygons; this module only APPLIES the
//      transform, the `.pdc` authoring owns that constraint.
//  (d) rotate() is ABSOLUTE, not cumulative — each apply SETS the angle (radians),
//      so a `() => 0.12 * Math.sin(phase)` thunk swings back and forth rather than
//      spinning ever faster.
//
// REACTIVITY (idiom 5b — a hand-built node + ONE driving effect, like Move /
// Canvas): `scale` and `rotate` each accept a bare NUMBER (CONSTANT — applied
// once by onDisplaying, no effect, no signal, zero cost) or a THUNK (REACTIVE).
// When EITHER is a thunk, ONE effect reads it (auto-subscribing to the signals
// inside) and RE-APPLIES the reactive transform(s) on every change. That effect
// is GUARDED by a `mounted` flag onDisplaying sets: its first (build-time) run
// SUBSCRIBES but applies NOTHING — transforming before the mount hook has run
// would hit rule (a)'s bind clobber. `center`/`translate` are STATIC `[x,y]`
// tuples: position is construction-time on this port (a reactive coordinate write
// THROWS via jsx-runtime's bindErr), and a fixed pivot is all a vector image
// needs. The effect registers under the running owner and disposes with the
// screen (no leaked re-applies on navigate-away).
//
// NO MODULE SCOPE (Rule 1 / gotcha 13): this module constructs NOTHING at top
// level, and the one export is a `function` declaration exactly like flow.ts's
// Move / draw.ts's Canvas.
import { effect } from "runtime/signals";
import type { Content } from "../../../types/moddable/piu/MC-types";

/** Props for {@link VectorImage}. */
export type VectorImageProps = {
	/**
	 * The PDC resource name — INCLUDE the `.pdc` suffix (`"slothvec.pdc"`). The
	 * build derives the resource from a bare `"name.pdc"` string literal in the
	 * app source, so passing the literal ships the asset automatically.
	 */
	src: string;
	/** Display-box width in px — the SCALED size (a 60px viewbox at 2x = 120). */
	width: number;
	/** Display-box height in px — the SCALED size (see {@link width}). */
	height: number;
	/**
	 * Uniform scale. A bare number is CONSTANT (applied once at mount); a THUNK
	 * (`() => n`) is REACTIVE (re-applied when a signal it reads changes).
	 * Defaults to `1` — the forced scale(1,1) that makes the image draw at all
	 * (rule a). `> 1` enlarges, `< 1` shrinks (path points + strokes, NOT circle
	 * radii — rule c).
	 */
	scale?: number | (() => number);
	/**
	 * Rotation in RADIANS about the center. A bare number is CONSTANT; a THUNK is
	 * REACTIVE. OMITTED = no rotation applied at all (identity). rotate() is
	 * ABSOLUTE (rule d), so a `sin()` thunk swings rather than spins.
	 */
	rotate?: number | (() => number);
	/**
	 * Transform center `[cx,cy]` in viewbox units — the pivot for scale/rotate AND
	 * the point subtracted per rule (b). Defaults to `[0,0]` (REQUIRED there, or
	 * whole-pixel art displaces off screen). STATIC (position is
	 * construction-time on this port).
	 */
	center?: [number, number];
	/**
	 * Screen translation `[tx,ty]` in viewbox units. Defaults to the `center`
	 * point (centering + translating by the pivot keeps scaled art in place —
	 * slothvec pivots at 30,7). STATIC.
	 */
	translate?: [number, number];
};

/**
 * VectorImage — a resolution-independent PDC vector image with post-mount
 * transforms, on ONE host `SVGImage` node (zero pixel RAM).
 *
 *   // static: a 60px viewbox drawn at 2x, pivoted at the branch grip
 *   <VectorImage src="slothvec.pdc" width={120} height={120}
 *     center={[30, 7]} translate={[30, 7]} scale={2} />
 *
 *   // reactive: a slow swing — VectorImage re-applies the rotate thunk on change
 *   const [angle, setAngle] = useState(0);
 *   <VectorImage src="slothvec.pdc" width={120} height={120}
 *     center={[30, 7]} translate={[30, 7]} scale={2} rotate={() => angle()} />
 *
 * `scale`/`rotate` take a bare number (constant) or a thunk (reactive — read a
 * signal inside and it re-applies on change); `center`/`translate` are static
 * `[x,y]` pivot/offset tuples. ALL transforms are applied AFTER mount (in a Piu
 * `onDisplaying` hook) — MANDATORY on this port; see the module header for the
 * four hard SVGImage rules (the invisible-circle saga). Pass the SCALED
 * width/height (a viewbox drawn at 2x needs twice the box). Returns the SVGImage
 * node (a {@link Content}); drop it straight into a Column/Container.
 */
export function VectorImage(props: VectorImageProps): Content {
	const scale = props.scale;
	const rotate = props.rotate;
	// center default (0,0) is REQUIRED (rule b); translate defaults to the center
	// point so scaled art stays put (screen x = content + cx + s(x-cx) + tx).
	const center = props.center;
	const cx = center ? center[0] : 0;
	const cy = center ? center[1] : 0;
	const translate = props.translate;
	const tx = translate ? translate[0] : cx;
	const ty = translate ? translate[1] : cy;
	// A thunk scale/rotate drives the effect (dynScale/dynRotate); a bare number
	// is its own constant, and an absent scale defaults to 1 — the forced
	// scale(1,1) that makes the image draw at all (rule a). `hasRotate` is false
	// only when rotate is omitted, and then NO rotate() is ever applied (identity).
	const dynScale = typeof scale === "function" ? scale : null;
	const dynRotate = typeof rotate === "function" ? rotate : null;
	const baseScale = typeof scale === "number" ? scale : 1;
	const baseRotate = typeof rotate === "number" ? rotate : 0;
	const hasRotate = rotate !== undefined;

	// `mounted` gates the reactive effect: applying a transform before the mount
	// hook has run hits rule (a)'s bind-time cx/cy clobber (the image would not
	// draw). onDisplaying applies the INITIAL transforms in the device-proven
	// order (center → translate → scale → rotate) and flips the flag.
	let mounted = false;
	// Typed against the SVGImage global directly, not Behavior<SVGImage>: the vendored
	// pebble/piu.d.ts does not model SVGImage as a Content subtype, so the Behavior<T
	// extends Content> constraint rejects it — and the behavior lands in a loose dict
	// below anyway, so the wrapper buys nothing.
	const behavior = {
		// onDisplaying fires ONCE, when the node joins the display tree — the first
		// safe post-mount moment (`PiuSVGImageBind` has run). scale is ALWAYS
		// applied (>= the forced 1) so a transform-less image still draws; rotate
		// only when given (an omitted rotate stays identity — rule d).
		onDisplaying(content: SVGImage) {
			content.center(cx, cy);
			content.translate(tx, ty);
			const s = dynScale ? dynScale() : baseScale;
			content.scale(s, s);
			if (hasRotate) content.rotate(dynRotate ? dynRotate() : baseRotate);
			mounted = true;
		},
	};
	// Record<string,unknown> + cast — draw.ts's proven dict shape; building the
	// dict loosely widens `behavior` past the dictionary's Behavior<Content> so
	// the SVGImage-typed hook assigns with no variance dance.
	const dict: Record<string, unknown> = {
		path: props.src,
		width: props.width,
		height: props.height,
		behavior,
	};
	const svg = new SVGImage(null, dict as SVGImageDictionary);

	// ONE driving effect, created ONLY when something is reactive (a fully static
	// image needs none — onDisplaying does it all). It reads the reactive thunk(s)
	// to subscribe, then, once mounted, re-applies exactly the reactive
	// transform(s). The first (build-time) run subscribes but returns at the
	// mounted guard, so nothing is transformed pre-mount (rule a). Auto-registers
	// with the running owner → disposes with the screen (no leaked re-applies).
	if (dynScale || dynRotate) {
		effect(() => {
			// read the reactive thunk(s) to subscribe; a static side is null here
			// and its throwaway value is never applied below.
			const s = dynScale ? dynScale() : 0;
			const a = dynRotate ? dynRotate() : 0;
			if (!mounted) return; // pre-mount: subscribed, but transforming now hits rule (a)
			if (dynScale) svg.scale(s, s);
			if (dynRotate) svg.rotate(a);
		});
	}
	// SVGImage IS a Piu Content on device, but the vendored pebble/piu.d.ts does not
	// model it as a Content subtype — cast through unknown (draw.ts's host-node idiom).
	return svg as unknown as Content;
}
