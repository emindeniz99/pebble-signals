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
const { ErrorBoundary } = jsxM; // moved to jsx-runtime (boot-floor round)
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
}

// --- Law 21: untrack RETURNS the callback's value ---------------------------
{
	const got = untrack(() => 42);
	law("untrack returns the callback value", "MATCH", got === 42, {
		solid: "untrack(fn) returns fn()",
		preact: "untracked(fn) returns fn()",
		react: "n/a",
	});
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
	const [root, disposeRoot] = createRoot(() => {
		const eb = ErrorBoundary({
			width: 80,
			height: 40,
			fallback: (err, reset) => {
				resetFn = reset;
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
	bad.value = 1; // reactive-update throw -> caught, fallback swapped in
	const caught = inner(root[0]).string === "caught:boom";
	sib.value = "still-live";
	const sibAlive = root[1].string === "still-live"; // rest of the app unaffected
	bad.value = 2; // heal the source
	resetFn(); // reset -> children re-run, now healthy
	const recovered = inner(root[0]).string === "ok2";
	law(
		"<ErrorBoundary> catches subtree throws; siblings live; reset recovers",
		"MATCH",
		before && caught && sibAlive && recovered,
		{
			solid: "createErrorBoundary — fallback(err, reset), same contract",
			preact: "no boundary primitive (preact/signals core)",
			react: "class error boundaries — componentDidCatch + manual reset",
		},
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
	s.value = 2;
	let threw = false;
	try {
		void c.value;
	} catch (e) {
		threw = e.message === "law28";
	}
	s.value = 3;
	const healed = c.value === 30;
	law("computed throw surfaces at read; recompute heals", "MATCH", okBefore && threw && healed, {
		solid: "createMemo rethrows at read; recomputes once a dep changes",
		preact: "computed rethrows on .value until a dependency changes",
		react: "useMemo throw fails the render; next render recomputes",
	});
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

done();
