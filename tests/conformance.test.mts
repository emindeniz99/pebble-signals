// Reactivity conformance suite — PROVE the semantics.
//
// signal-piu is Solid-flavored (fine-grained, components-run-once). This suite
// runs OUR runtime through the canonical fine-grained-reactivity laws and, for
// each, records how Solid / Preact-signals / React behave so the parity claim
// is CHECKED, not asserted in prose. Where we DIVERGE (notably glitch-freedom),
// the test pins our ACTUAL behavior and the annotation says who differs and why
// — an honest conformance report, not a wish (CLAUDE.md Rule 9 & 12).
//
// The reference column used to be a CITATION — each library's documented
// contract encoded as data next to the law — because taking solid-js/preact as
// deps looked incompatible with the no-node_modules device build. It isn't:
// the mod bundle is built from src/embeddedjs/runtime/ alone, so a DEV
// dependency is free of device cost. Since 2026-07-31 (competitive gap #10)
// the reference half is EXECUTED: the SAME scenario is replayed against the
// real library and asserted equal to ours (`ref`), or pinned as an INTENTIONAL
// divergence with its reason (`refDiverges`), or named as having no analogue
// in either core (`refNone`). Never silently skipped (Rule 12). The prose
// citations under each law stay as the human-readable why.
//
// React remains DOCUMENTED, not executed: its test-utils need a renderer + a
// DOM, so there is no headless core to replay a law against.
//
// Run with: node --experimental-vm-modules tests/conformance.test.mts
import { loadRuntime, makeChecker } from "./load-runtime.mts";
// DEV dependencies, NODE-SIDE ONLY. Nothing here is imported by the runtime,
// listed in the mod manifest, or seen by build.mts — solid-js and
// @preact/signals-core never reach the device and cost the 32KB arena nothing.
import {
	batch as pBatch,
	computed as pComputed,
	effect as pEffect,
	signal as pSignal,
	untracked as pUntracked,
} from "@preact/signals-core";
// solid-js's "node" export condition resolves to the SSR build, where
// createEffect is a NO-OP — importing the bare "solid-js" specifier would make
// every reference law pass with runs===0 and prove exactly nothing. Take the
// CLIENT build explicitly via the package's published "./dist/*" export.
import {
	batch as sBatch,
	catchError,
	createComponent,
	createEffect,
	createMemo,
	createRoot as sCreateRoot,
	createSignal,
	onCleanup,
	untrack as sUntrack,
} from "solid-js/dist/solid.js";

const { signals, jsx: jsxM, sandbox } = await loadRuntime();
const { signal, computed, effect, batch, untrack, createRoot, track, useState, useEffect } =
	signals;
const { jsx } = jsxM;
const { ErrorBoundary } = jsxM; // moved to jsx-runtime (boot-floor round)
const { check, done } = makeChecker("conformance");

// Each law prints a parity line: MATCH = we behave like Solid; DIVERGE = we
// intentionally differ. Collected and summarized at the end.
const parity = [];
const law = (name, verdict, cond, refs) => {
	check(`${name} [${verdict}]`, cond);
	parity.push({ name, verdict, refs });
};

// --- the reference column, EXECUTED ------------------------------------------
// `ref(law, lib, ours, theirs)` replays the SAME scenario against a real
// reference implementation and FAILS when the two observables drift apart — so
// "we behave like Solid" is a test, not a claim. `refDiverges(...)` is the
// honest other half: it asserts the reference really does behave the OTHER way
// and names the reason, which pins an intentional difference AND catches a
// silent upstream convergence. `refNone(...)` records a law with no analogue in
// either core (our JSX-binding policy, the crash screen) — named in the
// summary, never quietly skipped. Observables are plain data so they compare by
// value.
const refLog = [];
const sameShape = (ours, theirs) => JSON.stringify(ours) === JSON.stringify(theirs);
const ref = (name, lib, ours, theirs) => {
	check(`${name} — ${lib} reference MATCHES ${JSON.stringify(theirs)}`, sameShape(ours, theirs));
	refLog.push({ name, lib, kind: "live" });
};
const refDiverges = (name, lib, ours, theirs, why) => {
	check(`${name} — ${lib} DIVERGES as documented: ${why}`, !sameShape(ours, theirs));
	refLog.push({ name, lib, kind: "diverge", why, theirs });
};
const refNone = (name, lib, why) => {
	refLog.push({ name, lib, kind: "none", why });
};
// Solid DEFERS an effect's first run to the end of the enclosing update, so a
// reference scenario BUILDS inside createRoot and observes only after the root
// returns (where a write flushes its effects synchronously). `observe` also
// receives the disposer, for the laws whose observable includes teardown. The
// root is always disposed — a reference scenario must not outlive its law.
const solid = (build, observe) => {
	let handles;
	const dispose = sCreateRoot((d) => {
		handles = build();
		return d;
	});
	try {
		return observe ? observe(handles, dispose) : handles;
	} finally {
		dispose();
	}
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
	ref(
		"signal get/set",
		"solid",
		ok,
		solid(() => {
			const [g, set] = createSignal(1);
			const was = g() === 1;
			set(2);
			return was && g() === 2;
		}),
	);
	const rp = pSignal(1);
	const rpWas = rp.value === 1;
	rp.value = 2;
	ref("signal get/set", "preact", ok, rpWas && rp.value === 2);
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
	const ours = [afterInit, runs];
	ref(
		"effect auto-tracks reads",
		"solid",
		ours,
		solid(
			() => {
				const [g, set] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					g();
					r.n++;
				});
				return { set, r };
			},
			(h) => {
				const init = h.r.n;
				h.set(1);
				return [init, h.r.n];
			},
		),
	);
	const rs = pSignal(0);
	let rn = 0;
	pEffect(() => {
		rs.value;
		rn++;
	});
	const rInit = rn;
	rs.value = 1;
	ref("effect auto-tracks reads", "preact", ours, [rInit, rn]);
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
	ref(
		"no re-run for unread signal",
		"solid",
		runs,
		solid(
			() => {
				const [rd] = createSignal(0);
				const [, setUn] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					rd();
					r.n++;
				});
				return { setUn, r };
			},
			(h) => {
				h.r.n = 0;
				h.setUn(99);
				return h.r.n;
			},
		),
	);
	const rRead = pSignal(0);
	const rUnread = pSignal(0);
	let rn = 0;
	pEffect(() => {
		rRead.value;
		rn++;
	});
	rn = 0;
	rUnread.value = 99;
	ref("no re-run for unread signal", "preact", runs, rn);
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
	const ours = [afterUntracked, runs];
	ref(
		"dynamic re-tracking of conditional deps",
		"solid",
		ours,
		solid(
			() => {
				const [c, setC] = createSignal(true);
				const [x, setX] = createSignal("a");
				const [y, setY] = createSignal("b");
				const r = { n: 0 };
				createEffect(() => {
					c() ? x() : y();
					r.n++;
				});
				return { setC, setX, setY, r };
			},
			(h) => {
				h.r.n = 0;
				h.setY("b2");
				const untracked = h.r.n;
				h.setC(false);
				h.r.n = 0;
				h.setX("a2");
				return [untracked, h.r.n];
			},
		),
	);
	const rc = pSignal(true);
	const ra = pSignal("a");
	const rb = pSignal("b");
	let rn = 0;
	pEffect(() => {
		rc.value ? ra.value : rb.value;
		rn++;
	});
	rn = 0;
	rb.value = "b2";
	const rUntracked = rn;
	rc.value = false;
	rn = 0;
	ra.value = "a2";
	ref("dynamic re-tracking of conditional deps", "preact", ours, [rUntracked, rn]);
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
	const ours = [first, second, calls];
	// Solid's createMemo evaluates EAGERLY at creation, ours on first read — a
	// scheduling difference the observable deliberately does not see: what the
	// law is about is that N reads cost ONE evaluation.
	ref(
		"computed memoizes across reads",
		"solid",
		ours,
		solid(() => {
			const [a] = createSignal(2);
			const c = { n: 0 };
			const m = createMemo(() => {
				c.n++;
				return a() * 10;
			});
			return [m(), m(), c.n];
		}),
	);
	const ra = pSignal(2);
	let rCalls = 0;
	const rm = pComputed(() => {
		rCalls++;
		return ra.value * 10;
	});
	ref("computed memoizes across reads", "preact", ours, [rm.value, rm.value, rCalls]);
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
	const ours = [v, calls];
	ref(
		"computed recomputes on dep change",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const c = { n: 0 };
				const m = createMemo(() => {
					c.n++;
					return a() + 1;
				});
				m();
				return { setA, m, c };
			},
			(h) => {
				h.setA(5);
				return [h.m(), h.c.n];
			},
		),
	);
	const ra = pSignal(1);
	let rCalls = 0;
	const rm = pComputed(() => {
		rCalls++;
		return ra.value + 1;
	});
	rm.value;
	ra.value = 5;
	ref("computed recomputes on dep change", "preact", ours, [rm.value, rCalls]);
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
	ref(
		"untrack suppresses the dependency",
		"solid",
		runs,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					sUntrack(() => a());
					r.n++;
				});
				return { setA, r };
			},
			(h) => {
				h.r.n = 0;
				h.setA(1);
				return h.r.n;
			},
		),
	);
	const rs = pSignal(0);
	let rn = 0;
	pEffect(() => {
		pUntracked(() => rs.value);
		rn++;
	});
	rn = 0;
	rs.value = 1;
	ref("untrack suppresses the dependency", "preact", runs, rn);
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
	const ours = [runs, p.value];
	ref(
		"batch coalesces to one effect run",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const [b, setB] = createSignal(2);
				const r = { n: 0 };
				createEffect(() => {
					a();
					b();
					r.n++;
				});
				return { a, setA, setB, r };
			},
			(h) => {
				h.r.n = 0;
				sBatch(() => {
					h.setA(10);
					h.setB(20);
				});
				return [h.r.n, h.a()];
			},
		),
	);
	const rp = pSignal(1);
	const rq = pSignal(2);
	let rn = 0;
	pEffect(() => {
		rp.value;
		rq.value;
		rn++;
	});
	rn = 0;
	pBatch(() => {
		rp.value = 10;
		rq.value = 20;
	});
	ref("batch coalesces to one effect run", "preact", ours, [rn, rp.value]);
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
	const ours = log.join(",");
	ref(
		"effect cleanup: before re-run + at dispose",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const l = [];
				createEffect(() => {
					const v = a();
					l.push(`run${v}`);
					onCleanup(() => l.push(`cleanup${v}`));
				});
				return { setA, l };
			},
			(h, dispose) => {
				h.setA(1);
				dispose(); // the dispose cleanup is PART of the observable here
				return h.l.join(",");
			},
		),
	);
	const rs = pSignal(0);
	const rl = [];
	const rDispose = pEffect(() => {
		const v = rs.value;
		rl.push(`run${v}`);
		return () => rl.push(`cleanup${v}`);
	});
	rs.value = 1;
	rDispose();
	ref("effect cleanup: before re-run + at dispose", "preact", ours, rl.join(","));
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
	ref(
		"owner disposal stops subtree effects",
		"solid",
		runs,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					a();
					r.n++;
				});
				return { setA, r };
			},
			(h, dispose) => {
				dispose();
				h.r.n = 0;
				h.setA(1);
				return h.r.n;
			},
		),
	);
	const rs = pSignal(0);
	let rn = 0;
	const rDispose = pEffect(() => {
		rs.value;
		rn++;
	});
	rDispose(); // signals-core has no owner tree — dispose is per-effect
	rn = 0;
	rs.value = 1;
	ref("owner disposal stops subtree effects", "preact", runs, rn);
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
	// The DIVERGE verdict on this law is vs REACT; the executed Solid reference
	// MATCHES (createComponent calls the body once and never re-invokes it).
	ref(
		"component body runs exactly once",
		"solid",
		bodyRuns,
		solid(
			() => {
				const [c, setC] = createSignal(0);
				const b = { n: 0 };
				createComponent(() => {
					b.n++;
					return { read: () => c() };
				}, {});
				return { setC, b };
			},
			(h) => {
				h.setC(1);
				h.setC(2);
				return h.b.n;
			},
		),
	);
	refNone(
		"component body runs exactly once",
		"preact",
		"signals-core is a reactive GRAPH, not a renderer — it has no component primitive to call once (the re-render claim belongs to @preact/signals-react)",
	);
}

// --- Law 12: GLITCH-FREE diamond (2026-07 lazy-computed round) --------------
// Diamond: A -> B, A -> C, D reads B and C. Computeds are LAZY (recompute on
// READ, validated against the global write version, pulling sources first)
// and every notify coalesces into settle() turns — so D runs ONCE per write,
// straight to the correct value, never observing a half-updated diamond.
// This flipped from DIVERGE when the eager push core was replaced.
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
	// GLITCH-FREE: D ran exactly once more, no transient 13 ever observed.
	law(
		"diamond: sink runs ONCE, no glitch value (glitch-free)",
		"MATCH",
		initRuns === 1 && dRuns === 2 && seen.join(",") === "4,31",
		{
			solid: "glitch-free — D runs once, value 31 only",
			preact: "glitch-free — deferred computed, D runs once",
			react: "N/A — whole component re-renders once per state commit",
		},
	);
	check("diamond never observes a glitched value", seen.indexOf(13) < 0);
	const ours = [initRuns, dRuns, seen.join(",")];
	ref(
		"diamond: sink runs ONCE, no glitch value (glitch-free)",
		"solid",
		ours,
		solid(
			() => {
				const [x, setX] = createSignal(1);
				const m1 = createMemo(() => x() + 1);
				const m2 = createMemo(() => x() * 2);
				const d = { n: 0, seen: [] };
				createEffect(() => {
					d.n++;
					d.seen.push(m1() + m2());
				});
				return { setX, d };
			},
			(h) => {
				const init = h.d.n;
				h.setX(10);
				return [init, h.d.n, h.d.seen.join(",")];
			},
		),
	);
	const ra = pSignal(1);
	const rb = pComputed(() => ra.value + 1);
	const rc = pComputed(() => ra.value * 2);
	let rn = 0;
	const rSeen = [];
	pEffect(() => {
		rn++;
		rSeen.push(rb.value + rc.value);
	});
	const rInit = rn;
	ra.value = 10;
	ref("diamond: sink runs ONCE, no glitch value (glitch-free)", "preact", ours, [
		rInit,
		rn,
		rSeen.join(","),
	]);
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
	ref(
		"equal write skips notification",
		"solid",
		runs,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const r = { n: 0 };
				createEffect(() => {
					a();
					r.n++;
				});
				return { setA, r };
			},
			(h) => {
				h.r.n = 0;
				h.setA(1);
				return h.r.n;
			},
		),
	);
	const rs = pSignal(1);
	let rn = 0;
	pEffect(() => {
		rs.value;
		rn++;
	});
	rn = 0;
	rs.value = 1;
	ref("equal write skips notification", "preact", runs, rn);
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
	ref(
		"nested batch flushes once at the outer close",
		"solid",
		runs,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const [b, setB] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					a();
					b();
					r.n++;
				});
				return { setA, setB, r };
			},
			(h) => {
				h.r.n = 0;
				sBatch(() => {
					h.setA(1);
					sBatch(() => {
						h.setB(1);
					});
				});
				return h.r.n;
			},
		),
	);
	const rp = pSignal(0);
	const rq = pSignal(0);
	let rn = 0;
	pEffect(() => {
		rp.value;
		rq.value;
		rn++;
	});
	rn = 0;
	pBatch(() => {
		rp.value = 1;
		pBatch(() => {
			rq.value = 1;
		});
	});
	ref("nested batch flushes once at the outer close", "preact", runs, rn);
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
	// the write is guarded so `propagated` is observable — it must stay false:
	// the whole point is that the throw never reaches the writer.
	let propagated = false;
	try {
		s.value = 1; // effect 1 throws, effect 2 must still run
	} catch {
		propagated = true;
	}
	law(
		"throwing effect is isolated, others still run",
		"DIVERGE",
		captured === "boom" && otherRuns === 1 && !propagated,
		{
			solid: "error propagates; needs an ErrorBoundary to contain",
			preact: "error propagates out of the batch",
			react: "error bubbles to the nearest error boundary",
		},
	);
	const ours = [propagated, otherRuns];
	refDiverges(
		"throwing effect is isolated, others still run",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const o = { n: 0 };
				createEffect(() => {
					if (a() === 1) throw new Error("boom");
				});
				createEffect(() => {
					a();
					o.n++;
				});
				return { setA, o };
			},
			(h) => {
				h.o.n = 0;
				let threw = false;
				try {
					h.setA(1);
				} catch {
					threw = true;
				}
				return [threw, h.o.n];
			},
		),
		"Solid propagates to the WRITER and aborts the rest of the effect queue (the sibling never runs); XS aborts the whole app on an uncaught throw, so notify() routes subscriber errors to globalThis.__spError and keeps every other subscriber alive",
	);
	const rs = pSignal(0);
	let rOther = 0;
	pEffect(() => {
		if (rs.value === 1) throw new Error("boom");
	});
	pEffect(() => {
		rs.value;
		rOther++;
	});
	rOther = 0;
	let rThrew = false;
	try {
		rs.value = 1;
	} catch {
		rThrew = true;
	}
	refDiverges(
		"throwing effect is isolated, others still run",
		"preact",
		ours,
		[rThrew, rOther],
		"signals-core isolates the SIBLING the same way we do (it still runs) but RETHROWS the first effect error at the writer; we report it to __spError instead, because on XS an escaped throw kills the machine",
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
	const ours = [seen[0], seen[seen.length - 1]];
	ref(
		"memo-of-memo chain converges",
		"solid",
		ours,
		solid(
			() => {
				const [x, setX] = createSignal(2);
				const m1 = createMemo(() => x() * 10);
				const m2 = createMemo(() => m1() + 1);
				const s = [];
				createEffect(() => s.push(m2()));
				return { setX, s };
			},
			(h) => {
				h.setX(3);
				return [h.s[0], h.s[h.s.length - 1]];
			},
		),
	);
	const rBase = pSignal(2);
	const rm1 = pComputed(() => rBase.value * 10);
	const rm2 = pComputed(() => rm1.value + 1);
	const rSeen = [];
	pEffect(() => rSeen.push(rm2.value));
	rBase.value = 3;
	ref("memo-of-memo chain converges", "preact", ours, [rSeen[0], rSeen[rSeen.length - 1]]);
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
	const ours = [afterY, runs];
	ref(
		"untrack inside an effect suppresses only its reads",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const [b, setB] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					a();
					sUntrack(() => b());
					r.n++;
				});
				return { setA, setB, r };
			},
			(h) => {
				h.r.n = 0;
				h.setB(1);
				const afterB = h.r.n;
				h.setA(1);
				return [afterB, h.r.n];
			},
		),
	);
	const rx = pSignal(0);
	const ry = pSignal(0);
	let rn = 0;
	pEffect(() => {
		rx.value;
		pUntracked(() => ry.value);
		rn++;
	});
	rn = 0;
	ry.value = 1;
	const rAfterY = rn;
	rx.value = 1;
	ref("untrack inside an effect suppresses only its reads", "preact", ours, [rAfterY, rn]);
}

// --- Law 18: running-owner — nested effects are owned (2026-07, B9) ----------
// An effect() created inside another effect registers with the RUNNING outer
// effect; when the outer re-runs (or is disposed) the previous inner is
// disposed first — Solid's ownership model, no accumulation.
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
	o.value = 1; // outer re-runs -> running-owner DISPOSES the previous inner
	inner.value = 1; // exactly ONE live inner runs
	law(
		"nested effects are owned by the running effect (no accumulation)",
		"MATCH",
		innerRuns === 2,
		{
			solid: "MATCH — outer re-run disposes the previous inner (running owner)",
			preact: "N/A — no built-in ownership tree",
			react: "N/A — effects are per-render, cleaned on deps change",
		},
	);
	// Since the 2026-07 running-owner round (B9), effect() auto-registers with
	// the innermost context (running effect or root) — the old raw-primitive
	// accumulation footgun is gone; explicit track(effect(...)) is redundant.
	ref(
		"nested effects are owned by the running effect (no accumulation)",
		"solid",
		innerRuns,
		solid(
			() => {
				const [o2, setO] = createSignal(0);
				const [i2, setI] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					o2();
					createEffect(() => {
						i2();
						r.n++;
					});
				});
				return { setO, setI, r };
			},
			(h) => {
				h.r.n = 0;
				h.setO(1);
				h.setI(1);
				return h.r.n;
			},
		),
	);
	const ro = pSignal(0);
	const ri = pSignal(0);
	let rInner = 0;
	pEffect(() => {
		ro.value;
		pEffect(() => {
			ri.value;
			rInner++;
		});
	});
	rInner = 0;
	ro.value = 1;
	ri.value = 1;
	refDiverges(
		"nested effects are owned by the running effect (no accumulation)",
		"preact",
		innerRuns,
		rInner,
		"signals-core has NO ownership tree — the nested effect from the previous outer run survives and accumulates, so N outer runs leave N live inners; ours disposes the prior inner (Solid's model)",
	);
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
	const ours = [threw, runs];
	ref(
		"createRoot disposes partial effects on a throwing build",
		"solid",
		ours,
		(() => {
			// NOT via solid() — the build itself throws, so the root never hands
			// back a disposer (that is exactly what the law is about).
			let setA = null;
			const r = { n: 0 };
			let caught = false;
			try {
				sCreateRoot(() => {
					const [a, set] = createSignal(0);
					setA = set;
					createEffect(() => {
						a();
						r.n++;
					});
					throw new Error("build boom");
				});
			} catch {
				caught = true;
			}
			r.n = 0;
			setA?.(1);
			return [caught, r.n];
		})(),
	);
	refNone(
		"createRoot disposes partial effects on a throwing build",
		"preact",
		"signals-core has no createRoot/ownership primitive — there is no scope for a throwing build to leak effects OUT of, so the scenario cannot be expressed",
	);
}

// --- Law 20: a write INSIDE untrack still notifies -------------------------
// untrack scopes READ tracking only; it must not suppress writes. A set made
// inside an untrack() still runs the signal's subscribers.
{
	const s = signal(0);
	let runs = 0;
	effect(() => {
		s.value;
		runs++;
	});
	runs = 0;
	untrack(() => {
		s.value = 1;
	});
	law("write inside untrack still notifies", "MATCH", runs === 1, {
		solid: "untrack affects reads, not writes",
		preact: "untracked() same",
		react: "n/a (no fine-grained writes)",
	});
	ref(
		"write inside untrack still notifies",
		"solid",
		runs,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					a();
					r.n++;
				});
				return { setA, r };
			},
			(h) => {
				h.r.n = 0;
				sUntrack(() => {
					h.setA(1);
				});
				return h.r.n;
			},
		),
	);
	const rs = pSignal(0);
	let rn = 0;
	pEffect(() => {
		rs.value;
		rn++;
	});
	rn = 0;
	pUntracked(() => {
		rs.value = 1;
	});
	ref("write inside untrack still notifies", "preact", runs, rn);
}

// --- Law 21: untrack RETURNS the callback's value ---------------------------
{
	const got = untrack(() => 42);
	law("untrack returns the callback value", "MATCH", got === 42, {
		solid: "untrack(fn) returns fn()",
		preact: "untracked(fn) returns fn()",
		react: "n/a",
	});
	ref(
		"untrack returns the callback value",
		"solid",
		got,
		sUntrack(() => 42),
	);
	ref(
		"untrack returns the callback value",
		"preact",
		got,
		pUntracked(() => 42),
	);
}

// --- Law 22: a nested effect is disposed on the parent's RE-RUN --------------
// Distinct from Law 18 (owned-and-disposed-on-parent-DISPOSE): here the parent
// merely RE-RUNS. The running-owner must tear down effects the previous run
// created before the new run, or they leak and double-fire.
{
	const p = signal(0);
	const src = signal(0);
	let innerRuns = 0;
	effect(() => {
		p.value; // parent tracks p
		effect(() => {
			src.value;
			innerRuns++;
		}); // a fresh nested effect each parent run
	});
	p.value = 1; // parent re-runs: old inner disposed, new inner created
	innerRuns = 0;
	src.value = 1; // only the CURRENT inner should react (not a leaked old one)
	law("nested effect disposed on parent re-run", "MATCH", innerRuns === 1, {
		solid: "running-owner disposes prior-run effects before re-run",
		preact: "effect() nested cleanup",
		react: "n/a (component re-render replaces the tree)",
	});
	ref(
		"nested effect disposed on parent re-run",
		"solid",
		innerRuns,
		solid(
			() => {
				const [a, setA] = createSignal(0);
				const [b, setB] = createSignal(0);
				const r = { n: 0 };
				createEffect(() => {
					a();
					createEffect(() => {
						b();
						r.n++;
					});
				});
				return { setA, setB, r };
			},
			(h) => {
				h.setA(1);
				h.r.n = 0;
				h.setB(1);
				return h.r.n;
			},
		),
	);
	const rp = pSignal(0);
	const rsrc = pSignal(0);
	let rInner = 0;
	pEffect(() => {
		rp.value;
		pEffect(() => {
			rsrc.value;
			rInner++;
		});
	});
	rp.value = 1;
	rInner = 0;
	rsrc.value = 1;
	refDiverges(
		"nested effect disposed on parent re-run",
		"preact",
		innerRuns,
		rInner,
		"the prose citation ('effect() nested cleanup') overstates it: signals-core does NOT dispose a nested effect when its creator re-runs, so the leaked one double-fires — measured here, not assumed",
	);
}

// --- Law 23: memo EQUALITY — recompute to the SAME value -------------------
// DIVERGE (intentional, laziness tradeoff). Solid's createMemo runs an equality
// check: if a dependency change recomputes the memo to an === value, it does
// NOT notify downstream. OUR computeds are LAZY (recompute on READ), so the
// notify path can't compare without forcing an eager recompute that would
// defeat laziness — we propagate the source change and the downstream re-runs
// even when the memo value is unchanged. Extra work, never a WRONG value. A
// future opt-in eager-memo could add the short-circuit; today it's a DIVERGE.
{
	const x = signal(2);
	const evenness = computed(() => x.value % 2); // 2%2 === 4%2 === 0
	let downstream = 0;
	effect(() => {
		evenness.value;
		downstream++;
	});
	downstream = 0;
	x.value = 4; // memo recomputes 0 -> 0 (unchanged)
	law(
		"computed recompute to same value still notifies (no memo equality)",
		"DIVERGE",
		downstream === 1,
		{
			solid: "createMemo equality-checks — downstream would NOT run",
			preact: "computed equality-checks — same as Solid",
			react: "useMemo recomputes but re-render is diffed away",
		},
	);
	const why =
		"the reference short-circuits (downstream does NOT run); our computeds are LAZY — recompute happens on READ, so the notify path has no value to compare without an eager recompute that would defeat laziness. Extra work, never a WRONG value";
	refDiverges(
		"computed recompute to same value still notifies (no memo equality)",
		"solid",
		downstream,
		solid(
			() => {
				const [a, setA] = createSignal(2);
				const m = createMemo(() => a() % 2);
				const d = { n: 0 };
				createEffect(() => {
					m();
					d.n++;
				});
				return { setA, d };
			},
			(h) => {
				h.d.n = 0;
				h.setA(4);
				return h.d.n;
			},
		),
		why,
	);
	const rx = pSignal(2);
	const rEven = pComputed(() => rx.value % 2);
	let rDown = 0;
	pEffect(() => {
		rEven.value;
		rDown++;
	});
	rDown = 0;
	rx.value = 4;
	refDiverges(
		"computed recompute to same value still notifies (no memo equality)",
		"preact",
		downstream,
		rDown,
		why,
	);
}

// --- Law 24: a throwing JSX BINDING without a boundary is contained ---------
// DIVERGE (intentional): with NO boundary installed (bare core — render()
// never called, or an app that set a non-rethrowing __spError), a throwing
// binding thunk is caught AT the binding — first render AND re-runs —
// reported with prop+node context, the last good value kept, the rest of the
// app alive. This is the report() ladder's floor; under render()'s DEFAULT
// boundary the same error escalates to the crash screen instead (law 25 —
// the 2026-07 redesign: a silently frozen watchface was judged the wrong
// product default, but the contained floor remains for handler-owned apps).
{
	const reported = [];
	sandbox.__spError = (e) => reported.push(String(e && e.message ? e.message : e));
	const s = signal(1);
	const node = jsx(sandbox.Label, {
		string: () => {
			if (s.value === 2) throw new Error("law24");
			return "ok" + s.value;
		},
	});
	s.value = 2; // binding throws — contained
	const kept = node.string === "ok1" && reported.includes("law24");
	s.value = 3; // still subscribed — recovers
	law(
		"throwing binding without boundary: contained, app survives, recovers",
		"DIVERGE",
		kept && node.string === "ok3",
		{
			solid: "creation errors propagate; render errors go to ErrorBoundary",
			preact: "effect errors propagate to the caller of the write",
			react: "error boundaries unmount the subtree",
		},
	);
	const noBinding =
		"a JSX BINDING is our layer, not a core primitive: neither reference core has a place to catch a render thunk's throw, keep the LAST GOOD value on the node and stay subscribed. The nearest core behavior (an effect throw) is law 15, already pinned there";
	refNone(
		"throwing binding without boundary: contained, app survives, recovers",
		"solid",
		noBinding,
	);
	refNone(
		"throwing binding without boundary: contained, app survives, recovers",
		"preact",
		noBinding,
	);
	sandbox.__spError = undefined;
}

// --- Law 25: render()'s DEFAULT error boundary — crash screen, not freeze ---
// DIVERGE in mechanism, MATCH in philosophy: Solid's <ErrorBoundary> is an
// OPT-IN component that swaps the failed subtree for a fallback; ours is a
// TOP-LEVEL boundary render() installs BY DEFAULT (owner decision: telling
// the wearer the app crashed beats a watch that looks alive but stopped).
// An escaped binding/build error disposes the WHOLE reactive tree, empties
// the Application and paints the error + button hints; SELECT retries the
// build (Solid's `reset` adapted to a watch), BACK rethrows the ORIGINAL
// error (on device: fxAbort → the host exits the mod — loud in the log
// too). `render(..., {boundary:false})` restores propagate semantics.
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} }; // report() logs before painting
	let runs = 0;
	const s = signal(1);
	const app = jsxM.render(() =>
		jsx(sandbox.Container, {
			name: "tree",
			children: jsx(sandbox.Label, {
				string: () => {
					runs++;
					if (s.value === 2) throw new Error("law25");
					return "ok" + s.value;
				},
			}),
		}),
	);
	const before = app.contents[0].name === "tree";
	s.value = 2; // escapes the binding -> boundary -> crash screen
	const crash = app.contents[0];
	const painted =
		app.contents.length === 1 &&
		crash.name !== "tree" &&
		crash.contents[0].string.includes("law25");
	const runsAtCrash = runs;
	s.value = 3; // tree disposed — the binding must not run again
	let killed = false;
	try {
		crash.behavior.onPressBack(crash); // back = exit (select = retry)
	} catch (e) {
		killed = e.message === "law25";
	}
	law(
		"render() default boundary: crash screen + full teardown + exit rethrow",
		"DIVERGE",
		before && painted && runs === runsAtCrash && killed,
		{
			solid: "<ErrorBoundary> is opt-in per subtree; no default top-level one",
			preact: "no boundary primitive — effect errors propagate to the writer",
			react: "class error boundaries, opt-in; unhandled errors unmount the app",
		},
	);
	// Owner policy, deliberately unlike both references — a watchface that looks
	// alive but stopped was judged the wrong default, so render() paints the
	// crash. There is nothing to replay: neither core ships a renderer, let
	// alone a DEFAULT top-level boundary to compare against.
	const noDefault =
		"crash-screen policy: render() installs a DEFAULT top-level boundary that tears the tree down and paints the error with retry/exit hints. Solid has no default boundary (only opt-in <ErrorBoundary>, law 26) and signals-core has none at all — no renderer, nothing to execute";
	refNone(
		"render() default boundary: crash screen + full teardown + exit rethrow",
		"solid",
		noDefault,
	);
	refNone(
		"render() default boundary: crash screen + full teardown + exit rethrow",
		"preact",
		noDefault,
	);
	signals.setSink(null); // restore bare mode for anything after
	sandbox.console = savedC;
}

// --- Law 26: <ErrorBoundary> — opt-in per-subtree catch (Solid parity) -------
// MATCH: this is the Solid feature directly — fallback(err, reset) catches
// BUILD-time and REACTIVE-UPDATE throws in the subtree, keeps the rest of the
// app alive, and reset re-runs the children. (Like Solid, it does NOT catch
// event-handler throws — those run outside the reactive graph.) The DIVERGE is
// only that ours also has a DEFAULT top-level boundary (law 25) that Solid
// lacks; the component contract itself matches.
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} }; // report() logs boundary-caught errors too (pinned in signals.test)
	const bad = signal(0);
	const sib = signal("live");
	let resetFn = null;
	let caughtMsg = null; // captured so the reference can compare like for like
	const [root, disposeRoot] = createRoot(() => {
		const eb = ErrorBoundary({
			width: 80,
			height: 40,
			fallback: (err, reset) => {
				resetFn = reset;
				caughtMsg = err.message;
				return jsx(sandbox.Label, { string: "caught:" + err.message });
			},
			children: () =>
				jsx(sandbox.Label, {
					string: () => {
						if (bad.value === 1) throw new Error("boom");
						return "ok" + bad.value;
					},
				}),
		});
		const s = jsx(sandbox.Label, { string: () => sib.value }); // outside the boundary
		return [eb, s];
	});
	const inner = (h) => h.contents[0].contents[0];
	const before = inner(root[0]).string === "ok0";
	// guarded so "did it reach the WRITER?" is observable — the boundary must
	// swallow it (the signals-core reference below does not).
	let propagated = false;
	try {
		bad.value = 1; // reactive-update throw -> caught, fallback swapped in
	} catch {
		propagated = true;
	}
	const caught = inner(root[0]).string === "caught:boom";
	sib.value = "still-live";
	const sibAlive = root[1].string === "still-live"; // rest of the app unaffected
	bad.value = 2; // heal the source
	resetFn(); // reset -> children re-run, now healthy
	const recovered = inner(root[0]).string === "ok2";
	law(
		"<ErrorBoundary> catches subtree throws; siblings live; reset recovers",
		"MATCH",
		before && caught && sibAlive && recovered && !propagated,
		{
			solid: "createErrorBoundary — fallback(err, reset), same contract",
			preact: "no boundary primitive (preact/signals core)",
			react: "class error boundaries — componentDidCatch + manual reset",
		},
	);
	// catchError is the CORE primitive under Solid's <ErrorBoundary>; it covers
	// the catch + siblings-live half of the law exactly. The `reset` half rides
	// on the <ErrorBoundary> COMPONENT (its fallback's 2nd arg), which needs a
	// renderer — so reset stays proven by our own assertion above, not replayed.
	ref(
		"<ErrorBoundary> catches subtree throws; siblings live; reset recovers",
		"solid",
		[caughtMsg, root[1].string],
		solid(
			() => {
				const [b, setBad] = createSignal(0);
				const [sv, setSib] = createSignal("live");
				const box = { caught: null, sib: null };
				catchError(
					() => {
						createEffect(() => {
							if (b() === 1) throw new Error("boom");
						});
					},
					(e) => {
						box.caught = e.message;
					},
				);
				createEffect(() => {
					box.sib = sv();
				});
				return { setBad, setSib, box };
			},
			(h) => {
				h.setBad(1);
				h.setSib("still-live");
				return [h.box.caught, h.box.sib];
			},
		),
	);
	const rBad = pSignal(0);
	const rSib = pSignal("live");
	let rSibSeen = null;
	pEffect(() => {
		if (rBad.value === 1) throw new Error("boom");
	});
	pEffect(() => {
		rSibSeen = rSib.value;
	});
	let rPropagated = false;
	try {
		rBad.value = 1;
	} catch {
		rPropagated = true;
	}
	rSib.value = "still-live";
	refDiverges(
		"<ErrorBoundary> catches subtree throws; siblings live; reset recovers",
		"preact",
		[propagated, root[1].string],
		[rPropagated, rSibSeen],
		"signals-core has no boundary primitive: siblings survive (same as ours) but the subtree error propagates to the WRITER instead of being swapped for a fallback that a reset can heal",
	);
	disposeRoot();
	sandbox.console = savedC;
}

// --- Law 27: self-write inside an effect converges (no runaway settle) -------
// An effect that WRITES a signal it also READS is the classic infinite-loop
// hazard. Two guards make it safe here: an equal-value write is skipped
// entirely (law 8's skip applies inside effects too), and a monotone write
// re-runs once per settle TURN until the value stops changing — a fixpoint,
// not a synchronous hang. A never-stabilizing write still loops (that is the
// app's bug in every fine-grained library, Solid included).
{
	const s1 = signal(1);
	let runs1 = 0;
	const e1 = signals.effect(() => {
		runs1++;
		s1.value = s1.value; // equal → skipped → terminates immediately
	});
	s1.value = 2;
	const equalTerminates = runs1 === 2; // initial + the one real change

	const s2 = signal(0);
	let runs2 = 0;
	const e2 = signals.effect(() => {
		runs2++;
		if (s2.value < 3) s2.value = s2.value + 1; // monotone toward fixpoint
	});
	const converged = s2.value === 3 && runs2 === 4; // initial + one per turn
	law(
		"self-write in effect: equal-skip terminates; monotone converges",
		"MATCH",
		equalTerminates && converged,
		{
			solid: "createEffect writing its own dep re-runs until the value stabilizes",
			preact: "effect writing its dep loops until stable (same fixpoint contract)",
			react: "setState-in-effect re-renders until state stabilizes",
		},
	);
	const ours = [runs1, s2.value, runs2];
	ref(
		"self-write in effect: equal-skip terminates; monotone converges",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const r1 = { n: 0 };
				createEffect(() => {
					r1.n++;
					setA(a()); // equal → skipped → terminates immediately
				});
				const [b, setB] = createSignal(0);
				const r2 = { n: 0 };
				createEffect(() => {
					r2.n++;
					if (b() < 3) setB(b() + 1);
				});
				return { setA, r1, b, r2 };
			},
			(h) => {
				h.setA(2);
				return [h.r1.n, h.b(), h.r2.n];
			},
		),
	);
	const ra = pSignal(1);
	let rRuns1 = 0;
	const rDispose1 = pEffect(() => {
		rRuns1++;
		ra.value = ra.value;
	});
	ra.value = 2;
	const rb = pSignal(0);
	let rRuns2 = 0;
	const rDispose2 = pEffect(() => {
		rRuns2++;
		if (rb.value < 3) rb.value = rb.value + 1;
	});
	ref("self-write in effect: equal-skip terminates; monotone converges", "preact", ours, [
		rRuns1,
		rb.value,
		rRuns2,
	]);
	rDispose1();
	rDispose2();
	signals.dispose(e1);
	signals.dispose(e2);
}

// --- Law 28: a throwing computed poisons the READ, then heals ----------------
// Lazy computeds recompute on read, so a throwing fn propagates the error to
// the READER (whose own guard — binding/notify/boundary — decides policy), and
// a read AFTER the dependency changes recomputes cleanly. Solid's memo has the
// same observable contract (the exception surfaces at read; recompute heals).
{
	const s = signal(1);
	const c = computed(() => {
		if (s.value === 2) throw new Error("law28");
		return s.value * 10;
	});
	const okBefore = c.value === 10;
	// the write is guarded so WHERE the throw surfaces is observable — lazily it
	// must be the READ, never the writer (see the Solid divergence below).
	let atWrite = false;
	try {
		s.value = 2;
	} catch {
		atWrite = true;
	}
	let threw = false;
	try {
		void c.value;
	} catch (e) {
		threw = e.message === "law28";
	}
	s.value = 3;
	const healed = c.value === 30;
	law(
		"computed throw surfaces at read; recompute heals",
		"MATCH",
		okBefore && !atWrite && threw && healed,
		{
			solid: "createMemo rethrows at read; recomputes once a dep changes",
			preact: "computed rethrows on .value until a dependency changes",
			react: "useMemo throw fails the render; next render recomputes",
		},
	);
	const ours = [okBefore, atWrite, threw, c.value];
	refDiverges(
		"computed throw surfaces at read; recompute heals",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const m = createMemo(() => {
					if (a() === 2) throw new Error("law28");
					return a() * 10;
				});
				return { setA, m, ok: m() === 10 };
			},
			(h) => {
				let w = false;
				try {
					h.setA(2);
				} catch (e) {
					w = e.message === "law28";
				}
				let r = false;
				try {
					void h.m();
				} catch (e) {
					r = e.message === "law28";
				}
				h.setA(3);
				return [h.ok, w, r, h.m()];
			},
		),
		"the prose citation is half right: Solid's createMemo is EAGER, so the recompute happens during the WRITE and the throw surfaces at the writer as well as at the read. Ours is lazy — the read is the only place it can surface",
	);
	const rs = pSignal(1);
	const rc = pComputed(() => {
		if (rs.value === 2) throw new Error("law28");
		return rs.value * 10;
	});
	const rOk = rc.value === 10;
	let rAtWrite = false;
	try {
		rs.value = 2;
	} catch {
		rAtWrite = true;
	}
	let rThrew = false;
	try {
		void rc.value;
	} catch (e) {
		rThrew = e.message === "law28";
	}
	rs.value = 3;
	ref("computed throw surfaces at read; recompute heals", "preact", ours, [
		rOk,
		rAtWrite,
		rThrew,
		rc.value,
	]);
}

// --- Law 28b: an EFFECT that reads a throwing computed still SUBSCRIBES, so a
// later dep change re-runs it and the UI recovers. The reader is subscribed to
// the computed's row BEFORE the recompute, so a first-read throw (contained by
// __spError) can't skip the subscribe and strand the effect. The effect's
// FIRST read is a CLEAN one (subscribe), THEN a dep flips it into throwing and
// back — proving the subscription survives the throw and the effect re-runs on
// heal (a top-level effect that throws on its INITIAL run is a separate,
// un-owned-lifecycle case, kept out of this shared-id suite).
{
	let captured = null;
	sandbox.__spError = (e) => {
		captured = e.message;
	};
	const s = signal(1);
	const c = computed(() => {
		if (s.value === 2) throw new Error("law28b");
		return s.value * 10;
	});
	const seen = [];
	const [, disposeL28b] = createRoot(() => {
		effect(() => {
			seen.push(c.value); // run 1: clean (10) — subscribes to c's row
		});
	});
	const clean = seen.length === 1 && seen[0] === 10;
	s.value = 2; // c now THROWS on recompute; the effect re-runs and is contained
	const threw = captured === "law28b";
	s.value = 4; // heal: the effect must re-run again and read 40
	law(
		"effect keeps its computed subscription across a throw and heals",
		"MATCH",
		clean && threw && seen[seen.length - 1] === 40,
		{
			solid: "the memo's subscribers are notified on recompute; the reader recovers",
			preact: "signal subscribers re-run once the computed stops throwing",
			react: "a later render reads the healed memo",
		},
	);
	const ours = seen.join(",");
	refDiverges(
		"effect keeps its computed subscription across a throw and heals",
		"solid",
		ours,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const s2 = [];
				catchError(
					() => {
						const m = createMemo(() => {
							if (a() === 2) throw new Error("law28b");
							return a() * 10;
						});
						createEffect(() => s2.push(m()));
					},
					() => {},
				);
				return { setA, s2 };
			},
			(h) => {
				h.setA(2); // caught by the boundary
				h.setA(4); // heal — does the effect come back?
				return h.s2.join(",");
			},
		),
		"a caught error DISPOSES the failed subtree under Solid's boundary contract, so the effect never re-runs when the dependency heals; ours keeps the subscription (the reader subscribes to the computed's row BEFORE the recompute) and recovers on its own",
	);
	const rs = pSignal(1);
	const rc = pComputed(() => {
		if (rs.value === 2) throw new Error("law28b");
		return rs.value * 10;
	});
	const rSeen = [];
	pEffect(() => {
		rSeen.push(rc.value);
	});
	try {
		rs.value = 2; // signals-core rethrows at the writer; the subscription survives
	} catch {}
	rs.value = 4;
	ref(
		"effect keeps its computed subscription across a throw and heals",
		"preact",
		ours,
		rSeen.join(","),
	);
	disposeL28b();
	delete sandbox.__spError;
}

// --- Law 29: effect() created inside untrack still tracks ITS OWN reads ------
// untrack() suppresses subscriptions of the CURRENTLY-RUNNING computation; a
// NEW effect created inside the untrack window runs with its own tracking
// scope and must subscribe normally (untrack is about reads, not creation).
{
	const s = signal(1);
	let runs = 0;
	let id = -1;
	untrack(() => {
		id = signals.effect(() => {
			runs++;
			void s.value;
		});
	});
	s.value = 2;
	law("effect created inside untrack tracks its own reads", "MATCH", runs === 2, {
		solid: "createEffect inside untrack still tracks its own scope",
		preact: "effect() inside untracked() subscribes normally",
		react: "n/a (no untrack primitive)",
	});
	ref(
		"effect created inside untrack tracks its own reads",
		"solid",
		runs,
		solid(
			() => {
				const [a, setA] = createSignal(1);
				const r = { n: 0 };
				sUntrack(() => {
					createEffect(() => {
						r.n++;
						void a();
					});
				});
				return { setA, r };
			},
			(h) => {
				h.setA(2);
				return h.r.n;
			},
		),
	);
	const rs = pSignal(1);
	let rn = 0;
	const rDispose = pUntracked(() =>
		pEffect(() => {
			rn++;
			void rs.value;
		}),
	);
	rs.value = 2;
	ref("effect created inside untrack tracks its own reads", "preact", runs, rn);
	rDispose();
	signals.dispose(id);
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

// --- reference column: what actually RAN ------------------------------------
const live = refLog.filter((r) => r.kind === "live");
const pinned = refLog.filter((r) => r.kind === "diverge");
const executed = new Set([...live, ...pinned].map((r) => r.name));
const documented = parity.filter((p) => !executed.has(p.name));
console.log("\n--- reference column: EXECUTED (solid-js + @preact/signals-core, devDeps) ---");
console.log(
	`  ${executed.size}/${parity.length} laws replay a LIVE reference — ${live.length} reference checks MATCH, ${pinned.length} pin an intentional divergence`,
);
for (const r of pinned) console.log(`  ≠ ${r.name} [${r.lib}] — ${r.why}`);
console.log(`  ${documented.length} laws have NO analogue in either core (documented, by reason):`);
for (const p of documented)
	for (const r of refLog.filter((x) => x.name === p.name)) console.log(`  · ${p.name} [${r.lib}]`);
console.log(
	"  React stays DOCUMENTED: its test-utils need a renderer + a DOM, so there is no headless core to replay a law against.",
);

done();
