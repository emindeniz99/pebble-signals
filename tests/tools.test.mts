// Unit tests for the build tools (ported from build.mts's Python heredocs).
// Uses Node's BUILT-IN test runner + assert — zero dependencies, runs .mts
// natively (Node >=22.18 type-stripping). Run: node --test tests/tools.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveResources } from "../tools/gen-manifest.mts";
import { badFonts } from "../tools/fontcheck.mts";
import { neededModules, pruneManifest } from "../tools/treeshake.mts";
import { classify } from "../tools/classify-module.mts";
import { squash } from "../tools/squash.mts";

const BASE = {
	modules: {
		main: "./app/main",
		"runtime/signals": "./runtime-min/signals",
		"runtime/jsx-runtime": "./runtime-min/jsx-runtime",
		"runtime/flow": "./runtime-min/flow",
	},
	preload: ["runtime/signals", "runtime/jsx-runtime", "runtime/flow"],
};

test("gen-manifest: derives bitmap resources from new Texture()", () => {
	const src = 'const a = new Texture("ball0.png"); const b = new Texture("ball1");';
	const m = deriveResources(src, { ...BASE });
	assert.deepEqual(m.resources, { "*": ["../../assets/ball0", "../../assets/ball1"] });
	assert.equal(m.data, undefined);
});

test("gen-manifest: derives pdc data resources; dedupes", () => {
	const src = 'new Resource("sloth.pdc"); const x = "sloth.pdc";';
	const m = deriveResources(src, { ...BASE });
	assert.deepEqual(m.data, { "*": ["../../assets/sloth.pdc"] });
});

test("gen-manifest: no assets -> no resources/data added", () => {
	const m = deriveResources("const x = 1;", { ...BASE });
	assert.equal(m.resources, undefined);
	assert.equal(m.data, undefined);
});

test("treeshake: pure-signal app drops flow", () => {
	const src =
		'import { useState } from "runtime/signals";\nimport { render } from "runtime/jsx-runtime";';
	const need = neededModules(src);
	assert.deepEqual([...need].sort(), ["runtime/jsx-runtime", "runtime/signals"]);
	const { manifest, dropped } = pruneManifest(BASE, need);
	assert.deepEqual(dropped, ["runtime/flow"]);
	assert.equal(manifest.modules?.["runtime/flow"], undefined);
	assert.equal(manifest.preload?.includes("runtime/flow"), false);
});

test("treeshake: flow importer keeps all three (transitive closure)", () => {
	const src = 'import { VirtualList } from "runtime/flow";';
	const need = neededModules(src);
	// flow pulls in jsx-runtime + signals transitively
	assert.deepEqual([...need].sort(), ["runtime/flow", "runtime/jsx-runtime", "runtime/signals"]);
	const { dropped } = pruneManifest(BASE, need);
	assert.deepEqual(dropped, []);
});

test("treeshake: always keeps main", () => {
	const { manifest } = pruneManifest(BASE, neededModules('import "runtime/signals";'));
	assert.equal(manifest.modules?.main, "./app/main");
});

test("fontcheck: valid Pebble system fonts pass", () => {
	const src = 'font: "24px Gothic"; font: "bold 42px Bitham"; font: "21px Roboto";';
	assert.deepEqual(badFonts(src), []);
});

test("fontcheck: invalid font size/family is flagged", () => {
	assert.deepEqual(badFonts('font: "99px Gothic"'), ['font: "99px Gothic"']);
	assert.deepEqual(badFonts('font: "24px Comic"'), ['font: "24px Comic"']);
});

test("fontcheck: bold matters (bold 30px Bitham valid, 30px Bitham not)", () => {
	assert.deepEqual(badFonts('font: "bold 30px Bitham"'), []);
	assert.deepEqual(badFonts('font: "30px Bitham"'), ['font: "30px Bitham"']);
});

// --- classify-module: PURE (preload-eligible) vs IMPURE (stays in main) ---
test("classify: const tables + pure functions/classes are PURE", () => {
	const src = `
		export const DOW = ["Mon", "Tue"];
		export function fmt(n: number) { return DOW[n]; }
		export const dbl = (x: number) => x * 2;
		export class Widget { build() { return new Container(null, {}); } }
		type T = { a: number };
		interface I { b: string }`;
	assert.equal(classify(src).pure, true);
});

test("classify: module-scope host construction is IMPURE", () => {
	const v = classify('const bg = new Skin({ fill: "black" });');
	assert.equal(v.pure, false);
	assert.match(v.reasons[0], /runs at load/);
});

test("classify: module-scope signal()/useState() is IMPURE (reactive state)", () => {
	assert.equal(classify('import { signal } from "x"; const c = signal(0);').pure, false);
	assert.equal(classify("const [g, s] = useState(0);").pure, false);
});

test("classify: a top-level call like render() is IMPURE", () => {
	assert.equal(classify("render(() => 1, {});").pure, false);
});

test("classify: imports and nested new/call (inside fn bodies) stay PURE", () => {
	// the new/call is deferred to call time, not module-eval time
	const src = 'import { x } from "y";\nexport const make = () => new Container(null, {});';
	assert.equal(classify(src).pure, true);
});

test("classify: top-level control flow is IMPURE", () => {
	assert.equal(classify("for (let i = 0; i < 3; i++) doThing(i);").pure, false);
});

// ---- squash: array-of-arrows -> ONE dispatch fn (lazymany->lazypack fix) ----

// evaluate a squashed module body and hand back a named binding
const evalGrab = (src: string, name: string): unknown =>
	new Function(`${src.replace(/export default[\s\S]*$/, "")}; return ${name};`)();

test("squash: packs expression-body arrows and rewrites call sites", () => {
	const src = `const H = [
		(x) => "a" + x,
		(x) => "b" + (x * 2),
	];
	export default () => H[1](21) + "/" + H.length;`;
	const res = squash(src);
	assert.ok(res);
	assert.deepEqual(res.packed, [{ name: "H", count: 2 }]);
	assert.match(res.out, /const H = \(\$qi, \$qa0\) => \{ switch \(\$qi\)/);
	assert.match(res.out, /H\(1, 21\)/); // call site rewritten
	assert.match(res.out, /"\/" \+ 2;/); // .length folded to the literal count
	const H = evalGrab(res.out, "H") as (i: number, x: number) => string;
	assert.equal(H(0, 5), "a5");
	assert.equal(H(1, 21), "b42");
});

test("squash: block bodies inline with param aliasing; zero-param arrows skip the alias", () => {
	const src = `const F = [
		(x, y) => { const s = x + y; return s * 2; },
		() => 7,
	];
	const r = F[0](1, 2) + F[1]();`;
	const res = squash(src);
	assert.ok(res);
	const F = evalGrab(res.out, "F") as (i: number, x?: number, y?: number) => number;
	assert.equal(F(0, 1, 2), 6);
	assert.equal(F(1), 7);
	assert.match(res.out, /F\(0, 1, 2\) \+ F\(1\)/);
	// out-of-range index: documented deviation — undefined, not a throw
	assert.equal(F(9), undefined);
});

test("squash: bails on unprovable uses (bare index, argument, export)", () => {
	// bare element access without a call — H could escape
	assert.equal(squash("const H = [(x) => x, (x) => x];\nconst f = H[0];"), null);
	// the array itself passed as a value
	assert.equal(squash("const H = [(x) => x, (x) => x];\nuse(H);"), null);
	// exported — external importers expect an array
	assert.equal(squash("export const H = [(x) => x, (x) => x];\nH[0](1);"), null);
});

test("squash: bails on shapes it cannot prove safe", () => {
	// a non-arrow element
	assert.equal(squash("const H = [(x) => x, 42];\nH[0](1);"), null);
	// destructured / default / rest params
	assert.equal(squash("const H = [({ a }) => a, (x) => x];\nH[0]({ a: 1 });"), null);
	assert.equal(squash("const H = [(x = 1) => x, (x) => x];\nH[0]();"), null);
	assert.equal(squash("const H = [(...x) => x, (x) => x];\nH[0](1);"), null);
	// async arrow
	assert.equal(squash("const H = [async (x) => x, (x) => x];\nH[0](1);"), null);
	// `var` in a block body would hoist into the shared dispatch fn
	assert.equal(squash("const H = [(x) => { var v = x; return v; }, (x) => x];\nH[0](1);"), null);
	// single element, let-declared, no initializer, non-array — all skipped
	assert.equal(squash("const H = [(x) => x];\nH[0](1);"), null);
	assert.equal(squash("let H = [(x) => x, (x) => x];\nH[0](1);"), null);
	assert.equal(squash("const H = notAnArray;\nH[0](1);"), null);
	assert.equal(squash("const A = 1, H = [(x) => x, (x) => x];\nH[0](1);"), null);
});

test("squash: nested fns inside a block body keep their own `var`s (still packs)", () => {
	const src =
		"const H = [(x) => { const f = function () { var v = x; return v; }; return f(); }, (x) => x + 1];\nconst r = H[0](3) + H[1](3);";
	const res = squash(src);
	assert.ok(res);
	const H = evalGrab(res.out, "H") as (i: number, x: number) => number;
	assert.equal(H(0, 3), 3);
	assert.equal(H(1, 3), 4);
});

test("squash: picks a fresh prefix when $q is taken and packs multiple arrays", () => {
	const src = `const $qi = "taken";
	const A = [(x) => x + 1, (x) => x + 2];
	const B = [() => "u", () => "v"];
	const r = A[0](1) + B[1]();`;
	const res = squash(src);
	assert.ok(res);
	assert.deepEqual(
		res.packed.map((p) => p.name),
		["A", "B"],
	);
	assert.match(res.out, /\$q0_i/); // $q collided with the existing $qi text
	const A = evalGrab(res.out, "A") as (i: number, x: number) => number;
	const B = evalGrab(res.out, "B") as (i: number) => string;
	assert.equal(A(1, 1), 3);
	assert.equal(B(0), "u");
});
