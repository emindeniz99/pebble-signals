// ImageBackground suite — runtime/imagebackground (opt-in RN `<ImageBackground>`
// analog: children over a bitmap; display-only). Proves: ImageBackground builds a
// texture Skin (`new Texture(src)` with the mandatory ".png") sized width x
// height, anchored at 0,0, and rides it as the fill of ONE Container carrying the
// SAME explicit width/height (gotcha 16 — a size-less container measures 0 and
// draws nothing); `children` mount ON TOP of that bitmap via appendChild (the Card
// composition idiom), the mounted child landing in the container's `contents`
// (drawn over the skin); and BOTH branches — children PRESENT (mounted into the
// container) vs children ABSENT (an empty backdrop, no crash) — are covered for
// 100% line/branch/function coverage.
//
// WHY it matters (Rule 9): the Skin must frame the EXACT src (incl. the ".png"
// gotcha 19 requires) at the draw size or the bitmap is "not found" / mis-drawn on
// device; the Container must carry an explicit width AND height or it measures 0
// and the whole backdrop vanishes (gotcha 16); and children must land in the
// container's contents (over the skin) or the RN overlay semantics break.
//
// `Texture`/`Skin` are host compartment globals (absent in the Node sandbox) —
// inject stubs BEFORE loadModule (the image/tabs/accel idiom) so `skin.texture.
// path` / `skin.width` / `skin.x` are assertable. `Container` is already
// StubContent (Object.assign's its dict and holds `contents`) — so `node.skin` /
// `node.width` read back directly and `node.contents` holds the mounted children;
// `Label` is StubLeaf (a leaf that Object.assign's its dict — `child.string` reads
// back).
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
// Texture: one-arg constructor, records the resource name (proves the exact src,
// incl. the mandatory ".png", reaches `new Texture`). Skin: one-arg constructor,
// assigns its dict so texture/x/y/width/height are all assertable.
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
const { createRoot } = signals;
const { ImageBackground } = await loadModule("runtime/imagebackground");
const { check, done } = makeChecker("imagebackground");

// --- children PRESENT: texture Skin sized w x h + a child mounted on top ---
{
	const child = new sandbox.Label(null, { string: "12:34" });
	const [node] = createRoot(() =>
		ImageBackground({ src: "sloth.png", width: 120, height: 120, children: child }),
	);
	check("ImageBackground returns a container", node && typeof node.add === "function");
	check("the container carries a texture Skin background", !!(node.skin && node.skin.texture));
	check(
		"Texture is built from the exact src (mandatory .png)",
		node.skin.texture.path === "sloth.png",
	);
	check(
		"the Skin frames the bitmap at the draw size",
		node.skin.width === 120 && node.skin.height === 120,
	);
	check("the Skin is anchored at 0,0", node.skin.x === 0 && node.skin.y === 0);
	// gotcha 16: the container carries the SAME explicit width + height as the skin
	check(
		"the container carries explicit width + height (gotcha 16)",
		node.width === 120 && node.height === 120,
	);
	// children mount ON TOP of the bitmap background (into the container's contents)
	check(
		"the passed child mounts into the container over the bitmap",
		node.contents.length === 1 && node.contents[0] === child,
	);
	check("the mounted child is the label over the bitmap", node.contents[0].string === "12:34");
}

// --- children ABSENT: a bare bitmap backdrop, no crash (children-absent branch) ---
{
	const [node] = createRoot(() => ImageBackground({ src: "ball0.png", width: 64, height: 64 }));
	check(
		"a bare backdrop still builds its texture Skin from its own src",
		node.skin.texture.path === "ball0.png",
	);
	check(
		"a bare backdrop carries explicit width + height (gotcha 16)",
		node.width === 64 && node.height === 64,
	);
	check("omitted children yield an empty backdrop (no crash)", node.contents.length === 0);
}

done();
