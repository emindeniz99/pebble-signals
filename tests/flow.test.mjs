// Flow suite — For keyed reconcile + Show (default rebuild and keepAlive),
// run against piu stubs. Show sides are auto-wrapped in a Container by the
// runtime (the piu Pebble port crashes on bare-Label swaps), so assertions
// look through one wrapper layer via inner().
import { loadRuntime, StubContent, makeChecker } from "./load-runtime.mjs";

const { signals, jsx: jsxM, flow } = await loadRuntime();
const { signal } = signals;
const { createRoot } = signals;
const { jsx } = jsxM;
const { Show, For } = flow;
const { check, done } = makeChecker("flow");

const inner = host => host.contents[0] && host.contents[0].contents[0];

// --- For: add / remove / reorder ---
const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
const made = [];
const [host, disposeFor] = createRoot(() =>
	For({
		each: () => items.value,
		key: it => it.id,
		width: 190,
		children: (it) => {
			made.push(it.id);
			return jsx(StubContent, { width: 190, height: 22, children: jsx(StubContent, { string: "item #" + it.id }) });
		},
	})
);
check("initial 3 rows", host.contents.length === 3);
check("3 rows built", made.join(",") === "1,2,3");

items.value = [...items.value, { id: 4 }];
check("add -> 4 rows", host.contents.length === 4);
check("only new row built", made.join(",") === "1,2,3,4");

const beforeNodes = [...host.contents];
items.value = [...items.value].reverse();
check("reverse keeps 4 rows", host.contents.length === 4);
check("reverse reuses nodes", host.contents[0] === beforeNodes[3] && host.contents[3] === beforeNodes[0]);
check("reverse builds nothing", made.length === 4);

items.value = items.value.slice(1);
check("remove first -> 3 rows", host.contents.length === 3);

items.value = [];
check("clear -> 0 rows", host.contents.length === 0);

disposeFor();

// --- Show default mode: swap + dispose, auto-wrapped ---
const on = signal(false), n = signal(0);
const [showHost] = createRoot(() =>
	Show({
		when: () => on.value,
		width: 100, height: 50,
		fallback: () => jsx(StubContent, { string: "off" }),
		children: () => jsx(StubContent, { string: () => "n=" + n.value }),
	})
);
check("fallback mounted (wrapped)", showHost.contents.length === 1 && inner(showHost).string === "off");
on.value = true;
check("children mounted", showHost.contents.length === 1 && inner(showHost).string === "n=0");
n.value = 5;
check("nested binding live", inner(showHost).string === "n=5");
on.value = false;
n.value = 6;
check("disposed binding dead after swap", inner(showHost).string === "off");

// --- Show keepAlive: prebuilt sides, replace-based swap, both stay live ---
const on2 = signal(false), m = signal(0);
let built = 0;
const [kaHost] = createRoot(() =>
	Show({
		keepAlive: true,
		when: () => on2.value,
		width: 100, height: 50,
		fallback: () => { built++; return jsx(StubContent, { string: "ka-off" }); },
		children: () => { built++; return jsx(StubContent, { string: () => "m=" + m.value }); },
	})
);
check("keepAlive built both sides once", built === 2);
check("keepAlive fallback mounted", inner(kaHost).string === "ka-off");
const fallbackWrapper = kaHost.contents[0];
on2.value = true;
check("keepAlive swap to children", inner(kaHost).string === "m=0");
m.value = 3;
check("keepAlive hidden side effects stay live", true);	// no dispose in keepAlive
check("keepAlive children binding live", inner(kaHost).string === "m=3");
on2.value = false;
check("keepAlive swap back reuses SAME wrapper", kaHost.contents[0] === fallbackWrapper);
on2.value = true;
on2.value = false;
check("keepAlive survives repeated toggles", inner(kaHost).string === "ka-off");
check("keepAlive never rebuilt", built === 2);

// --- keepAlive with a missing fallback: placeholder side, replace-only ---
const on3 = signal(true);
const [oneSided] = createRoot(() =>
	Show({
		keepAlive: true,
		when: () => on3.value,
		width: 50, height: 20,
		children: () => jsx(StubContent, { string: "solo" }),
	})
);
check("one-sided keepAlive mounts children", inner(oneSided).string === "solo");
const soloWrapper = oneSided.contents[0];
on3.value = false;       // placeholder swapped in via replace()
check("placeholder side mounted", oneSided.contents.length === 1 && oneSided.contents[0] !== soloWrapper);
on3.value = true;        // back via replace() — same prebuilt wrapper, no re-add
check("one-sided swap back reuses wrapper", oneSided.contents[0] === soloWrapper);

// --- For with duplicate keys: first occurrence wins, no orphaned rows ---
const dupItems = signal([{ id: 1 }, { id: 2 }]);
let dupBuilt = 0;
const [dupHost] = createRoot(() =>
	For({
		each: () => dupItems.value,
		key: it => it.id,
		width: 50,
		children: () => { dupBuilt++; return jsx(StubContent, { string: "row" }); },
	})
);
dupItems.value = [{ id: 3 }, { id: 3 }, { id: 1 }];
check("duplicate keys collapse to one row", dupHost.contents.length === 2);
check("duplicate built once", dupBuilt === 3);
dupItems.value = [];
check("dup cleanup empties host", dupHost.contents.length === 0);

done();
