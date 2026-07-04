// Drift guard: lower.mts hard-codes the Piu HOST element names and the set of
// REACTIVE props so it can auto-thunk `string={count()}` on hosts only (the A1
// fix). jsx-runtime.ts is the AUTHORITY — its isPiu() class list and its
// REACTIVE_PROPS array are what actually run on device. The two MUST agree, or
// the compiler (lower) and the runtime (jsx) disagree about what is reactive:
// exactly the A1 bug. There is no shared module (the runtime holds CLASS refs,
// the tool holds NAME strings — different representations), so this test reads
// jsx-runtime's source and asserts lower's copies match it. Zero runtime cost;
// drift fails CI loudly instead of silently mis-compiling an app.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PIU_HOSTS, REACTIVE_PROPS } from "../tools/lower.mts";

const jsxSrc = readFileSync(
	fileURLToPath(new URL("../src/embeddedjs/runtime/jsx-runtime.ts", import.meta.url)),
	"utf8",
);

// Pull the bare identifiers out of isPiu's `PIU = [Label, Text, …].filter(`.
const hostMatch = jsxSrc.match(/PIU\s*=\s*\[([^\]]*)\]\.filter/);
// Pull the string literals out of `REACTIVE_PROPS = Object.freeze([…])`.
const propMatch = jsxSrc.match(/REACTIVE_PROPS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/);

test("sync: jsx-runtime host + reactive-prop lists were found in source", () => {
	assert.ok(hostMatch, "could not locate isPiu's PIU=[…] host list in jsx-runtime.ts");
	assert.ok(propMatch, "could not locate REACTIVE_PROPS=[…] in jsx-runtime.ts");
});

test("sync: lower.mts PIU_HOSTS matches jsx-runtime isPiu class list", () => {
	const jsxHosts = hostMatch![1]
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	assert.deepEqual(
		[...PIU_HOSTS].sort(),
		jsxHosts.sort(),
		"lower.mts PIU_HOSTS drifted from jsx-runtime isPiu — auto-thunk host scope is wrong",
	);
});

test("sync: lower.mts REACTIVE_PROPS matches jsx-runtime REACTIVE_PROPS", () => {
	const jsxProps = propMatch![1]
		.split(",")
		.map((s) => s.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);
	assert.deepEqual(
		[...REACTIVE_PROPS].sort(),
		jsxProps.sort(),
		"lower.mts REACTIVE_PROPS drifted from jsx-runtime REACTIVE_PROPS — auto-thunk whitelist is wrong",
	);
});
