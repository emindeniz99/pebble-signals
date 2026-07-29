// Extraction pin for lower.mts. lower DERIVES its auto-thunk host set + reactive-
// prop whitelist from jsx-runtime.ts (the runtime authority) via the TS AST —
// there is no second hard-coded copy to drift (that drift was the A1 bug). This
// test pins the DERIVED output to the known-good canonical sets, so if the
// extraction breaks (jsx-runtime refactors isPiu's `PIU = [...]` or REACTIVE_PROPS
// out of the shape the AST walk expects) or the host set legitimately changes,
// it surfaces as a loud, readable diff instead of lower silently wrapping nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUTTON_EVENTS, PIU_HOSTS, REACTIVE_PROPS } from "../tools/lower/runtime-meta.mts";

test("sync: lower derives the full Piu host set from jsx-runtime", () => {
	assert.deepEqual(
		[...PIU_HOSTS].sort(),
		["Column", "Container", "Content", "Label", "Layout", "Port", "Row", "Scroller", "Text"],
		"lower's derived PIU_HOSTS changed — jsx-runtime isPiu host list moved, or the AST extraction broke",
	);
});

test("sync: lower derives the reactive-prop whitelist from jsx-runtime", () => {
	assert.deepEqual(
		[...REACTIVE_PROPS].sort(),
		["active", "skin", "state", "string", "style", "variant"],
		"lower's derived REACTIVE_PROPS changed — jsx-runtime REACTIVE_PROPS moved, or the AST extraction broke",
	);
});

test("sync: static-scan derives the button-event set from jsx-runtime", () => {
	// same authority problem, one tier down: static-scan must agree with
	// createHost about which prop lifts a node OUT of the plain dict into a
	// behavior — a node carrying one is dynamic and can never be compiled.
	assert.deepEqual(
		[...BUTTON_EVENTS].sort(),
		[
			"onPressBack",
			"onPressDown",
			"onPressSelect",
			"onPressUp",
			"onReleaseBack",
			"onReleaseDown",
			"onReleaseSelect",
			"onReleaseUp",
		],
		"static-scan's derived BUTTON_EVENTS changed — jsx-runtime BUTTON_EVENTS moved, or the AST extraction broke",
	);
});
