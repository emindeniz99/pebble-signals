// Flow suite — For keyed reconcile + Show (default rebuild and keepAlive),
// run against piu stubs. Show sides are auto-wrapped in a Container by the
// runtime (the piu Pebble port crashes on bare-Label swaps), so assertions
// look through one wrapper layer via inner().
import { loadRuntime, StubContent, makeChecker } from "./load-runtime.mjs";

const { signals, jsx: jsxM, flow } = await loadRuntime();
const { signal } = signals;
const { createRoot } = signals;
const { jsx } = jsxM;
const { Show, For, VirtualList } = flow;
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
check("keepAlive children binding live", inner(kaHost).string === "m=3");
on2.value = false;
check("keepAlive swap back reuses SAME wrapper", kaHost.contents[0] === fallbackWrapper);
// hidden-side effects STAY LIVE: write m while the children side is OFF
// screen, then swap back and observe the binding already applied it
const childrenWrapper = kaHost.contents[0] === fallbackWrapper ? null : kaHost.contents[0];
m.value = 7;
on2.value = true;
check("keepAlive hidden side effects stay live", inner(kaHost).string === "m=7");
on2.value = false;
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

// --- VirtualList: fixed recycled cells, windowed over a data source ---
const off = signal(0);
const src = { count: () => 5, get: i => "v" + i };
const [vl] = createRoot(() =>
	VirtualList({ data: src, rows: 3, at: () => off.value, format: v => v }));
check("VL renders exactly `rows` cells", vl.contents.length === 3);
check("VL initial window", vl.contents.map(c => c.string).join(",") === "v0,v1,v2");
const cell0 = vl.contents[0], cell2 = vl.contents[2];   // capture node identity
off.value = 2;
check("VL scrolls window", vl.contents.map(c => c.string).join(",") === "v2,v3,v4");
check("VL RECYCLES nodes (no create/destroy on scroll)",
	vl.contents[0] === cell0 && vl.contents[2] === cell2 && vl.contents.length === 3);
off.value = 3;   // window v3,v4,[v5] but count=5 -> last slot past end
check("VL past-end slot blanks", vl.contents.map(c => c.string).join(",") === "v3,v4,");
check("VL default format is String()", (() => {
	const [d] = createRoot(() => VirtualList({ data: { count: () => 1, get: () => 7 }, rows: 1 }));
	return d.contents[0].string === "7";
})());

// VirtualList renderRow: rich recycled rows via a row template
const rrBuilt = [];
const [rl] = createRoot(() => VirtualList({
	data: { count: () => 5, get: i => "v" + i }, rows: 2, at: () => 0,
	renderRow: (idxThunk, dataArg) => {
		rrBuilt.push(idxThunk);
		const c = new StubContent(null, {});
		c.string = dataArg.get(idxThunk());
		return c;
	},
}));
check("renderRow builds `rows` rows", rl.contents.length === 2);
check("renderRow slot index thunks", rrBuilt[0]() === 0 && rrBuilt[1]() === 1);
check("renderRow row content", rl.contents[0].string === "v0" && rl.contents[1].string === "v1");

// --- Navigator: screen stack, exactly ONE screen built at any depth ---
const { Navigator } = flow;
let navRef = null;
const nbuilt = [];
const rootPing = signal(0);
let rootRuns = 0;
const [navHost] = createRoot(() =>
	Navigator({
		root: (nav) => {
			navRef = nav; nbuilt.push("root");
			// a live binding so we can prove leaving the screen disposes it
			return jsx(StubContent, { string: () => { rootRuns++; return "root " + rootPing.value; } });
		},
	}));
check("nav mounts one screen", navHost.contents.length === 1);
check("nav root built once", nbuilt.join(",") === "root");
check("nav depth starts at 1, cannot pop", navRef.depth() === 1 && navRef.canPop() === false);
check("nav root binding live", inner(navHost).string === "root 0");
rootPing.value = 1;
check("nav root binding updates", inner(navHost).string === "root 1");
const rootRunsBefore = rootRuns;

// push a child: parent is disposed, child built, still ONE screen mounted
navRef.push((nav) => { nbuilt.push("child" + nav.depth()); return jsx(StubContent, { string: "child" }); });
check("push keeps ONE screen mounted", navHost.contents.length === 1);
check("push built the child", nbuilt.join(",") === "root,child2");
check("push depth=2, canPop", navRef.depth() === 2 && navRef.canPop() === true);
check("child screen is shown", inner(navHost).string === "child");
rootPing.value = 2;					// parent's binding must be DEAD now
check("popped-away parent binding disposed", rootRuns === rootRunsBefore);

// pop: child disposed, parent REBUILT from its stored builder
navRef.pop();
check("pop keeps ONE screen mounted", navHost.contents.length === 1);
check("pop rebuilt the root", nbuilt.join(",") === "root,child2,root");
check("pop depth back to 1", navRef.depth() === 1 && navRef.canPop() === false);
check("rebuilt root reflects current signal", inner(navHost).string === "root 2");
navRef.pop();						// pop at root is a no-op
check("pop at root is a no-op", navRef.depth() === 1 && nbuilt.length === 3);

// --- coverage: default-arg branches + keepAlive same-side early return ---
// For WITHOUT key (default identity keyOf) and children returning a THUNK
// (asNode's function branch)
const ki = signal([1, 2]);
const [forNoKey] = createRoot(() => For({
	each: () => ki.value,
	children: (n) => () => jsx(StubContent, { string: "n" + n }),	// returns a thunk
}));
check("For without key uses identity", forNoKey.contents.length === 2);
check("For child thunk resolved via asNode", forNoKey.contents[0].string === "n1");

// VirtualList WITHOUT rows (default 3) and renderRow WITHOUT at (default 0)
const [vlDefault] = createRoot(() => VirtualList({
	data: { count: () => 9, get: i => i },
	renderRow: (idx) => { const c = new StubContent(null, {}); c.string = "r" + idx(); return c; },
}));
check("VirtualList default rows = 3", vlDefault.contents.length === 3);
check("renderRow default at = 0", vlDefault.contents[0].string === "r0");

// makeHost with left+right given: width is NOT defaulted to screen.width
const [vlLR] = createRoot(() => VirtualList({
	data: { count: () => 1, get: () => 0 }, rows: 1, left: 5, right: 5,
}));
check("left+right suppresses width default", vlLR.width === undefined && vlLR.left === 5);

// Show keepAlive: when() re-runs but returns the SAME side -> early return
const lvl = signal(1);
let kbuilt = 0;
const [kaSame] = createRoot(() => Show({
	keepAlive: true, when: () => lvl.value > 0, width: 10, height: 10,
	children: () => { kbuilt++; return jsx(StubContent, { string: "on" }); },
	fallback: () => { kbuilt++; return jsx(StubContent, { string: "off" }); },
}));
const builtAfterMount = kbuilt;
lvl.value = 2;					// still > 0 -> same side -> no swap
check("keepAlive same-side re-eval is a no-op", kbuilt === builtAfterMount);

done();
