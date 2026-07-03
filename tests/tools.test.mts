// Unit tests for the build tools (ported from build.sh's Python heredocs).
// Uses Node's BUILT-IN test runner + assert — zero dependencies, runs .mts
// natively (Node >=22.18 type-stripping). Run: node --test tests/tools.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveResources } from "../tools/gen-manifest.mts";
import { badFonts } from "../tools/fontcheck.mts";
import { neededModules, pruneManifest } from "../tools/treeshake.mts";
import { classify } from "../tools/classify-module.mts";

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
	const src = 'import { useState } from "runtime/signals";\nimport { render } from "runtime/jsx-runtime";';
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
	assert.deepEqual([...need].sort(), [
		"runtime/flow",
		"runtime/jsx-runtime",
		"runtime/signals",
	]);
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
	assert.equal(classify('const [g, s] = useState(0);').pure, false);
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
