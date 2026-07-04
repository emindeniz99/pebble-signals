// Reactivity conformance suite — PROVE the semantics.
//
// signal-piu is Solid-flavored (fine-grained, components-run-once). This suite
// runs OUR runtime through the canonical fine-grained-reactivity laws and, for
// each, records how Solid / Preact-signals / React behave so the parity claim
// is CHECKED, not asserted in prose. Where we DIVERGE (notably glitch-freedom),
// the test pins our ACTUAL behavior and the annotation says who differs and why
// — an honest conformance report, not a wish (CLAUDE.md Rule 9 & 12).
//
// We can't take solid-js/react/preact as deps (no node_modules build, the 32KB
// ethos, the release-age cooldown), so the reference column is the documented
// contract of each library's primitive, encoded as data next to each law. The
// EXECUTABLE half is our runtime; the reference half is a citation.
//
// Run with: node --experimental-vm-modules tests/conformance.test.mts
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox } = await loadRuntime();
const { signal, computed, effect, batch, untrack, createRoot, track, useState, useEffect } =
	signals;
const { jsx } = jsxM;
const { check, done } = makeChecker("conformance");

// Each law prints a parity line: MATCH = we behave like Solid; DIVERGE = we
// intentionally differ. Collected and summarized at the end.
const parity = [];
const law = (name, verdict, cond, refs) => {
	check(`${name} [${verdict}]`, cond);
	parity.push({ name, verdict, refs });
};

// --- Law 1: a signal read returns the current value; write updates it -------
{
	const s = signal(1);
	let ok = s.value === 1;
	s.value = 2;
	ok = ok && s.value === 2;
	law("signal get/set", "MATCH", ok, {
		solid: "createSignal getter/setter",
		preact: "signal.value get/set (same shape as ours)",
		react: "useState value + setter; read is a plain var, not a call",
	});
}

// --- Law 2: an effect auto-subscribes to the signals it READS ---------------
{
	const s = signal(0);
	let runs = 0;
	effect(() => {
		s.value;
		runs++;
	});
	const afterInit = runs; // effects run once immediately
	s.value = 1;
	law("effect auto-tracks reads", "MATCH", afterInit === 1 && runs === 2, {
		solid: "createEffect auto-tracks",
		preact: "effect() auto-tracks",
		react: "useEffect needs a manual deps array — NOT auto-tracked",
	});
}

// --- Law 3: an effect does NOT re-run for a signal it never read ------------
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
	law("no re-run for unread signal", "MATCH", runs === 0, {
		solid: "only tracked deps re-run",
		preact: "same",
		react: "re-render is component-wide, not per-read",
	});
}

// --- Law 4: dependencies are RE-TRACKED every run (conditional deps) --------
// An effect that reads A only while B is true must STOP depending on A once B
// flips false. This is the headline fine-grained property.
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
	cond.value = false; // flips branch: now depends on b, not a
	runs = 0;
	a.value = "a2"; // a is no longer read -> no run
	law("dynamic re-tracking of conditional deps", "MATCH", afterUntracked === 0 && runs === 0, {
		solid: "re-tracks each run (dep set rebuilt)",
		preact: "same",
		react: "deps array is static per call site — cannot re-track",
	});
}

// --- Law 5: computed memoizes; many reads do not re-run its fn --------------
{
	const a = signal(2);
	let calls = 0;
	const d = computed(() => {
		calls++;
		return a.value * 10;
	});
	const first = d.value; // 20
	const second = d.value; // cached, no recompute
	law("computed memoizes across reads", "MATCH", first === 20 && second === 20 && calls === 1, {
		solid: "createMemo caches until a dep changes",
		preact: "computed caches",
		react: "useMemo recomputes when deps change, but per-render",
	});
}

// --- Law 6: computed recomputes when a dependency changes -------------------
{
	const a = signal(1);
	let calls = 0;
	const d = computed(() => {
		calls++;
		return a.value + 1;
	});
	d.value; // 2, calls=1
	a.value = 5;
	const v = d.value; // 6, recomputed
	law("computed recomputes on dep change", "MATCH", v === 6 && calls === 2, {
		solid: "createMemo",
		preact: "computed",
		react: "useMemo",
	});
}

// --- Law 7: untrack reads without subscribing -------------------------------
{
	const s = signal(0);
	let runs = 0;
	effect(() => {
		untrack(() => s.value);
		runs++;
	});
	runs = 0;
	s.value = 1;
	law("untrack suppresses the dependency", "MATCH", runs === 0, {
		solid: "untrack()",
		preact: "untracked()",
		react: "N/A — no tracking to suppress",
	});
}

// --- Law 8: batch coalesces N writes into ONE notification per effect -------
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
	// reads inside the batch see new values eagerly; only notification defers
	law("batch coalesces to one effect run", "MATCH", runs === 1 && p.value === 10, {
		solid: "batch()",
		preact: "batch()",
		react: "auto-batches within event handlers",
	});
}

// --- Law 9: onCleanup runs on owner disposal; effect cleanup runs BEFORE the
// next run and once more at dispose (React useEffect cleanup contract) -------
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
	s.value = 1; // cleanup0 then run1
	disposeRoot(); // cleanup1
	law(
		"effect cleanup: before re-run + at dispose",
		"MATCH",
		log.join(",") === "run0,cleanup0,run1,cleanup1",
		{
			solid: "onCleanup runs before each re-run and at dispose",
			preact: "effect() dispose fn, same ordering",
			react: "useEffect cleanup runs before next effect + at unmount",
		},
	);
}

// --- Law 10: disposing an owner tears down the whole subtree ----------------
{
	const s = signal(0);
	let runs = 0;
	const [, disposeRoot] = createRoot(() => {
		// effect() returns a raw id; track() registers it with the current owner.
		// useEffect/computed do this internally — a bare effect() is NOT auto-
		// owned (a deliberate API nuance: the primitive is unmanaged, the hooks
		// manage it), so owner-tearing tests the tracked path apps actually use.
		track(
			effect(() => {
				s.value;
				runs++;
			}),
		);
	});
	disposeRoot();
	runs = 0;
	s.value = 1; // effect is gone
	law("owner disposal stops subtree effects", "MATCH", runs === 0, {
		solid: "createRoot disposer (createEffect auto-owns; we track() explicitly)",
		preact: "manual dispose of effects",
		react: "unmount tears down component effects",
	});
}

// --- Law 11: components run ONCE (no re-render) ------------------------------
// The JSX factory calls a component exactly once; state changes update via
// bindings, never by re-invoking the function. This is THE structural break
// from React and the reason useState returns [getter, setter].
{
	let bodyRuns = 0;
	const [count, setCount] = useState(0);
	// a component is just a function the jsx factory calls once; it returns a
	// node (here a plain marker — the point is the call count, not the node).
	const Comp = () => {
		bodyRuns++;
		return { kind: "node", read: () => count() };
	};
	jsx(Comp, {});
	setCount(1);
	setCount(2);
	law("component body runs exactly once", "DIVERGE", bodyRuns === 1, {
		solid: "MATCH — components run once",
		preact: "DIFFERS — @preact/signals-react re-renders the component",
		react: "DIVERGE — re-renders on every state change",
	});
}

// --- Law 12: push-based notify is NOT glitch-free (documented divergence) ---
// Diamond: A -> B, A -> C, D reads B and C. On an A change our synchronous
// push runs D once per changed input (twice), transiting a glitched value,
// then settling correct. Solid & Preact are glitch-free (D runs once, final
// value only). We pin OUR real behavior; the annotation owns the difference.
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
	const initRuns = dRuns; // 1, seen [4]
	a.value = 10;
	// D re-runs twice: intermediate 13 (b new, c old), then final 31.
	law(
		"diamond: push notify re-runs the sink (NOT glitch-free)",
		"DIVERGE",
		initRuns === 1 && dRuns === 3 && seen[seen.length - 1] === 31,
		{
			solid: "glitch-free — D runs once, value 31 only",
			preact: "glitch-free — deferred computed, D runs once",
			react: "N/A — whole component re-renders once per state commit",
		},
	);
	// The value CONVERGES correctly even though it isn't glitch-free — that's
	// the tradeoff: on a 2-4-signal watch a transient extra run is invisible,
	// and the topological scheduler Solid needs would cost slots we don't have.
	check("diamond still converges to the correct final value", seen[seen.length - 1] === 31);
}

// --- Law 13: writing the SAME value does not notify ------------------------
{
	const s = signal(1);
	let runs = 0;
	effect(() => {
		s.value;
		runs++;
	});
	runs = 0;
	s.value = 1; // identical value -> no notification
	law("equal write skips notification", "MATCH", runs === 0, {
		solid: "createSignal skips when Object.is-equal (default)",
		preact: "signal skips when === equal",
		react: "setState bails on Object.is-equal",
	});
}

// --- Law 14: batch nests — one flush at the OUTERMOST close ------------------
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
		}); // inner close does NOT flush
	});
	law("nested batch flushes once at the outer close", "MATCH", runs === 1, {
		solid: "batch nests; flush at depth 0",
		preact: "batch nests; flush at depth 0",
		react: "nested updates batch within one commit",
	});
}

// --- Law 15: a throwing effect is ISOLATED, the machine survives ------------
// XS aborts the app on an uncaught throw, so notify() routes subscriber errors
// to globalThis.__spError instead of letting one bad effect kill every other.
{
	// __spError is read off the RUNTIME's globalThis — the vm sandbox, not the
	// test's — so stub it there (same as jsx.test's sandbox access).
	let captured = null;
	sandbox.__spError = (e) => {
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
	}); // a SECOND effect on the same signal
	otherRuns = 0;
	s.value = 1; // effect 1 throws, effect 2 must still run
	law(
		"throwing effect is isolated, others still run",
		"DIVERGE",
		captured === "boom" && otherRuns === 1,
		{
			solid: "error propagates; needs an ErrorBoundary to contain",
			preact: "error propagates out of the batch",
			react: "error bubbles to the nearest error boundary",
		},
	);
	delete sandbox.__spError;
}

// --- Law 16: memo of a memo (a CHAIN) updates once, converges ---------------
{
	const base = signal(2);
	const m1 = computed(() => base.value * 10);
	const m2 = computed(() => m1.value + 1);
	const seen = [];
	effect(() => seen.push(m2.value));
	base.value = 3; // 2->3: m1 20->30, m2 21->31
	law("memo-of-memo chain converges", "MATCH", seen[0] === 21 && seen[seen.length - 1] === 31, {
		solid: "chained memos pull in order",
		preact: "chained computeds refresh in order",
		react: "chained useMemo recompute per render",
	});
}

// --- Law 17: untrack INSIDE an effect scopes the suppression ----------------
{
	const x = signal(0);
	const y = signal(0);
	let runs = 0;
	effect(() => {
		x.value; // tracked
		untrack(() => y.value); // NOT tracked
		runs++;
	});
	runs = 0;
	y.value = 1; // untracked read -> no run
	const afterY = runs;
	x.value = 1; // tracked read -> run
	law("untrack inside an effect suppresses only its reads", "MATCH", afterY === 0 && runs === 1, {
		solid: "untrack scopes to its callback",
		preact: "untracked scopes to its callback",
		react: "N/A",
	});
}

// --- Law 18: nested RAW effects accumulate (caveat vs Solid ownership) -------
// A raw effect() created inside another effect is NOT auto-owned, so when the
// outer re-runs it creates a NEW inner without disposing the old one — they
// accumulate. Solid owns nested computations and disposes them on parent
// re-run. Our framework path avoids this: Show/For/Navigator wrap each subtree
// in createRoot, and disposing that root tears the nested effects down. The
// caveat is only for hand-rolled effect-in-effect; use an owner or the hooks.
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
	o.value = 1; // outer re-runs -> a SECOND inner effect now also listens
	inner.value = 1; // BOTH inners run -> 2, not 1 (accumulation)
	law("nested raw effects accumulate without an owner", "DIVERGE", innerRuns === 3, {
		solid: "MATCH-by-ownership — outer re-run disposes the previous inner",
		preact: "N/A — no built-in ownership tree",
		react: "N/A — effects are per-render, cleaned on deps change",
	});
	// The guarded path (Show/For/createRoot) does NOT leak — that's the intended
	// way to nest; this law documents the raw-primitive sharp edge, not a bug.
}

// --- Law 19: createRoot disposes partial effects when the build THROWS -------
// If the build fn throws, its disposer never reaches the caller, so any effects
// it already created would leak. createRoot tears them down before rethrowing.
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
	s.value = 1; // the effect must be gone (disposed on the throw)
	law("createRoot disposes partial effects on a throwing build", "MATCH", threw && runs === 0, {
		solid: "createRoot cleans up on throw",
		preact: "manual",
		react: "error boundary unmounts the subtree",
	});
}

// --- parity summary ---------------------------------------------------------
console.log("\n--- parity vs Solid / Preact / React ---");
for (const p of parity)
	console.log(`  ${p.verdict === "MATCH" ? "=" : "≠"} ${p.name} [${p.verdict} vs Solid]`);
const diverge = parity.filter((p) => p.verdict === "DIVERGE");
console.log(
	`\n${parity.length} laws: ${parity.length - diverge.length} MATCH Solid, ${diverge.length} intentional DIVERGE`,
);
console.log("  DIVERGE:", diverge.map((p) => p.name).join("; "));

done();
