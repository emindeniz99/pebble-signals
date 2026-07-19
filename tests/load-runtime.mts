// Load the runtime modules inside a vm context that simulates the Alloy
// mod compartment: piu classes as stubs on the global, "runtime/*" module
// specifiers resolved to ../src/embeddedjs/runtime/*.js.
// Run with: node --experimental-vm-modules <test>
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RUNTIME = fileURLToPath(new URL("../src/embeddedjs/runtime/", import.meta.url));
// Runtime files that converted to TypeScript are compiled to runtime-build/ by
// `tsc -p tsconfig.runtime-build.json` (run by the test script before the
// suites). Prefer the compiled .js when present; fall back to the raw .js for
// files still authored in JavaScript. This is what lets the runtime convert to
// TS one file at a time without breaking the vm-sandbox tests.
const RUNTIME_BUILD = fileURLToPath(new URL("../src/embeddedjs/runtime-build/", import.meta.url));

// ---- piu stubs: enough surface for jsx-runtime/flow (add/remove/insert/
// replace, first/next walking, construction dicts) ----
export class StubContent {
	constructor($, it = {}) {
		Object.assign(this, it);
		this.contents = [];
		this.container = null;
	}
	add(c) {
		if (c.container) throw new Error("piu: content already has a container");
		c.container = this;
		this.contents.push(c);
	}
	remove(c) {
		const i = this.contents.indexOf(c);
		if (i < 0) throw new Error("piu: content not in container");
		this.contents.splice(i, 1);
		c.container = null;
	}
	insert(c, before) {
		if (c.container) throw new Error("piu: content already has a container");
		const i = this.contents.indexOf(before);
		this.contents.splice(i < 0 ? this.contents.length : i, 0, c);
		c.container = this;
	}
	replace(oldC, newC) {
		const i = this.contents.indexOf(oldC);
		if (i < 0) throw new Error("piu: replace target not in container");
		if (newC.container) throw new Error("piu: replacement already has a container");
		this.contents[i] = newC;
		oldC.container = null;
		newC.container = this;
	}
	empty() {
		for (const c of this.contents) c.container = null;
		this.contents.length = 0;
	}
	focus() {}
	moveBy(dx, dy) {
		// track cumulative offset + call count so Move's delta math is assertable
		this.movedX = (this.movedX || 0) + dx;
		this.movedY = (this.movedY || 0) + dy;
		this.moveCalls = (this.moveCalls || 0) + 1;
	}
	get first() {
		return this.contents.length ? this.contents[0] : null;
	}
	get last() {
		return this.contents.length ? this.contents[this.contents.length - 1] : null;
	}
	get next() {
		if (!this.container) return null;
		const sib = this.container.contents;
		const i = sib.indexOf(this);
		return i >= 0 && i + 1 < sib.length ? sib[i + 1] : null;
	}
}

// Piu LEAVES (Label, Text, Content) cannot parent children — Content has no
// add() on the device. Mapping them to this faithful stub makes the runtime's
// non-container guard testable; extending StubContent keeps the suites'
// `instanceof StubContent` wrap assertions true for runtime-created Labels.
export class StubLeaf extends StubContent {}
(StubLeaf.prototype as { add?: unknown }).add = undefined;

export class StubBehavior {}

// Port stub for runtime/draw: records every fillColor span and drawString so
// the rasterizers are assertable, counts invalidate() calls, and lets a test
// simulate a repaint by invoking the construction dict's behavior.onDraw. A
// subclass of StubContent so existing `instanceof StubContent` checks hold.
export class StubPort extends StubContent {
	constructor($, it = {}) {
		super($, it);
		this.spans = []; // {color,x,y,w,h} from fillColor
		this.strings = []; // {str,x,y} from drawString
		this.invalidated = 0;
	}
	fillColor(color, x, y, w, h) {
		this.spans.push({ color, x, y, w, h });
	}
	drawString(str, _style, _color, x, y) {
		this.strings.push({ str, x, y });
	}
	invalidate() {
		this.invalidated++;
	}
	// simulate one Piu repaint: replay the onDraw the behavior dict carried
	paint() {
		this.spans = [];
		this.strings = [];
		this.behavior.onDraw(this);
	}
}

export async function loadRuntime() {
	const sandbox = {
		Label: StubLeaf,
		Text: StubLeaf,
		Content: StubLeaf,
		Container: StubContent,
		Column: StubContent,
		Row: StubContent,
		Scroller: StubContent,
		Port: StubPort,
		Layout: StubContent,
		Behavior: StubBehavior,
		Application: StubContent,
		console,
		Set,
		Map,
		Array,
		Error,
		String,
		Object,
		Math,
		Symbol,
		globalThis: undefined,
	};
	sandbox.globalThis = sandbox;
	// controllable timers so animate()/setInterval logic is testable: fire them
	// deterministically via the returned `tick(n)` instead of real time.
	const timers = new Map();
	let timerId = 0;
	sandbox.setInterval = (fn) => {
		const id = ++timerId;
		timers.set(id, fn);
		return id;
	};
	sandbox.clearInterval = (id) => {
		timers.delete(id);
	};
	vm.createContext(sandbox);

	const cache = {};
	async function load(spec) {
		if (cache[spec]) return cache[spec];
		const rel = spec.replace("runtime/", "");
		const built = RUNTIME_BUILD + rel + ".js"; // tsc-compiled .ts output
		const file = existsSync(built) ? built : RUNTIME + rel + ".js";
		const src = readFileSync(file, "utf8");
		// identifier = real file path so V8/c8 attributes coverage to the source
		// file (a bare "runtime/flow" id would be invisible to --include globs).
		const mod = new vm.SourceTextModule(src, { context: sandbox, identifier: file });
		cache[spec] = mod;
		await mod.link(load);
		return mod;
	}

	const flow = await load("runtime/flow");
	await flow.evaluate();
	// runtime/draw is an opt-in module (imports signals + jsx-runtime, already
	// cached/evaluated via flow) — load it so the draw suite can exercise it.
	const draw = await load("runtime/draw");
	await draw.evaluate();
	// fire every live interval `n` times (deterministic clock for animate tests)
	const tick = (n) => {
		for (let i = 0; i < n; i++) for (const fn of [...timers.values()]) fn();
	};
	// how many intervals are live right now — lets the animate suite prove the
	// shared ticker registers ONE timer for N concurrent tweens (the A2 fix).
	const liveTimers = () => timers.size;
	return {
		signals: cache["runtime/signals"].namespace,
		jsx: cache["runtime/jsx-runtime"].namespace,
		flow: flow.namespace,
		draw: draw.namespace,
		sandbox,
		tick,
		liveTimers,
	};
}

// Bridge the suites' imperative `check(name, cond)` style onto Node's built-in
// test runner. Conditions are evaluated EAGERLY at the call site (as they always
// were), so each check captures a boolean; we register a node:test case that
// asserts that captured value. This keeps the ~250 existing assertions and their
// exact intermediate-state semantics while gaining: TS-native tests, node:assert,
// a real exit-1 gate, and built-in V8 coverage that (unlike vitest-v8) DOES see
// the vm.SourceTextModule sandbox (isolate-wide NODE_V8_COVERAGE). `done()` is a
// no-op — node:test auto-runs and sets the exit code.
export function makeChecker(suite) {
	return {
		check(name, cond) {
			test(`${suite}: ${name}`, () => assert.ok(cond, name));
		},
		done() {},
	};
}
