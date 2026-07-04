// Reactive core suite — mirrors the assertions verified on XS in M1
// (on-device the verdict renders as a Piu label; here it exits nonzero).
import {
	signal,
	effect,
	computed,
	untrack,
	createRoot,
	onCleanup,
	track,
	useEffect,
	dispose,
	useState,
	useMemo,
	useRef,
	useReducer,
	onMount,
	createContext,
	useContext,
	provide,
	batch,
	S,
} from "../src/embeddedjs/runtime-build/signals.js";
import { makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("signals");

// 0. a write before ANY graph exists (no effect/packed signal yet) is safe —
// nothing to version-bump or notify (the lazy-G fast path)
const pre = signal(0);
pre.value = 1;
check("write before graph exists is safe", pre.value === 1);

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
const useB = signal(true),
	b = signal(10),
	c = signal(20);
let out = [];
effect(() => out.push(useB.value ? b.value : c.value));
useB.value = false; // now depends on c, not b
b.value = 11; // must NOT re-run
check("old dep dropped", out.join(",") === "10,20");
c.value = 21; // must re-run
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
let runs = 0,
	cleanups = 0;
const [, disposeRoot] = createRoot(() => {
	track(
		effect(() => {
			src.value;
			runs++;
		}),
	);
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
effect(() => {
	untrack(() => u.value);
	uRuns++;
});
u.value = 2;
check("untrack does not subscribe", uRuns === 1);

// 8. hooks layer
const [count, setCount] = useState(0);
const dbl = useMemo(() => count() * 2);
setCount((v) => v + 2);
check("useState functional update", count() === 2);
check("useMemo tracks", dbl() === 4);

// 9. subscriber exceptions are isolated behind the __spError hook
const errs = [];
globalThis.__spError = (e) => errs.push(String(e.message || e));
const boom = signal(0);
let after = 0;
effect(() => {
	if (boom.value === 1) throw new Error("kaboom");
});
effect(() => {
	boom.value;
	after++;
});
boom.value = 1;
check("throwing subscriber isolated", errs.length === 1 && errs[0] === "kaboom");
check("later subscribers still ran", after === 2);
delete globalThis.__spError;

// 10. an effect disposed by an earlier subscriber in the same notification
// must NOT resurrect (the zombie bug: it would re-subscribe forever)
const z = signal(0);
let zombieRuns = 0;
let disposeLater = null;
effect(() => {
	// subscriber #1: kills subscriber #2 when z hits 1
	if (z.value === 1 && disposeLater) dispose(disposeLater);
});
disposeLater = effect(() => {
	z.value;
	zombieRuns++;
}); // subscriber #2
z.value = 1; // #1 disposes #2 mid-notification
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
check("cleanup-before-rerun contract", log.join(",") === "run0,clean0,run1,clean1,run2,clean2");

// 12. computed created inside a root stops when the root is disposed
const cSrc = signal(1);
let computes = 0;
const [sq2, disposeC] = createRoot(() =>
	computed(() => {
		computes++;
		return cSrc.value * 2;
	}),
);
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
S.set(px, (v) => v + 9);
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
effect(() => {
	mix.value;
	S.get(px2);
	mixSeen++;
});
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
S.set(cbase, 4); // upstream change recomputes + re-notifies
check("S.computed recomputes on dep change", S.get(cder) === 40 && cSeen.join(",") === "30,40");
dispose(ce);

// disposing a computed created inside a root FREEZES it (2026-07 lazy
// round): computeds recompute on READ, never on notify — so fn does not run
// at creation, runs on first read, revalidates per read after writes, and a
// disposed computed stops recomputing (frozen at its last value).
let cRuns = 0;
const rbase = S.sig(1);
const [rcid, rootDispose] = createRoot(() =>
	S.computed(() => {
		cRuns++;
		return S.get(rbase);
	}),
);
check("S.computed is lazy — no run before the first read", cRuns === 0);
check("S.computed first read computes", S.get(rcid) === 1 && cRuns === 1);
check("S.computed cached read does not recompute", S.get(rcid) === 1 && cRuns === 1);
S.set(rbase, 2);
check("S.computed read after write recomputes", S.get(rcid) === 2 && cRuns === 2);
rootDispose();
S.set(rbase, 3);
check("S.computed frozen after root dispose", S.get(rcid) === 2 && cRuns === 2);

// 14b. S.put — the Stage-3 target for direct `s.value = e`. Unlike S.set
// (useState's functional-update contract), put stores a FUNCTION verbatim:
// this is the object-API semantic, and lowering must not change it.
const pf = S.sig(null);
const stored = () => "i am data, not an updater";
S.put(pf, stored);
check("S.put stores a function verbatim", S.get(pf) === stored);
S.set(pf, () => 42); // set: same function value would be CALLED
check("S.set unwraps functional update", S.get(pf) === 42);
let putSeen = 0;
const pe2 = effect(() => {
	S.get(pf);
	putSeen++;
});
S.put(pf, 42); // equal value: no notify
check("S.put equal set is a no-op", putSeen === 1);
S.put(pf, 43);
check("S.put notifies on change", putSeen === 2);
dispose(pe2);

// 15. effect cap lifted (#21): >32 simultaneous live effects. The subscriber
// mask, used/quarantine sets grow from one u32 word to a multi-word stride
// once the 33rd effect is allocated. Verifies independent firing across word
// boundaries, a single signal watched by effects spanning >1 word, and that
// disposing a high-id effect frees its slot for reuse.
const N = 50;
const sigs = [],
	fires = new Array(N).fill(0),
	effs = [];
for (let k = 0; k < N; k++) {
	const s = signal(k);
	sigs.push(s);
	effs.push(
		effect(() => {
			s.value;
			fires[k]++;
		}),
	); // each watches its OWN signal
}
check(
	"50 effects all ran once (crossed 32 cap)",
	fires.every((f) => f === 1),
);
for (let k = 0; k < N; k++) sigs[k].value = 1000 + k;
check(
	"50 effects re-fire independently across words",
	fires.every((f) => f === 2),
);

// one signal watched by 40 effects — subscriber mask spans >1 word
const shared = signal(0);
let sharedCount = 0;
const shEffs = [];
for (let k = 0; k < 40; k++)
	shEffs.push(
		effect(() => {
			shared.value;
			sharedCount++;
		}),
	);
sharedCount = 0;
shared.value = 1;
check("40 effects on one signal all fire (cross-word subscriber mask)", sharedCount === 40);

// dispose a high-id effect; a fresh effect reuses a freed slot and still fires
dispose(shEffs[39]);
const reused = effect(() => {
	shared.value;
	sharedCount++;
}); // reclaims a freed id, runs once
sharedCount = 0; // count only the notification pass
shared.value = 2;
check("high-id dispose frees slot; reused effect keeps live count at 40", sharedCount === 40);

for (const e of effs) dispose(e);
for (let k = 0; k < 39; k++) dispose(shEffs[k]);
dispose(reused);

// 16. batch() — N writes, ONE notification pass per touched signal
const bx = signal(0),
	by = signal(0);
let bruns = 0;
const be = effect(() => {
	bx.value;
	by.value;
	bruns++;
});
batch(() => {
	bx.value = 1;
	bx.value = 2;
	by.value = 3;
});
check("batch coalesces to one run", bruns === 2); // 1 initial + 1 batched
check("batch wrote final values", bx.value === 2 && by.value === 3);
check(
	"reads inside batch see new value",
	batch(() => {
		bx.value = 9;
		return bx.value;
	}) === 9,
);
bruns = 0;
batch(() => {
	batch(() => {
		bx.value = 10;
	});
	by.value = 11;
}); // nested: flush at OUTER end
check("nested batch flushes once at outer end", bruns === 1);
try {
	batch(() => {
		bx.value = 20;
		throw new Error("boom");
	});
} catch {}
check("batch is exception-safe (still flushed)", bx.value === 20 && bruns === 2);
const pbx = S.sig(0);
let pbruns = 0;
const pbe = effect(() => {
	S.get(pbx);
	pbruns++;
});
batch(() => {
	S.set(pbx, 1);
	S.put(pbx, 2);
});
check("batch covers packed set/put too", pbruns === 2 && S.get(pbx) === 2);
dispose(be);
dispose(pbe);

// 17. useRef — mutable box, never notifies
const r1 = useRef(5);
let rruns = 0;
const re = effect(() => {
	r1.current;
	rruns++;
}); // reading .current tracks NOTHING
r1.current = 6;
check("useRef holds and never notifies", r1.current === 6 && rruns === 1);
dispose(re);

// 18. coverage: remaining branches
// useState plain-value setter (non-functional)
const [pv, setPv] = useState(1);
setPv(9);
check("useState plain-value set", pv() === 9);

// dispose(function) runs it; dispose(invalid id) is a silent no-op
let dran = 0;
dispose(() => dran++);
check("dispose(function) runs it", dran === 1);
dispose(99999); // no such effect id
check("dispose(invalid) is a no-op", true);

// throwing subscriber with NO __spError hook rethrows (default path)
const th = signal(0);
let propagated = false;
effect(() => {
	if (th.value === 1) throw new Error("nohook");
});
try {
	th.value = 1;
} catch (e) {
	propagated = e.message === "nohook";
}
check("throwing subscriber rethrows without hook", propagated);

// high-word effect (id > 31) disposed MID-cascade -> qh quarantine path.
// Pad past 32 so the victim lands in word 1, then dispose it from a
// co-subscriber during the notification.
const pad2 = [];
for (let k = 0; k < 34; k++) {
	const sg = signal(0);
	pad2.push(
		effect(() => {
			sg.value;
		}),
	);
}
const trig = signal(0);
let victim = null,
	killerRan = 0;
effect(() => {
	if (trig.value === 1 && victim !== null) {
		dispose(victim);
		killerRan++;
	}
});
victim = effect(() => {
	trig.value;
}); // id > 31 (word 1)
check("victim is a high-word id", victim > 31);
trig.value = 1; // killer disposes victim mid-cascade (dep>0)
check("high-word mid-cascade dispose (qh path) ok", killerRan === 1);
for (const e of pad2) dispose(e);

// 19. useReducer over useState
const [rstate, dispatch] = useReducer((s, a) => (a === "inc" ? s + 1 : s - 1), 10);
dispatch("inc");
dispatch("inc");
dispatch("dec");
check("useReducer applies actions", rstate() === 11);

// 20. onMount runs fn once, untracked (no subscription)
const om = signal(0);
let omRuns = 0;
onMount(() => {
	om.value;
	omRuns++;
});
om.value = 1; // must NOT re-run onMount
check("onMount runs once untracked", omRuns === 1);

// 21. context: provide sets the value for the synchronous subtree build
const Theme = createContext("light");
check("useContext default", useContext(Theme) === "light");
let inside = null;
const outside = provide(Theme, "dark", () => {
	inside = useContext(Theme);
	return useContext(Theme);
});
check("provide scopes value during build", inside === "dark" && outside === "dark");
check("provide restores after build", useContext(Theme) === "light");

// 22. glitch-free, the ADVERSARIAL shape: the sink ALSO reads the source
// directly. Version-validated lazy pull means the sink can never observe a
// stale computed regardless of notification order — every observed value is
// arithmetically consistent (may run more than once across turns, but each
// run sees a coherent snapshot).
{
	const src = signal(1);
	const dbl = computed(() => src.value * 2);
	const glitches = [];
	effect(() => {
		// consistent iff dbl is exactly twice src AT THE MOMENT of the read
		if (dbl.value !== src.value * 2) glitches.push([src.value, dbl.value]);
	});
	src.value = 5;
	src.value = 9;
	check("mixed direct+derived sink never sees a stale computed", glitches.length === 0);
}

// 23. running-owner: onCleanup inside an effect fires before every re-run and
// once more at dispose; a second trackable in the same run shares the list
{
	const o = signal(0);
	const log = [];
	const e = effect(() => {
		const v = o.value;
		log.push("run" + v);
		onCleanup(() => log.push("cleanA" + v));
		onCleanup(() => log.push("cleanB" + v));
	});
	o.value = 1;
	dispose(e);
	check(
		"running-owner cleanups fire per re-run and at dispose",
		log.join(",") === "run0,cleanB0,cleanA0,run1,cleanB1,cleanA1",
	);
}

// 24. coalescing dedupes the SAME row written twice in one batch, and the
// effect still runs exactly once with the final value
{
	const x = signal(0);
	const got = [];
	effect(() => got.push(x.value));
	batch(() => {
		x.value = 1;
		x.value = 2;
	});
	check("same-row double write in a batch notifies once", got.join(",") === "0,2");
}

done();
