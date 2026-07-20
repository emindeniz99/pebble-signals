// Image suite — runtime/image (opt-in single-bitmap Image, the RN <Image>
// analog; display-only). Proves: Image builds a texture Skin (`new Texture(src)`
// with the mandatory ".png") sized width x height, anchored at 0,0, and rides it
// on ONE Content node carrying the SAME explicit width/height (gotcha 16 — a
// size-less Content measures 0); a PLAIN bitmap adds NO `variants` stride to the
// skin and writes NO `variant` on the node (single-bitmap branch); a `variants`
// frame width turns the skin into a filmstrip; a reactive `variant` THUNK writes
// the node's `variant` at mount AND re-writes it when the driving signal changes
// (idiom 5b — synchronous), and disposing the owner FREES that effect so a later
// write is inert (no leak on navigate-away — Rule 9); a bare-number `variant` is
// written ONCE (static). Every prop branch (variants present/absent, variant
// thunk/number/absent) is covered for 100% line/branch/function coverage.
//
// `Texture`/`Skin` are host compartment globals (absent in the Node sandbox) —
// inject stubs BEFORE loadModule (the tabs/badge/accel idiom) so `skin.texture.
// path` / `skin.width` / `skin.variants` / `node.variant` are assertable. The
// Texture stub records its path; the Skin stub Object.assign's its construction
// dict onto itself. `Content` is already StubLeaf (a leaf that Object.assign's
// its dict — so node.skin / node.width / node.variant read back directly).
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
// Texture: one-arg constructor, records the resource name (proves the exact src,
// incl. the mandatory ".png", reaches `new Texture`). Skin: one-arg constructor,
// assigns its dict so texture/x/y/width/height/variants are all assertable.
sandbox.Texture = class {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
};
sandbox.Skin = class {
	constructor(d: Record<string, unknown>) {
		Object.assign(this, d);
	}
};
const { signal, createRoot } = signals;
const { Image } = await loadModule("runtime/image");
const { check, done } = makeChecker("image");

// --- plain bitmap: texture Skin sized w x h, no variants, no variant written ---
{
	const [node] = createRoot(() => Image({ src: "sloth.png", width: 68, height: 68 }));
	check("Image returns a sized Content node", node.width === 68 && node.height === 68);
	check("the node carries a texture Skin", !!(node.skin && node.skin.texture));
	check(
		"Texture is built from the exact src (mandatory .png)",
		node.skin.texture.path === "sloth.png",
	);
	check(
		"the Skin frames the bitmap at the draw size",
		node.skin.width === 68 && node.skin.height === 68,
	);
	check("the Skin is anchored at 0,0", node.skin.x === 0 && node.skin.y === 0);
	// single-bitmap branch: no filmstrip stride, no frame index written
	check("a plain bitmap adds no variants stride to the skin", node.skin.variants === undefined);
	check("a plain bitmap writes no variant on the node", node.variant === undefined);
}

// --- sprite sheet + reactive variant thunk: filmstrip, mount write, reactive move, disposal ---
{
	const f = signal(0);
	const [node, dispose] = createRoot(() =>
		Image({ src: "ball.png", width: 32, height: 32, variants: 32, variant: () => f.value }),
	);
	check("the sprite skin is built from its own src", node.skin.texture.path === "ball.png");
	check("a variants frame width makes the skin a filmstrip", node.skin.variants === 32);
	check("the reactive thunk writes the initial frame at mount", node.variant === 0);
	// drive the signal -> the effect re-writes content.variant (idiom 5b, synchronous)
	f.value = 3;
	check("a signal change moves the frame reactively", node.variant === 3);
	f.value = 1;
	check("each change re-writes the frame", node.variant === 1);
	// disposing the owner frees the driving effect -> a later write is inert (no leak)
	dispose();
	f.value = 9;
	check("disposal frees the effect (no leaked reactive write)", node.variant === 1);
}

// --- static bare-number variant: filmstrip, frame written ONCE (non-thunk branch) ---
{
	const [node] = createRoot(() =>
		Image({ src: "ball.png", width: 32, height: 32, variants: 32, variant: 2 }),
	);
	check("a bare-number variant is written once (static frame)", node.variant === 2);
	check("the static sprite still gets the variants stride", node.skin.variants === 32);
}

done();
