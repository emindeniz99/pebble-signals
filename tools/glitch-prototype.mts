// GLITCH-FREE PROTOTYPE — measurement, not shipped. Demonstrates the design
// spec'd in docs/xs-heap-playbook.md ("Glitch-free reactivity"): make derived
// nodes (computed) LAZY (recompute on read, pulling sources first), and coalesce
// an effect's notifications within a write so a diamond sink runs ONCE. This
// proves the design fixes conformance law 12 and lets us size the delta before
// deciding whether to integrate it into the shipped bitmask core.
//
// Kept object-based for clarity (the shipped core would express this on the
// existing per-signal Uint32 masks — see the playbook cost note). Run:
//   node --test tools/glitch-prototype.mts
import assert from "node:assert/strict";
import { test } from "node:test";

type Reaction = { run: () => void; sources: Set<Src>; queued?: boolean };
type Src = { subs: Set<Reaction>; version: number };

let current: Reaction | null = null;
let batchDepth = 0;
const pending = new Set<Reaction>(); // effects to run once at batch end (DEDUPED)

function sub(s: Src) {
	if (current) {
		s.subs.add(current);
		current.sources.add(s);
	}
}
function schedule(s: Src) {
	// notify subscribers — but DEFER + DEDUPE so a sink reached via two paths
	// (the diamond) runs ONCE. This coalescing is what removes the glitch.
	batchDepth++;
	try {
		for (const r of s.subs) if (!pending.has(r)) pending.add(r);
	} finally {
		if (--batchDepth === 0) flush();
	}
}
function flush() {
	// pull-order is implicit: an effect reading a lazy computed forces the
	// computed to refresh (which pulls ITS sources) before the effect proceeds.
	for (const r of pending) {
		pending.delete(r);
		r.run();
	}
}

export function signal<T>(init: T) {
	const s: Src = { subs: new Set(), version: 0 };
	let v = init;
	return {
		get value() {
			sub(s);
			return v;
		},
		set value(x: T) {
			if (x !== v) {
				v = x;
				s.version++;
				schedule(s);
			}
		},
	};
}

// LAZY computed: never recomputes on notify — only marks dirty + propagates to
// its own subscribers. Recomputes on READ, pulling its sources first.
export function computed<T>(fn: () => T) {
	const s: Src = { subs: new Set(), version: 0 };
	let value: T;
	let dirty = true;
	const self: Reaction = {
		sources: new Set(),
		run() {
			// a source changed: mark dirty + tell OUR subscribers (no recompute)
			dirty = true;
			schedule(s);
		},
	};
	return {
		get value(): T {
			sub(s);
			if (dirty) {
				// recompute: re-track sources (pull) — recursion gives topo order
				for (const src of self.sources) src.subs.delete(self);
				self.sources.clear();
				const prev = current;
				current = self;
				try {
					value = fn();
				} finally {
					current = prev;
				}
				dirty = false;
			}
			return value;
		},
	};
}

export function effect(fn: () => void) {
	const self: Reaction = {
		sources: new Set(),
		run() {
			for (const src of self.sources) src.subs.delete(self);
			self.sources.clear();
			const prev = current;
			current = self;
			try {
				fn();
			} finally {
				current = prev;
			}
		},
	};
	self.run();
	return self;
}

// --- the measurement: the diamond that glitches in the eager shipped core ---
test("prototype: diamond runs the sink ONCE, no glitch", () => {
	const a = signal(1);
	const b = computed(() => a.value + 1);
	const c = computed(() => a.value * 2);
	const seen: number[] = [];
	effect(() => seen.push(b.value + c.value));
	assert.deepEqual(seen, [4]); // init: 2 + 2
	a.value = 10;
	// GLITCH-FREE: D runs exactly once more, straight to the correct value.
	// (the shipped eager core produces [4, 13, 31] — two runs, one glitch.)
	assert.deepEqual(seen, [4, 31]);
});

test("prototype: unchanged-input branch still delivers final value", () => {
	const a = signal(2);
	const b = computed(() => a.value * 10);
	const seen: number[] = [];
	effect(() => seen.push(b.value));
	a.value = 3;
	assert.deepEqual(seen, [20, 30]);
});
