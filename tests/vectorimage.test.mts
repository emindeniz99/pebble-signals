// vectorimage suite — runtime/vectorimage (opt-in PDC vector image, host-backed
// SVGImage). Proves: VectorImage hand-builds ONE SVGImage node and applies NO
// transform at build time (rule a — a pre-mount transform is bind-clobbered and
// the image would not draw); a Piu `onDisplaying` behavior hook then applies the
// INITIAL transforms in the device-proven order center → translate → scale →
// rotate, with center defaulting to [0,0] (rule b), translate defaulting to the
// center POINT (not [0,0]), scale FORCED to (1,1) so a transform-less image still
// draws, and rotate applied ONLY when given (identity otherwise); `scale`/`rotate`
// accept a bare number (CONSTANT — applied once, no effect) or a THUNK (REACTIVE);
// when either is a thunk ONE effect re-applies the reactive transform(s) on every
// signal change, guarded by a `mounted` flag so it never transforms before the
// mount hook; and disposing the owner stops that effect (no re-applies after
// teardown). Every branch — center/translate default vs given, scale/rotate
// number vs thunk vs absent, effect created vs not, each reactive-apply side, the
// pre-mount guard — is covered for 100% line/branch/function coverage.
//
// The vm sandbox has NO `SVGImage`, so — exactly as tabs.test injects Style/Skin
// and accel.test injects importNow BEFORE loadModule — we inject sandbox.SVGImage
// with a StubSVG that stores the construction dict (so `behavior.onDisplaying` is
// reachable) and RECORDS every center/translate/scale/rotate call in order.
// Firing the mount hook is `node.behavior.onDisplaying(node)`. Transforms are
// effect-driven (a signal write re-runs the effect synchronously — no tick()),
// and each block disposes its root so nothing leaks between blocks.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();

// StubSVG: the host SVGImage stand-in. Stores the dict the hook builds it with
// (path/width/height/behavior) and appends every transform call to an ordered log
// so ORDER and VALUES are both assertable. `_$` is the Piu behaviorData arg (null).
type Behaved = { onDisplaying(c: StubSVG): void };
class StubSVG {
	behavior: Behaved;
	path: string;
	width: number;
	height: number;
	calls: Array<[string, number, number?]>;
	constructor(
		_$: unknown,
		dict: { path: string; width: number; height: number; behavior: Behaved },
	) {
		this.behavior = dict.behavior;
		this.path = dict.path;
		this.width = dict.width;
		this.height = dict.height;
		this.calls = [];
	}
	center(x: number, y: number) {
		this.calls.push(["center", x, y]);
	}
	translate(x: number, y: number) {
		this.calls.push(["translate", x, y]);
	}
	scale(x: number, y: number) {
		this.calls.push(["scale", x, y]);
	}
	rotate(a: number) {
		this.calls.push(["rotate", a]);
	}
}
sandbox.SVGImage = StubSVG;

const { signal, createRoot } = signals;
const { VectorImage } = await loadModule("runtime/vectorimage");
const { check, done } = makeChecker("vectorimage");

// Most-recent recorded call of a given kind — transforms are RE-applied on every
// reactive change, so assert the LATEST scale/rotate reflects the newest value.
const lastOf = (node: StubSVG, name: string): [string, number, number?] | undefined => {
	for (let i = node.calls.length - 1; i >= 0; i--)
		if (node.calls[i][0] === name) return node.calls[i];
	return undefined;
};

// --- block 1: BOTH reactive — pre-mount guard, order, provided pivot, re-apply,
// disposal. Covers dynScale/dynRotate thunk branches + both apply sides. --------
{
	const sScale = signal(2);
	const sRot = signal(0.1);
	const [node, dispose] = createRoot(
		() =>
			VectorImage({
				src: "slothvec.pdc",
				width: 120,
				height: 120,
				center: [30, 7],
				translate: [30, 7],
				scale: () => sScale.value,
				rotate: () => sRot.value,
			}) as StubSVG,
	);
	// the effect ran once at build (subscribing) but the mounted guard applied
	// nothing — a pre-mount transform would be bind-clobbered (rule a).
	check("no transform is applied before onDisplaying (rule a)", node.calls.length === 0);
	node.behavior.onDisplaying(node);
	check(
		"onDisplaying applies center → translate → scale → rotate in that order",
		node.calls[0][0] === "center" &&
			node.calls[1][0] === "translate" &&
			node.calls[2][0] === "scale" &&
			node.calls[3][0] === "rotate",
	);
	check("center uses the provided pivot [30,7]", node.calls[0][1] === 30 && node.calls[0][2] === 7);
	check(
		"translate uses the provided offset [30,7]",
		node.calls[1][1] === 30 && node.calls[1][2] === 7,
	);
	check(
		"initial scale is the thunk value 2, forced >= 1 so it draws",
		node.calls[2][1] === 2 && node.calls[2][2] === 2 && node.calls[2][1] >= 1,
	);
	check("initial rotate is the thunk value 0.1", node.calls[3][1] === 0.1);
	// a reactive scale change re-runs the ONE effect and re-applies the reactive
	// transform(s); prove scale followed the new signal value.
	const n1 = node.calls.length;
	sScale.value = 3;
	check("a reactive scale change re-runs the effect", node.calls.length > n1);
	check("reactive scale is re-applied with the new value 3", lastOf(node, "scale")?.[1] === 3);
	sRot.value = 0.5;
	check(
		"reactive rotate is re-applied with the new value 0.5",
		lastOf(node, "rotate")?.[1] === 0.5,
	);
	// disposal stops the effect: later signal writes re-apply nothing.
	dispose();
	const n2 = node.calls.length;
	sScale.value = 9;
	sRot.value = 9;
	check("disposing the owner stops the reactive effect", node.calls.length === n2);
}

// --- block 2: BOTH static numbers, no center/translate — defaults, number bases,
// hasRotate true, and NO effect created (both static). -------------------------
{
	const [node] = createRoot(
		() =>
			VectorImage({
				src: "slothvec.pdc",
				width: 100,
				height: 100,
				scale: 2,
				rotate: 0.5,
			}) as StubSVG,
	);
	check("static props: no transform before onDisplaying", node.calls.length === 0);
	node.behavior.onDisplaying(node);
	check(
		"center defaults to [0,0] when omitted (rule b)",
		node.calls[0][0] === "center" && node.calls[0][1] === 0 && node.calls[0][2] === 0,
	);
	check(
		"translate defaults to the center point [0,0] when omitted",
		node.calls[1][0] === "translate" && node.calls[1][1] === 0 && node.calls[1][2] === 0,
	);
	check(
		"a bare-number scale is applied once (2)",
		node.calls[2][0] === "scale" && node.calls[2][1] === 2 && node.calls[2][2] === 2,
	);
	check(
		"a bare-number rotate is applied once (0.5)",
		node.calls[3][0] === "rotate" && node.calls[3][1] === 0.5,
	);
	// both sides static → the `if (dynScale || dynRotate)` effect is never created.
	check("fully static: exactly 4 transform calls, no effect re-applies", node.calls.length === 4);
}

// --- block 3: scale AND rotate omitted — baseScale defaults to 1 (forced draw),
// hasRotate false (no rotate at all). ------------------------------------------
{
	const [node] = createRoot(
		() => VectorImage({ src: "slothvec.pdc", width: 60, height: 60 }) as StubSVG,
	);
	node.behavior.onDisplaying(node);
	check(
		"scale/rotate omitted: center defaults [0,0]",
		node.calls[0][1] === 0 && node.calls[0][2] === 0,
	);
	check(
		"translate defaults [0,0]",
		node.calls[1][0] === "translate" && node.calls[1][1] === 0 && node.calls[1][2] === 0,
	);
	check(
		"scale is FORCED to (1,1) so a transform-less image still draws (rule a)",
		node.calls[2][0] === "scale" && node.calls[2][1] === 1 && node.calls[2][2] === 1,
	);
	check(
		"rotate is NOT applied when omitted (identity)",
		node.calls.length === 3 && !node.calls.some((c) => c[0] === "rotate"),
	);
}

// --- block 4: scale THUNK only, rotate omitted, center given — proves translate
// defaults to a NON-ZERO center, and the effect applies ONLY scale (dynRotate
// null → the `if (dynRotate)` false side + the `a` throwaway branch). ----------
{
	const sScale = signal(2);
	const [node, dispose] = createRoot(
		() =>
			VectorImage({
				src: "slothvec.pdc",
				width: 120,
				height: 120,
				center: [10, 20],
				scale: () => sScale.value,
			}) as StubSVG,
	);
	check("reactive-scale only: nothing before onDisplaying", node.calls.length === 0);
	node.behavior.onDisplaying(node);
	check(
		"center uses the provided pivot [10,20]",
		node.calls[0][1] === 10 && node.calls[0][2] === 20,
	);
	check(
		"translate defaults to the center point [10,20], not [0,0]",
		node.calls[1][0] === "translate" && node.calls[1][1] === 10 && node.calls[1][2] === 20,
	);
	check(
		"initial scale is the thunk value (2)",
		node.calls[2][0] === "scale" && node.calls[2][1] === 2,
	);
	check("rotate omitted → none applied at mount", !node.calls.some((c) => c[0] === "rotate"));
	// a reactive scale change re-applies ONLY scale (rotate is not reactive here).
	sScale.value = 4;
	check(
		"reactive scale re-applied (4,4)",
		lastOf(node, "scale")?.[1] === 4 && lastOf(node, "scale")?.[2] === 4,
	);
	check("the scale-only effect never applies rotate", !node.calls.some((c) => c[0] === "rotate"));
	dispose();
}

// --- block 5: rotate THUNK only, scale a bare number — the effect applies ONLY
// rotate (dynScale null → the `if (dynScale)` false side + the `s` throwaway
// branch), and the static scale is NOT re-applied by the rotate effect. --------
{
	const sRot = signal(0.2);
	const [node, dispose] = createRoot(
		() =>
			VectorImage({
				src: "slothvec.pdc",
				width: 120,
				height: 120,
				scale: 3,
				rotate: () => sRot.value,
			}) as StubSVG,
	);
	node.behavior.onDisplaying(node);
	check(
		"a bare-number scale is applied once at mount (3)",
		node.calls[2][0] === "scale" && node.calls[2][1] === 3,
	);
	check(
		"initial rotate is the thunk value (0.2)",
		node.calls[3][0] === "rotate" && node.calls[3][1] === 0.2,
	);
	const scalesAtMount = node.calls.filter((c) => c[0] === "scale").length;
	// a reactive rotate change re-applies ONLY rotate; the static scale is untouched.
	sRot.value = 0.9;
	check("reactive rotate re-applied (0.9)", lastOf(node, "rotate")?.[1] === 0.9);
	check(
		"the rotate-only effect never re-applies the static scale",
		node.calls.filter((c) => c[0] === "scale").length === scalesAtMount,
	);
	dispose();
}

done();
