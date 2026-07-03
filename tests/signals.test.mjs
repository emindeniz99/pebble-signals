// Reactive core suite — mirrors the assertions verified on XS in M1
// (on-device the verdict renders as a Piu label; here it exits nonzero).
import { signal, effect, computed, untrack, createRoot, onCleanup, track, useEffect, dispose, useState, useMemo, S }
	from "../src/embeddedjs/runtime/signals.js";
import { makeChecker } from "./load-runtime.mjs";

const { check, done } = makeChecker("signals");

// 1. signal -> effect fires on set
const a = signal(1);
let seen = [];
const e1 = effect(() => seen.push(a.value));
a.value = 2;
check("effect fires", seen.join(",") === "1,2");

// 2. same-value set is a no-op
a.value = 2;
check("no-op on equal set", seen.length === 2);

// 3. disposal stops updates
dispose(e1);
a.value = 3;
check("disposer works", seen.length === 2);

// 4. re-run tracks new deps (dynamic dependencies)
const useB = signal(true), b = signal(10), c = signal(20);
let out = [];
effect(() => out.push(useB.value ? b.value : c.value));
useB.value = false;      // now depends on c, not b
b.value = 11;            // must NOT re-run
check("old dep dropped", out.join(",") === "10,20");
c.value = 21;            // must re-run
check("new dep tracked", out.join(",") === "10,20,21");

// 5. computed chains
const n = signal(2);
const sq = computed(() => n.value * n.value);
let sqSeen = [];
effect(() => sqSeen.push(sq.value));
n.value = 3;
check("computed updates", sqSeen.join(",") === "4,9");

// 6. createRoot disposal runs cleanups and kills tracked effects
const src = signal(0);
let runs = 0, cleanups = 0;
const [, disposeRoot] = createRoot(() => {
	track(effect(() => { src.value; runs++; }));
	onCleanup(() => cleanups++);
});
src.value = 1;
check("root effect runs", runs === 2);
disposeRoot();
src.value = 2;
check("root disposal stops effect", runs === 2);
check("onCleanup ran", cleanups === 1);

// 7. untrack reads without subscribing
const u = signal(1);
let uRuns = 0;
effect(() => { untrack(() => u.value); uRuns++; });
u.value = 2;
check("untrack does not subscribe", uRuns === 1);

// 8. hooks layer
const [count, setCount] = useState(0);
const dbl = useMemo(() => count() * 2);
setCount(v => v + 2);
check("useState functional update", count() === 2);
check("useMemo tracks", dbl() === 4);

// 9. subscriber exceptions are isolated behind the __spError hook
const errs = [];
globalThis.__spError = e => errs.push(String(e.message || e));
const boom = signal(0);
let after = 0;
effect(() => { if (boom.value === 1) throw new Error("kaboom"); });
effect(() => { boom.value; after++; });
boom.value = 1;
check("throwing subscriber isolated", errs.length === 1 && errs[0] === "kaboom");
check("later subscribers still ran", after === 2);
delete globalThis.__spError;

// 10. an effect disposed by an earlier subscriber in the same notification
// must NOT resurrect (the zombie bug: it would re-subscribe forever)
const z = signal(0);
let zombieRuns = 0;
let disposeLater = null;
effect(() => {           // subscriber #1: kills subscriber #2 when z hits 1
	if (z.value === 1 && disposeLater) dispose(disposeLater);
});
disposeLater = effect(() => { z.value; zombieRuns++; });   // subscriber #2
z.value = 1;             // #1 disposes #2 mid-notification
check("disposed-mid-notification effect did not run again", zombieRuns === 1);
z.value = 2;
check("zombie stays dead", zombieRuns === 1);

// 11. useEffect cleanup runs BEFORE each re-run and once at dispose,
// including cleanups returned by re-runs
const dep = signal(0);
const log = [];
const [, disposeFx] = createRoot(() => {
	useEffect(() => {
		const at = dep.value;
		log.push("run" + at);
		return () => log.push("clean" + at);
	});
});
dep.value = 1;
dep.value = 2;
disposeFx();
check("cleanup-before-rerun contract",
	log.join(",") === "run0,clean0,run1,clean1,run2,clean2");

// 12. computed created inside a root stops when the root is disposed
const cSrc = signal(1);
let computes = 0;
const [sq2, disposeC] = createRoot(() => computed(() => { computes++; return cSrc.value * 2; }));
check("computed initial", sq2.value === 2 && computes === 1);
cSrc.value = 2;
check("computed tracked", sq2.value === 4 && computes === 2);
disposeC();
cSrc.value = 3;
check("computed dead after root dispose", computes === 2);

// 13. packed-signal API (S) — the Stage 2 lowering target
const px = S.sig(10);
let pSeen = [];
const pe = effect(() => pSeen.push(S.get(px)));
check("S initial read", pSeen.join(",") === "10");
S.set(px, 11);
check("S set notifies", pSeen.join(",") === "10,11");
S.set(px, v => v + 9);
check("S functional update", pSeen.join(",") === "10,11,20");
S.set(px, 20);
check("S equal set is a no-op", pSeen.length === 3);
dispose(pe);
S.set(px, 99);
check("S disposed effect silent", pSeen.length === 3);
// packed + object signals share one graph
const mix = signal(1);
const px2 = S.sig(2);
let mixSeen = 0;
effect(() => { mix.value; S.get(px2); mixSeen++; });
mix.value = 5;
S.set(px2, 7);
check("mixed graph both notify", mixSeen === 3);

// 14. packed computed (S.computed) — the Stage-3 lowering target for
// computed()/useMemo(). Derives into a value slot via an internal effect;
// reads track it, and it re-notifies its own subscribers on recompute.
const cbase = S.sig(3);
const cder = S.computed(() => S.get(cbase) * 10);
check("S.computed initial derived", S.get(cder) === 30);
const cSeen = [];
const ce = effect(() => cSeen.push(S.get(cder)));
check("S.computed read seeds subscriber", cSeen.join(",") === "30");
S.set(cbase, 4);							// upstream change recomputes + re-notifies
check("S.computed recomputes on dep change", S.get(cder) === 40 && cSeen.join(",") === "30,40");
dispose(ce);

// disposing a computed created inside a root stops its internal effect
let cRuns = 0;
const rbase = S.sig(1);
const [, rootDispose] = createRoot(() => { S.computed(() => { cRuns++; return S.get(rbase); }); });
check("S.computed in root ran once", cRuns === 1);
S.set(rbase, 2);
check("S.computed in root tracked", cRuns === 2);
rootDispose();
S.set(rbase, 3);
check("S.computed dead after root dispose", cRuns === 2);

done();
