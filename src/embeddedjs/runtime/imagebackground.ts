// Children over a bitmap (React Native `<ImageBackground>` analog) — the opt-in
// `runtime/imagebackground` module. OPT-IN & ZERO-COST: an app that never imports
// `runtime/imagebackground` never ships it (the manifest prunes to the import
// closure — README tree-shaking), so this module costs non-users nothing.
//
// WHAT (Rule 2 — no substrate): ImageBackground draws ONE bitmap as the BACKDROP
// and mounts `children` ON TOP of it — the RN `<ImageBackground>` pattern, hand-
// built from plain Piu nodes. A Piu Container paints its own `skin` FIRST, then
// draws its contents over it, so a texture-skinned Container is exactly a bitmap
// with the children layered above (a lone unanchored child centers). No layout
// engine, no touch, no state of its own — just a skinned box holding children.
//
// THE TEXTURE IDIOM (imgwatch.tsx / runtime/image): `new Texture(src)` loads the
// bitmap resource — the ".png" suffix is MANDATORY (`new Texture("name")` throws
// "Texture name not found!" on device, gotcha 19) — and a `new Skin({ texture,
// x: 0, y: 0, width, height })` frames it at the draw size. That Skin rides the
// Container as its background fill. The build derives the packed bitmap from the
// bare "name.png" string LITERAL at the call site (gen-manifest scans app source),
// so `src` passes straight through; the example ships assets/sloth.png for free.
//
// COMPOSITION (the Card idiom): `children` mount into the Container via
// appendChild — which flattens arrays and skips nullish, so an omitted child is a
// safe no-op (a dead `{cond && <X/>}` renders nothing). Children are EAGER JSX
// nodes (Solid model — a component runs once, its children evaluate before it),
// mounted on top of the bitmap exactly as Card mounts children in its body.
//
// NO REACTIVE SIZE (gotcha 16 + the port's static-coordinate rule): `width`/
// `height` are CONSTRUCTION-TIME on BOTH the Skin and the Container — a size-less
// container MEASURES 0 and draws nothing, and a post-mount width/height write is
// rejected by the port — so they are required plain numbers, never thunks (they
// are not on the jsx-runtime REACTIVE_PROPS whitelist).
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): `src` is a runtime string, so the Texture,
// Skin and Container are built INSIDE ImageBackground at call time — never module
// scope (a preloaded module's top-level `new Texture/Skin/Container` freezes into
// a broken ROM instance, measured on Badge) — and the one export is a `function`
// declaration exactly like runtime/image's Image.
import { appendChild, type JSXNode } from "runtime/jsx-runtime";
import type { Container as PiuContainer } from "../../../types/moddable/piu/MC-types";

/** Props for {@link ImageBackground}. */
export type ImageBackgroundProps = {
	/**
	 * The backdrop bitmap resource — a `"name.png"` string. The `.png` suffix is
	 * MANDATORY (`new Texture("name")` throws "Texture name not found!" on device,
	 * gotcha 19). Pass a bare string LITERAL at the call site so the build
	 * (gen-manifest) packs the matching asset — see src/tsx/examples/imagebackground.tsx
	 * (ships assets/sloth.png).
	 */
	src: string;
	/** Backdrop width in px. Construction-time (a size-less container measures 0 — gotcha 16); sizes BOTH the texture Skin and the Container; never a thunk. */
	width: number;
	/** Backdrop height in px. Construction-time (gotcha 16); sizes BOTH the Skin and the Container; never a thunk. */
	height: number;
	/** Content mounted OVER the bitmap. appendChild flattens arrays and skips nullish, so an omitted child is a safe no-op (an empty backdrop). */
	children?: JSXNode;
};

/**
 * ImageBackground — children layered over a bitmap: the React Native
 * `<ImageBackground>` analog.
 *
 *   <ImageBackground src="sloth.png" width={120} height={120}>
 *     <Label style={clock} string={() => time()} />   // a clock over the bitmap
 *   </ImageBackground>
 *
 * Builds `new Texture(src)` (the ".png" suffix is MANDATORY — gotcha 19) into a
 * texture Skin sized `width`x`height` (anchored 0,0), rides that Skin on a
 * `new Container` carrying the SAME explicit width/height (gotcha 16 — a size-less
 * container measures 0 and draws nothing), and mounts `children` ON TOP via
 * appendChild (the Card composition idiom). A Piu Container paints its skin first,
 * then its contents, so the children render over the bitmap; a lone unanchored
 * child centers. `width`/`height` are construction-time (gotcha 16 / the port's
 * static-coordinate rule) — never reactive. Everything is built per-call at
 * runtime (Rule 5 — no module scope). See the module header.
 */
export function ImageBackground(props: ImageBackgroundProps): PiuContainer {
	const { src, width, height } = props;

	// The texture Skin: the "name.png" bitmap framed at the draw size, anchored at
	// 0,0 (imgwatch.tsx). Built PER-CALL (Rule 5): a preloaded module's module-scope
	// `new Texture/Skin` freezes into a broken ROM instance (measured on Badge).
	const skin = new Skin({ texture: new Texture(src), x: 0, y: 0, width, height });

	// The backdrop box: EXPLICIT width + height (gotcha 16 — a size-less container
	// measures 0 and draws nothing). Piu paints this skin FIRST, then the children
	// over it — a bitmap with content layered above.
	const container: PiuContainer = new Container(null, { skin, width, height });

	// Children over the bitmap. Guarded exactly like Card — appendChild flattens
	// arrays and skips nullish, so an omitted child is a safe no-op (empty backdrop).
	if (props.children !== undefined) appendChild(container, props.children);

	return container;
}
