// Load the runtime modules inside a vm context that simulates the Alloy
// mod compartment: piu classes as stubs on the global, "runtime/*" module
// specifiers resolved to ../src/embeddedjs/runtime/*.js.
// Run with: node --experimental-vm-modules <test>
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import vm from "vm";

const RUNTIME = fileURLToPath(new URL("../src/embeddedjs/runtime/", import.meta.url));

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

export class StubBehavior {}

export async function loadRuntime() {
	const sandbox = {
		Label: StubContent,
		Text: StubContent,
		Content: StubContent,
		Container: StubContent,
		Column: StubContent,
		Row: StubContent,
		Scroller: StubContent,
		Port: StubContent,
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
		const file = RUNTIME + spec.replace("runtime/", "") + ".js";
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
	// fire every live interval `n` times (deterministic clock for animate tests)
	const tick = (n) => {
		for (let i = 0; i < n; i++) for (const fn of [...timers.values()]) fn();
	};
	return {
		signals: cache["runtime/signals"].namespace,
		jsx: cache["runtime/jsx-runtime"].namespace,
		flow: flow.namespace,
		sandbox,
		tick,
	};
}

export function makeChecker(suite) {
	let pass = 0,
		fail = 0;
	return {
		check(name, cond) {
			if (cond) {
				pass++;
				console.log("PASS " + name);
			} else {
				fail++;
				console.log("FAIL " + name);
			}
		},
		done() {
			console.log(`${suite}: ${pass} pass, ${fail} fail`);
			process.exit(fail ? 1 : 0);
		},
	};
}
