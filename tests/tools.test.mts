// Unit tests for the build tools (ported from build.mts's Python heredocs).
// Uses Node's BUILT-IN test runner + assert — zero dependencies, runs .mts
// natively (Node >=22.18 type-stripping). Run: node --test tests/tools.test.mts
import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveFonts, deriveResources } from "../tools/gen-manifest.mts";
import { badFonts } from "../tools/fontcheck.mts";
import { neededModules, pruneManifest } from "../tools/treeshake.mts";
import { classify } from "../tools/classify-module.mts";
import { squash } from "../tools/squash.mts";
import { pruneDeadImports } from "../tools/import-prune-min.mts";
import { renameRuntimeExports } from "../tools/symbol-rename.mts";

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

test("gen-manifest: data merge keeps sibling keys a hand-written base carries", () => {
	// same union rule as resources — assigning `data` wholesale clobbered a
	// platform-qualified entry in a consumer's manifest.base
	const base = {
		...BASE,
		data: { "*": ["../../assets/seed.pdc"], gabbro: ["../../assets/round.pdc"] },
	};
	const m = deriveResources('new Resource("sloth.pdc");', base);
	assert.deepEqual(m.data, {
		gabbro: ["../../assets/round.pdc"],
		"*": ["../../assets/seed.pdc", "../../assets/sloth.pdc"],
	});
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

test("treeshake: extra seeds stand in for generated code and pull their deps", () => {
	// the root-component render() shim imports runtime/jsx-runtime but only
	// exists AFTER tsc — the seed keeps its module (and the transitive
	// signals dep) from being pruned into a mod-load death
	const need = neededModules("const bareApp = 1;", ["runtime/jsx-runtime"]);
	assert.deepEqual([...need].sort(), ["runtime/jsx-runtime", "runtime/signals"]);
	const { dropped } = pruneManifest(BASE, need);
	assert.deepEqual(dropped, ["runtime/flow"]);
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

test("fontcheck: italic on a system font is rejected (no italic face → blank)", () => {
	// the size/family are otherwise valid; the italic token is the defect
	assert.deepEqual(badFonts('font: "italic 24px Gothic"'), ['font: "italic 24px Gothic"']);
	assert.deepEqual(badFonts('font: "italic bold 42px Bitham"'), [
		'font: "italic bold 42px Bitham"',
	]);
	// a TTF-backed custom family MAY be italic (rasterizer resolves the face)
	assert.deepEqual(badFonts('font: "italic 20px Fam"', new Set(["fam"])), []);
});

test("fontcheck: style tokens in EITHER order are seen (audit TOOLS-1)", () => {
	// reversed "bold italic" matched NOTHING under the old fixed-order
	// pattern — the invalid system-font face sailed through and rendered
	// blank on device, the exact class the tool exists to kill
	assert.deepEqual(badFonts('font: "bold italic 42px Bitham"'), [
		'font: "bold italic 42px Bitham"',
	]);
	// custom TTF family: any face in any order is the rasterizer's job
	assert.deepEqual(badFonts('font: "bold italic 20px Fam"', new Set(["fam"])), []);
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

// ---- symbol-rename: runtime EXPORT wire names -> host-known ids (boot slots) --

const TARGETS = ["Q1", "Q2", "Q3"]; // predictable test-only targets

test("symbol-rename: rewrites export + aliased/bare imports consistently", () => {
	const files = {
		"sig.js": "var a=1,b=2;export{a as sig,b as put}",
		"main.js": 'import{sig as x}from"runtime/sig";import{put}from"runtime/sig";x(put)',
	};
	const { map, outputs } = renameRuntimeExports(files, new Set(["sig.js"]), TARGETS);
	assert.deepEqual(map, { sig: "Q1", put: "Q2" });
	assert.equal(outputs["sig.js"], "var a=1,b=2;export{a as Q1,b as Q2}");
	// aliased import: only the wire name changes; bare import gains an alias so
	// the local name (used in code) is preserved
	assert.match(outputs["main.js"], /import\{Q1 as x\}from"runtime\/sig"/);
	assert.match(outputs["main.js"], /import\{Q2 as put\}from"runtime\/sig"/);
	assert.match(outputs["main.js"], /x\(put\)/); // local code untouched
});

test("symbol-rename: cross-module — same wire renamed in export AND every importer", () => {
	const files = {
		"signals.js": "var e=1;export{e as effect}",
		"flow.js": 'import{effect as n}from"runtime/signals";n',
		"main.js": 'import{effect as o}from"runtime/signals";o',
	};
	const { map, outputs } = renameRuntimeExports(files, new Set(["signals.js"]), TARGETS);
	assert.equal(map.effect, "Q1");
	assert.match(outputs["signals.js"], /export\{e as Q1\}/);
	assert.match(outputs["flow.js"], /import\{Q1 as n\}/);
	assert.match(outputs["main.js"], /import\{Q1 as o\}/);
});

test("symbol-rename: only runtime/* imports are rewritten (app modules untouched)", () => {
	const files = {
		"signals.js": "var s=1;export{s as sig}",
		"data.js": "export const sig=9", // app module coincidentally exports 'sig'
		"main.js": 'import{sig as r}from"runtime/signals";import{sig as d}from"app/data";r(d)',
	};
	const { outputs } = renameRuntimeExports(files, new Set(["signals.js"]), TARGETS);
	// the runtime import is renamed; the app/data import keeps 'sig'
	assert.match(outputs["main.js"], /import\{Q1 as r\}from"runtime\/signals"/);
	assert.match(outputs["main.js"], /import\{sig as d\}from"app\/data"/);
});

test("symbol-rename: skips a target that collides with a real identifier", () => {
	const files = {
		"sig.js": "var a=1;export{a as sig}",
		"main.js": 'import{sig as x}from"runtime/sig";var Q1=5;x(Q1)', // Q1 is used
	};
	const { map } = renameRuntimeExports(files, new Set(["sig.js"]), TARGETS);
	assert.equal(map.sig, "Q2"); // Q1 skipped because it appears as a token
});

test("symbol-rename: skips a wire name exported by two modules (ambiguous)", () => {
	const files = {
		"a.js": "var x=1;export{x as dup}",
		"b.js": "var y=2;export{y as dup}",
		"main.js": 'import{dup as z}from"runtime/a";z',
	};
	const { map } = renameRuntimeExports(files, new Set(["a.js", "b.js"]), TARGETS);
	assert.equal(map.dup, undefined); // ambiguous — left alone
});

test("symbol-rename: no runtime exports -> no-op", () => {
	const files = { "main.js": 'import{Container}from"host";new Container()' };
	const { map, outputs } = renameRuntimeExports(files, new Set(), TARGETS);
	assert.deepEqual(map, {});
	assert.deepEqual(outputs, {});
});

test("symbol-rename: stops when the target pool is exhausted", () => {
	const files = {
		"sig.js": "var a=1,b=2,c=3;export{a as one,b as two,c as three}",
		"main.js": 'import{one as x,two as y,three as z}from"runtime/sig";x(y(z))',
	};
	const { map } = renameRuntimeExports(files, new Set(["sig.js"]), ["Q1", "Q2"]);
	assert.equal(Object.keys(map).length, 2); // only two targets available
});

// ---- import-prune-min: dead runtime/* import specifiers after DCE ----------
// The ErrorBoundary-move receipt (2026-07): esbuild keeps import specifiers
// whose users DCE deleted (external modules aren't provably pure), and the
// per-app export prune then reads those stale clauses as demand — watchface
// shipped withBoundary/getBoundary/track/untrack in signals for nothing
// (+9 archive symbols, +540B, measured). This pass closes the loop.

test("import-prune: drops only the specifiers with zero body references", () => {
	const src =
		'import{alpha as a,beta as b,gamma as c}from"runtime/signals";export const f=()=>a(b);';
	const { out, dropped } = pruneDeadImports(src);
	assert.deepEqual(dropped, ["gamma"]);
	assert.match(out, /import\{alpha as a,beta as b\}from"runtime\/signals"/);
	assert.match(out, /a\(b\)/); // code untouched
});

test("import-prune: a property access is NOT a use (.G never counts)", () => {
	const src = 'import{wire as G}from"runtime/signals";export const f=(o)=>o.G;';
	const { out, dropped } = pruneDeadImports(src);
	assert.deepEqual(dropped, ["wire"]);
	assert.doesNotMatch(out, /import\{/); // clause emptied -> declaration gone
	assert.match(out, /o\.G/); // the property access survives untouched
});

test("import-prune: fully-dead clause is removed; app modules untouched", () => {
	const src =
		'import{x as p}from"runtime/flow";import{y as q}from"./app-util";export const f=()=>q;';
	const { out, dropped } = pruneDeadImports(src);
	assert.deepEqual(dropped, ["x"]);
	assert.doesNotMatch(out, /runtime\/flow/); // our module, no side effects — gone
	assert.match(out, /import\{y as q\}from"\.\/app-util"/); // non-runtime clause kept even if... q IS used
});

test("import-prune: no dead specifiers -> byte-identical no-op", () => {
	const src = 'import{a}from"runtime/signals";export const f=()=>a();';
	const { out, dropped } = pruneDeadImports(src);
	assert.equal(dropped.length, 0);
	assert.equal(out, src);
});

// ---- lint-reads: the ".value footgun" gate ---------------------------------
// Real files in a temp dir (the tool needs a TS Program over the runtime
// sources); each fixture is one misuse shape from the watchface incident
// family. The clean fixture doubles as the zero-false-positive pin — every
// correct read syntax in one file.
import { mkdtempSync, rmSync as rmTmp, writeFileSync as writeTmp } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinTmp } from "node:path";
import { lintReads } from "../tools/lint-reads.mts";

const lintFixture = (code: string) => {
	const dir = mkdtempSync(joinTmp(tmpdir(), "sp-lint-"));
	const f = joinTmp(dir, "app.tsx");
	writeTmp(
		f,
		'import { render } from "runtime/jsx-runtime";\nimport { signal, computed, useState } from "runtime/signals";\n' +
			code,
	);
	try {
		return lintReads([f]);
	} finally {
		rmTmp(dir, { recursive: true, force: true });
	}
};

test("lint-reads: flags calling a computed/signal (the watchface greeting() bug)", () => {
	const out = lintFixture("const c = computed(() => 1);\nexport const x = c();\n");
	assert.equal(out.length, 1);
	assert.equal(out[0].rule, "call-signal");
	assert.match(out[0].msg, /c\.value/);
});

test("lint-reads: flags Signal stringify in + and templates, and String()", () => {
	const out = lintFixture(
		'const s = signal(1);\nexport const a = "v" + s;\nexport const b = `v ${s}`;\nexport const c2 = String(s);\n',
	);
	assert.deepEqual(
		out.map((f) => f.rule),
		["stringify-signal", "stringify-signal", "stringify-signal"],
	);
});

test("lint-reads: flags a bare Signal object as a JSX prop", () => {
	const out = lintFixture(
		"const c = computed(() => 1);\nexport const app = render(() => <Label string={c} />, {});\n",
	);
	assert.equal(out.length, 1);
	assert.equal(out[0].rule, "prop-signal");
	assert.match(out[0].msg, /\(\) => c\.value/);
});

test("lint-reads: flags stringifying a useState getter (missing ())", () => {
	const out = lintFixture(
		'const [n] = useState(0);\nexport const app = render(() => <Label string={() => "n " + n} />, {});\n',
	);
	assert.equal(out.length, 1);
	assert.equal(out[0].rule, "stringify-fn");
	assert.match(out[0].msg, /n\(\)/);
});

test("lint-reads: every CORRECT read syntax is clean (zero false positives)", () => {
	const out = lintFixture(
		"const s = signal(1);\nconst c = computed(() => s.value * 2);\nconst [n, setN] = useState(0);\n" +
			"setN(5);\n" +
			"export const app = render(\n" +
			"\t() => <Label string={() => `s=${s.value} c=${c.value} n=${n()}`} />,\n" +
			"\t{},\n" +
			");\n" +
			'export const plain = "txt" + String(n()) + s.value;\n',
	);
	assert.deepEqual(out, []);
});

// ---- lint-reads rule 5: useState accessors escaping as VALUES ---------------
// The pulse incident: `{ setName }` compiled to a dangling identifier and died
// on device (`TypeError: call: not a function`). The lowering now BAILS on
// every escape (selftest pins that); rule 5 makes the cost loud + names the
// wrap fix, since a bailed pair silently falls back to the heap object API.

test("lint-reads rule 5: every setter escape shape is flagged with the wrap fix", () => {
	const out = lintFixture(
		"const [n, setN] = useState(0);\n" +
			"const boot = (c: unknown) => c;\n" +
			"boot({ setN });\n" + // shorthand — the killer shape
			"boot({ set: setN });\n" + // longhand property
			"boot(setN);\n" + // call argument
			"export { setN };\n" + // export specifier
			"export { setN as pub };\n" + // aliased export: ONE finding (local side only)
			"setN(n() + 1);\n",
	);
	assert.deepEqual(
		out.map((f) => f.rule),
		["setter-as-value", "setter-as-value", "setter-as-value", "setter-as-value", "setter-as-value"],
	);
	for (const f of out) assert.match(f.msg, /\(v\) => setN\(v\)/);
});

test("lint-reads rule 5: an exported useState pair is flagged once, with the wrapper advice", () => {
	const out = lintFixture("export const [n, setN] = useState(0);\nsetN(n() + 1);\n");
	assert.deepEqual(
		out.map((f) => f.rule),
		["setter-as-value"],
	);
	assert.match(out[0].msg, /exported with its useState pair/);
	assert.match(out[0].msg, /export const set = \(v\) => setN\(v\)/);
});

test("lint-reads rule 5: JSX prop — getter is a thunk position (clean), setter still flagged", () => {
	const out = lintFixture(
		"const [n, setN] = useState(0);\nsetN(1);\n" +
			"export const app = render(() => <Readout value={n} onPick={setN} />, {});\n",
	);
	assert.deepEqual(
		out.map((f) => f.rule),
		["setter-as-value"], // value={n} is the shipped component.tsx pattern — allowed
	);
});

test("lint-reads rule 5: getter as a value / getter called with args", () => {
	const out = lintFixture(
		"const [n, setN] = useState(0);\n" +
			"export const ctx = { n };\n" + // getter shorthand escape
			"export const bad = n(42);\n" + // getters take no arguments
			"setN(1);\n",
	);
	assert.deepEqual(
		out.map((f) => f.rule),
		["getter-as-value", "getter-as-value"],
	);
	assert.match(out[0].msg, /\(\) => n\(\)/);
	assert.match(out[1].msg, /takes no arguments/);
});

test("lint-reads rule 5: wraps, shadows, keys, foreign useState, unlowerable pairs stay clean", () => {
	const out = lintFixture(
		'import { useState as rUS } from "react";\n' +
			"const [n, setN] = useState(0);\n" +
			"export const ok = { setN: (v: number) => setN(v), read: () => n() };\n" + // the wrap fix
			"const keys = { setN: 1, n: 2 };\n" + // property KEYS, not references
			"function shadow(setN: (v: number) => void) { const p = setN; return p; }\n" + // different symbol
			"const [x, sX] = rUS(0);\nexport const foreign = { sX, x };\n" + // not OUR useState
			"const [solo] = useState(1);\nexport const single = { solo };\n" + // 1-element pair: lowering never touches it
			"const [, setOnly] = useState(9);\nexport const so = { setOnly };\n" + // omitted element: not a candidate either
			"const typed: typeof setN = (v) => setN(v);\n" + // TYPE-position ref is erased at emit
			"const arity: typeof setN.length = 1;\n" + // qualified type query climbs to the TypeQuery
			"setN(n() + keys.n + arity);\nshadow((v) => setN(v));\ntyped(2);\nsetOnly(3);\n",
	);
	assert.deepEqual(out, []);
});

test("lint-reads rule 5: defers when a sharper rule already flagged the site", () => {
	const out = lintFixture('const [n, setN] = useState(0);\nsetN(1);\nexport const t = "x " + n;\n');
	assert.deepEqual(
		out.map((f) => f.rule),
		["stringify-fn"], // one finding, not stringify-fn + getter-as-value
	);
});

test("gen-manifest: commented-out Texture refs do not ship phantom resources", () => {
	const r = deriveResources(
		'// new Texture("ghost.png")\n/* new Texture("ghost2") */\nconst x = 1;\n',
		{},
	);
	assert.equal(r.resources, undefined);
});

// ---- deep-review pipeline regressions ---------------------------------------
import { relativeClosure, neededModules as nm2 } from "../tools/treeshake.mts";

test("P1: relativeClosure walks the entry's ./-import graph (cycles safe)", () => {
	const fs2: Record<string, string> = {
		"src/app.tsx": 'import { h } from "./util/helper";\nimport "runtime/signals";',
		"src/util/helper.tsx":
			'import { d } from "../data"; // -> src/data.ts\nimport { h2 } from "./helper"; // self-cycle\nexport const h = 1;',
		"src/data.ts": 'import { h } from "./app"; // cycle back (resolves .tsx)\nexport const d = 2;',
	};
	const read = (p: string) => fs2[p] ?? null;
	const out = relativeClosure("src/app.tsx", read);
	assert.deepEqual(out, ["src/app.tsx", "src/util/helper.tsx", "src/data.ts"]);
});

test("relativeClosure follows bare side-effect imports and re-exports (no `from`)", () => {
	const fs2: Record<string, string> = {
		// bare side-effect import (no `from`) + a re-export (`export … from`)
		"src/app.tsx": 'import "./setup";\nexport { x } from "./api";',
		"src/setup.tsx": 'import "runtime/flow"; // must reach treeshake seeds',
		"src/api.ts": "export const x = 1;",
	};
	const out = relativeClosure("src/app.tsx", (p) => fs2[p] ?? null);
	// `from` (re-export) is scanned before the bare-import pass, so api precedes
	// setup; both are in the closure, which is what matters.
	assert.deepEqual(out, ["src/app.tsx", "src/api.ts", "src/setup.tsx"]);
});

test("relativeClosure resolves a directory index module (./setup -> setup/index.tsx)", () => {
	const fs2: Record<string, string> = {
		"src/app.tsx": 'import "./setup";',
		"src/setup/index.tsx": 'import "runtime/flow"; // must reach treeshake seeds',
	};
	const out = relativeClosure("src/app.tsx", (p) => fs2[p] ?? null);
	assert.deepEqual(out, ["src/app.tsx", "src/setup/index.tsx"]);
});

test("relativeClosure does not mistake importNow(...) for a bare import", () => {
	const fs2: Record<string, string> = {
		"src/app.tsx": 'importNow("app/screen");\nimport "./real";',
		"src/real.tsx": "export const r = 1;",
	};
	// `importNow("app/screen")` is a dynamic call, not a static relative import
	const out = relativeClosure("src/app.tsx", (p) => fs2[p] ?? null);
	assert.deepEqual(out, ["src/app.tsx", "src/real.tsx"]);
});

test("P9: an unknown runtime module seed is KEPT, not silently pruned", () => {
	const need = nm2('import { x } from "runtime/newthing";');
	assert.ok(need.has("runtime/newthing"));
});

test("P5: namespace-imported runtime module's exports are never renamed", () => {
	const files = {
		"rt/signals.js": "const a1=1;export{a1 as effect};",
		"rt/jsx-runtime.js": "const b1=1;export{b1 as jsx};",
		"app/main.js":
			'import * as sig from "runtime/signals";sig.effect();import{jsx}from"runtime/jsx-runtime";jsx();',
	};
	const { map } = renameRuntimeExports(files, new Set(["rt/signals.js", "rt/jsx-runtime.js"]));
	assert.equal(map.effect, undefined); // namespace-consumed module: untouched
	assert.ok(map.jsx); // named-import module still renamed
});

// ---- custom fonts: the fonts/ convention (deriveFonts + fontcheck) ----
test("deriveFonts: bold literal + matching TTF -> *-alpha entry", () => {
	const ttfs = ["../tsx/examples/x/fonts/LiberationSerif-Bold.ttf"];
	const out = deriveFonts('font: "bold 32px LiberationSerif"', ttfs);
	assert.equal(out.length, 1);
	assert.equal(out[0].source, "../tsx/examples/x/fonts/LiberationSerif-Bold");
	assert.equal(out[0].size, 32);
	assert.ok(out[0].characters.includes("0") && out[0].characters.includes("z"));
});

test("deriveFonts: suffix mirrors the port's lookup (Regular/Italic/BoldItalic)", () => {
	const ttfs = ["f/Fam-Regular.ttf", "f/Fam-Italic.ttf", "f/Fam-BoldItalic.ttf"];
	assert.equal(deriveFonts('font: "20px Fam"', ttfs)[0].source, "f/Fam-Regular");
	assert.equal(deriveFonts('font: "italic 20px Fam"', ttfs)[0].source, "f/Fam-Italic");
	assert.equal(deriveFonts('font: "italic bold 20px Fam"', ttfs)[0].source, "f/Fam-BoldItalic");
	// either token order names the SAME BoldItalic face (fontcheck tolerance,
	// audit TOOLS-1 — a reversed order must not silently ship no font at all)
	assert.equal(deriveFonts('font: "bold italic 20px Fam"', ttfs)[0].source, "f/Fam-BoldItalic");
});

test("deriveFonts: no matching TTF -> no entry; same source+size dedupes", () => {
	assert.deepEqual(deriveFonts('font: "bold 32px LiberationSerif"', []), []);
	const ttfs = ["f/Fam-Bold.ttf"];
	const twice = 'font: "bold 20px Fam" font: "bold 20px Fam" font: "bold 24px Fam"';
	assert.equal(deriveFonts(twice, ttfs).length, 2); // 20px deduped, 24px distinct
});

test("deriveFonts: commented-out literal ships nothing (phantom guard)", () => {
	const ttfs = ["f/Fam-Bold.ttf"];
	assert.deepEqual(deriveFonts('// font: "bold 20px Fam"', ttfs), []);
});

test("fontcheck: custom families backed by a TTF pass at any size", () => {
	const custom = new Set(["liberationserif"]);
	assert.deepEqual(badFonts('font: "bold 32px LiberationSerif"', custom), []);
	// still flags non-system fonts WITHOUT a TTF behind them
	assert.equal(badFonts('font: "bold 32px LiberationSerif"').length, 1);
});

test("deriveResources: derived textures keep sibling *-alpha entries intact", () => {
	const base = {
		resources: { "*-alpha": [{ source: "f/Fam-Bold", size: 20, characters: "ab" }] },
	};
	const m = deriveResources('new Texture("pic.png")', base as never);
	assert.equal((m.resources!["*-alpha"] as unknown[]).length, 1);
	assert.deepEqual(m.resources!["*"], ["../../assets/pic"]);
});
