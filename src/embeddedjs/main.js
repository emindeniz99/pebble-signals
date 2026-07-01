// M1 — smoke-test the reactive core (signals + owner) on XS.
import { signal, effect, computed, untrack } from "runtime/signals";
import { createRoot, onCleanup, track } from "runtime/owner";

let pass = 0, fail = 0;
function check(name, cond) {
	if (cond) { pass++; console.log("PASS " + name); }
	else { fail++; console.log("FAIL " + name); }
}

// 1. signal -> effect fires on set
const a = signal(1);
let seen = [];
const dispose1 = effect(() => seen.push(a.value));
a.value = 2;
check("effect fires", seen.join(",") === "1,2");

// 2. same-value set is a no-op
a.value = 2;
check("no-op on equal set", seen.length === 2);

// 3. disposer stops updates
dispose1();
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

const verdict = `M1: ${pass} pass, ${fail} fail`;
console.log(verdict);

const style = new Style({ font: "24px Gothic", color: "white" });
const M1Application = Application.template($ => ({
	skin: new Skin({ fill: fail ? "red" : "black" }),
	style,
	contents: [
		Label($, { left: 0, right: 0, string: verdict }),
	],
}));

export default new M1Application({});
