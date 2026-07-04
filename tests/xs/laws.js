// Reactivity conformance laws on the REAL XS engine (xst) — the high-fidelity
// gate behind the node:test suite. The vm-sandbox suite runs these same laws on
// V8; V8 and XS agree on the spec but not on every edge (freeze semantics, ROM
// aliasing, number formatting), so this file re-runs the PURE-SIGNAL subset of
// tests/conformance.test.mts against the actual engine the watch ships.
//
// Deliberately NOT the whole suite: the Piu-dependent tests (jsx factory, flow
// components, screen stubs) exercise host classes that only exist under the
// firmware/emulator — porting the stub layer to xst would test our stubs, not
// XS. The pure reactive core IS the part where an engine difference could hide.
//
// Plain .js, plain ES module — xst has no TypeScript, no node:test, no node:*
// modules. `print` is xst's console. Any failed law is collected and thrown at
// the end so xst exits nonzero (fail loud, rule 12).
//
// Run via: npm run test:xs   (tools/xstest.mts locates the xs binary)
import {
	batch,
	computed,
	createRoot,
	effect,
	signal,
	track,
	untrack,
	useEffect,
	useState,
} from "../../src/embeddedjs/runtime-build/signals.js";

const failures = [];
const law = (name, cond) => {
	print(`${cond ? "ok" : "NOT OK"} - xs: ${name}`);
	if (!cond) failures.push(name);
};

// Law 1: signal get/set
{
	const s = signal(1);
	let ok = s.value === 1;
	s.value = 2;
	law("signal get/set", ok && s.value === 2);
}

// Law 2: effect auto-tracks reads (runs once immediately, re-runs on write)
{
	const s = signal(0);
	let runs = 0;
	effect(() => {
		s.value;
		runs++;
	});
	const afterInit = runs;
	s.value = 1;
	law("effect auto-tracks reads", afterInit === 1 && runs === 2);
}

// Law 3: no re-run for a signal the effect never read
{
	const read = signal(0);
	const unread = signal(0);
	let runs = 0;
	effect(() => {
		read.value;
		runs++;
	});
	runs = 0;
	unread.value = 99;
	law("no re-run for unread signal", runs === 0);
}

// Law 4: dependencies re-track every run (conditional deps)
{
	const cond = signal(true);
	const a = signal("a");
	const b = signal("b");
	let runs = 0;
	effect(() => {
		cond.value ? a.value : b.value;
		runs++;
	});
	runs = 0;
	b.value = "b2"; // not read while cond=true -> no run
	const afterUntracked = runs;
	cond.value = false; // branch flip: now depends on b, not a
	runs = 0;
	a.value = "a2"; // no longer read -> no run
	law("dynamic re-tracking of conditional deps", afterUntracked === 0 && runs === 0);
}

// Law 5: computed memoizes across reads
{
	const a = signal(2);
	let calls = 0;
	const d = computed(() => {
		calls++;
		return a.value * 10;
	});
	const first = d.value;
	const second = d.value;
	law("computed memoizes across reads", first === 20 && second === 20 && calls === 1);
}

// Law 6: computed recomputes on dep change
{
	const a = signal(1);
	let calls = 0;
	const d = computed(() => {
		calls++;
		return a.value + 1;
	});
	d.value;
	a.value = 5;
	law("computed recomputes on dep change", d.value === 6 && calls === 2);
}

// Law 7: untrack reads without subscribing
{
	const s = signal(0);
	let runs = 0;
	effect(() => {
		untrack(() => s.value);
		runs++;
	});
	runs = 0;
	s.value = 1;
	law("untrack suppresses the dependency", runs === 0);
}

// Law 8: batch coalesces N writes into one notification
{
	const p = signal(1);
	const q = signal(2);
	let runs = 0;
	effect(() => {
		p.value;
		q.value;
		runs++;
	});
	runs = 0;
	batch(() => {
		p.value = 10;
		q.value = 20;
	});
	law("batch coalesces to one effect run", runs === 1 && p.value === 10);
}

// Law 9: effect cleanup runs before re-run and at dispose (useEffect contract)
{
	const s = signal(0);
	const log = [];
	const [, disposeRoot] = createRoot(() => {
		useEffect(() => {
			const v = s.value;
			log.push("run" + v);
			return () => log.push("cleanup" + v);
		});
	});
	s.value = 1;
	disposeRoot();
	law("effect cleanup: before re-run + at dispose", log.join(",") === "run0,cleanup0,run1,cleanup1");
}

// Law 10: disposing an owner tears down tracked effects
{
	const s = signal(0);
	let runs = 0;
	const [, disposeRoot] = createRoot(() => {
		track(
			effect(() => {
				s.value;
				runs++;
			}),
		);
	});
	disposeRoot();
	runs = 0;
	s.value = 1;
	law("owner disposal stops subtree effects", runs === 0);
}

// Law 12 (pinned DIVERGE): diamond re-runs the sink but CONVERGES. This pins
// the eager-push behavior on XS exactly as the V8 suite pins it — if the two
// engines ever disagree here, the packed-core bitmask walk differs on XS and
// we want to know loudly.
{
	const a = signal(1);
	const b = computed(() => a.value + 1);
	const c = computed(() => a.value * 2);
	let dRuns = 0;
	const seen = [];
	effect(() => {
		dRuns++;
		seen.push(b.value + c.value);
	});
	const initRuns = dRuns;
	a.value = 10;
	law(
		"diamond: eager push re-runs sink, converges to 31",
		initRuns === 1 && dRuns === 3 && seen[seen.length - 1] === 31,
	);
}

// Law 13: equal write skips notification
{
	const s = signal(1);
	let runs = 0;
	effect(() => {
		s.value;
		runs++;
	});
	runs = 0;
	s.value = 1;
	law("equal write skips notification", runs === 0);
}

// Law 14: nested batch flushes once at the outer close
{
	const p = signal(0);
	const q = signal(0);
	let runs = 0;
	effect(() => {
		p.value;
		q.value;
		runs++;
	});
	runs = 0;
	batch(() => {
		p.value = 1;
		batch(() => {
			q.value = 1;
		});
	});
	law("nested batch flushes once at the outer close", runs === 1);
}

// Law 15: a throwing effect is isolated via globalThis.__spError — the reason
// this hook exists is XS-specific (an uncaught throw aborts the machine on
// device), so proving it on the real engine matters more than on V8.
{
	let captured = null;
	globalThis.__spError = (e) => {
		captured = e.message;
	};
	const s = signal(0);
	let otherRuns = 0;
	effect(() => {
		if (s.value === 1) throw new Error("boom");
	});
	effect(() => {
		s.value;
		otherRuns++;
	});
	otherRuns = 0;
	s.value = 1;
	law("throwing effect is isolated, others still run", captured === "boom" && otherRuns === 1);
	delete globalThis.__spError;
}

// Law 16: memo-of-memo chain converges
{
	const base = signal(2);
	const m1 = computed(() => base.value * 10);
	const m2 = computed(() => m1.value + 1);
	const seen = [];
	effect(() => seen.push(m2.value));
	base.value = 3;
	law("memo-of-memo chain converges", seen[0] === 21 && seen[seen.length - 1] === 31);
}

// Law 17: untrack inside an effect scopes the suppression
{
	const x = signal(0);
	const y = signal(0);
	let runs = 0;
	effect(() => {
		x.value;
		untrack(() => y.value);
		runs++;
	});
	runs = 0;
	y.value = 1;
	const afterY = runs;
	x.value = 1;
	law("untrack inside an effect suppresses only its reads", afterY === 0 && runs === 1);
}

// Law 18 (pinned DIVERGE): nested raw effects accumulate without an owner
{
	const o = signal(0);
	const inner = signal(0);
	let innerRuns = 0;
	createRoot(() => {
		track(
			effect(() => {
				o.value;
				track(
					effect(() => {
						inner.value;
						innerRuns++;
					}),
				);
			}),
		);
	});
	innerRuns = 0;
	o.value = 1;
	inner.value = 1;
	law("nested raw effects accumulate without an owner", innerRuns === 3);
}

// Law 19: createRoot disposes partial effects on a throwing build
{
	const s = signal(0);
	let runs = 0;
	let threw = false;
	try {
		createRoot(() => {
			track(
				effect(() => {
					s.value;
					runs++;
				}),
			);
			throw new Error("build boom");
		});
	} catch {
		threw = true;
	}
	runs = 0;
	s.value = 1;
	law("createRoot disposes partial effects on a throwing build", threw && runs === 0);
}

// XS-specific: useState pair + functional update on the real engine (the packed
// lowering target's semantics ride on this contract).
{
	const [n, setN] = useState(1);
	setN((prev) => prev + 41);
	law("useState functional update", n() === 42);
}

if (failures.length) {
	print(`\nxs laws: ${failures.length} FAILED`);
	throw new Error("xs conformance failed: " + failures.join("; "));
}
print(`\nxs laws: all passed on real XS`);
