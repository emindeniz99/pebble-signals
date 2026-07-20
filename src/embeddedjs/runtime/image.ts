// A bitmap Image (React Native `<Image>` analog — the most hand-rolled watch
// pattern) — the opt-in `runtime/image` module. OPT-IN & ZERO-COST: an app that
// never imports `runtime/image` never ships it (the manifest prunes to the
// import closure — README tree-shaking), so this module costs non-users nothing.
//
// WHAT (Rule 2 — no substrate): Image draws ONE bitmap, nothing more. It maps a
// PNG resource onto a Piu texture Skin and rides that on a single Content node —
// the exact hand-built idiom every watchface uses for a static logo or an
// animated sprite (src/tsx/examples/imgwatch.tsx, device-proven). No layout, no
// touch, no state of its own beyond the optional frame index.
//
// THE TEXTURE IDIOM (imgwatch.tsx): `new Texture(src)` loads the bitmap resource
// — the ".png" suffix is MANDATORY (`new Texture("name")` throws "Texture name
// not found!" on device, gotcha 19) — a `new Skin({ texture, x:0, y:0, width,
// height })` frames it at the draw size, and that Skin rides a `new Content(null,
// { skin, width, height })`. The build derives the packed bitmap from the bare
// "name.png" string LITERAL at the call site (gen-manifest scans app source), so
// `src` passes straight through; the example ships assets/sloth.png automatically.
//
// SPRITE SHEETS (optional): pass `variants` = the per-frame width in px and the
// Skin becomes a horizontal filmstrip; the Content's `variant` index then selects
// the frame. `variant` may be a THUNK (`() => i`) — the one whitelisted reactive
// prop this module writes (jsx-runtime REACTIVE_PROPS) — and ONE driving effect
// writes `content.variant` on every change (idiom 5b, tabs.ts). A bare number is
// applied once (static). Frame-swap is device-proven: imgwatch swaps whole Skins
// on a timer; a variant is the SAME texture and one integer write — cheaper.
//
// NO REACTIVE SIZE (gotcha 16 + the port's static-coordinate rule): width/height
// are CONSTRUCTION-TIME on BOTH the Skin and the Content — a size-less Content
// measures 0 and draws nothing, and a post-mount width/height write is rejected
// by the port — so they are plain numbers, never thunks. ONLY `variant` is
// reactive (it is on the whitelist; position/size are not).
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): `src` is a runtime string, so the Texture
// and Skin are built INSIDE Image at call time — never module scope (a preloaded
// module's top-level `new Texture/Skin` freezes into a broken ROM instance,
// measured on Badge) — and the one export is a `function` declaration exactly like
// tabs.ts's Tabs. (The module-local `Image` shadows Piu's native `Image` global,
// which this module does not use — the RN-style component owns the name here.)
import { effect } from "runtime/signals";
import type { Content as PiuContent } from "../../../types/moddable/piu/MC-types";

/** Props for {@link Image}. */
export type ImageProps = {
	/**
	 * The bitmap resource — a `"name.png"` string. The `.png` suffix is MANDATORY
	 * (`new Texture("name")` throws "Texture name not found!" on device, gotcha 19).
	 * Pass a bare string LITERAL at the call site so the build (gen-manifest) packs
	 * the matching asset — see src/tsx/examples/image.tsx (ships assets/sloth.png).
	 */
	src: string;
	/** Draw width in px. Construction-time (a size-less Content measures 0 — gotcha 16); never a thunk. */
	width: number;
	/** Draw height in px. Construction-time (gotcha 16); never a thunk. */
	height: number;
	/**
	 * Sprite frame selector, for a `variants` filmstrip. A THUNK (`() => i`) makes
	 * the frame reactive — ONE effect writes `content.variant` on each change (the
	 * whitelisted reactive prop, idiom 5b); a bare number is a static frame. Omit
	 * for a plain single bitmap. Keep the index in `[0, frames)` yourself (e.g.
	 * `() => i() % frames`, as imgwatch.tsx does) — Image does not clamp it.
	 */
	variant?: number | (() => number);
	/**
	 * Per-frame width in px for a horizontal sprite sheet — the Skin's `variants`
	 * stride. Present = the texture is a filmstrip and `variant` picks the frame;
	 * absent = a plain single bitmap (no `variant` concept).
	 */
	variants?: number;
};

/**
 * Image — a single bitmap on one Piu Content: the React Native `<Image>` analog.
 *
 *   <Image src="sloth.png" width={68} height={68} />              // static bitmap
 *
 *   const [f] = useState(0);                                      // sprite sheet:
 *   <Image src="ball.png" width={32} height={32}                 // 32px frames,
 *          variants={32} variant={() => f() % 4} />               // reactive index
 *
 * Builds `new Texture(src)` (the ".png" suffix is MANDATORY — gotcha 19) into a
 * texture Skin sized `width`x`height` and rides it on a `new Content`. With
 * `variants` the Skin is a horizontal filmstrip and `variant` selects the frame:
 * a THUNK drives ONE effect that writes `content.variant` on change (idiom 5b —
 * the write is on the REACTIVE_PROPS whitelist, device-proven), a bare number is
 * applied once. `width`/`height` are construction-time (gotcha 16 / the port's
 * static-coordinate rule) — never reactive. Everything is built per-call at
 * runtime (Rule 5 — no module scope). See the module header.
 */
export function Image(props: ImageProps): PiuContent {
	const { src, width, height, variant, variants } = props;

	// The texture Skin: the "name.png" bitmap framed at the draw size, anchored at
	// 0,0. With `variants` present it is a horizontal filmstrip whose per-frame
	// width is that stride (the Content's `variant` index then selects the frame —
	// imgwatch.tsx). Built PER-CALL (Rule 5): a preloaded module's module-scope
	// `new Texture/Skin` freezes into a broken ROM instance (measured on Badge).
	const skin = new Skin({
		texture: new Texture(src),
		x: 0,
		y: 0,
		width,
		height,
		...(variants !== undefined ? { variants } : {}),
	});

	// EXPLICIT width + height (gotcha 16): a size-less Content measures 0 and draws
	// nothing. One node carries the whole bitmap — no container needed for a lone image.
	const content: PiuContent = new Content(null, { skin, width, height });

	// Optional sprite frame. A THUNK drives ONE effect that writes `content.variant`
	// on every change (idiom 5b — auto-tracks the signals it reads; `variant` is on
	// the jsx-runtime REACTIVE_PROPS whitelist, so the write is device-proven safe).
	// A bare number is written ONCE (static). Omitted -> a plain single bitmap.
	if (typeof variant === "function") {
		effect(() => {
			content.variant = variant();
		});
	} else if (variant !== undefined) {
		content.variant = variant;
	}

	return content;
}
