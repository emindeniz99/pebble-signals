// Reactive core suite — mirrors the assertions verified on XS in M1
// (on-device the verdict renders as a Piu label; here it exits nonzero).
import { signal, effect, computed, untrack, createRoot, onCleanup, track, useEffect, dispose }
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
const { useState, useMemo } = await import("../src/embeddedjs/runtime/signals.js");
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

done();
