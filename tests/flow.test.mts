// Flow suite — For keyed reconcile + Show (default rebuild and keepAlive),
// run against piu stubs. Show sides are auto-wrapped in a Container by the
// runtime (the piu Pebble port crashes on bare-Label swaps), so assertions
// look through one wrapper layer via inner().
import { loadRuntime, StubContent, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, flow, sandbox, tick, liveTimers } = await loadRuntime();
const { signal } = signals;
const { createRoot, withBoundary } = signals;
const { jsx } = jsxM;
const { Show, For, VirtualList, animate } = flow;
const { ErrorBoundary } = jsxM; // moved to jsx-runtime (boot-floor round)
const { check, done } = makeChecker("flow");

const inner = (host) => host.contents[0] && host.contents[0].contents[0];

// --- For: add / remove / reorder ---
const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
const made = [];
const [host, disposeFor] = createRoot(() =>
	For({
		each: () => items.value,
		key: (it) => it.id,
		width: 190,
		children: (it) => {
			made.push(it.id);
			return jsx(StubContent, {
				width: 190,
				height: 22,
				children: jsx(StubContent, { string: "item #" + it.id }),
			});
		},
	}),
);
check("initial 3 rows", host.contents.length === 3);
check("3 rows built", made.join(",") === "1,2,3");

items.value = [...items.value, { id: 4 }];
check("add -> 4 rows", host.contents.length === 4);
check("only new row built", made.join(",") === "1,2,3,4");

const beforeNodes = [...host.contents];
items.value = [...items.value].reverse();
check("reverse keeps 4 rows", host.contents.length === 4);
check(
	"reverse reuses nodes",
	host.contents[0] === beforeNodes[3] && host.contents[3] === beforeNodes[0],
);
check("reverse builds nothing", made.length === 4);

items.value = items.value.slice(1);
check("remove first -> 3 rows", host.contents.length === 3);

items.value = [];
check("clear -> 0 rows", host.contents.length === 0);

disposeFor();

// --- For children returning a PRIMITIVE: wrapped into a Label, not passed
// raw to piu add/insert (which crashes the port) ---
const prims = signal([1, 2, 3]);
const [primHost, disposePrim] = createRoot(() =>
	For({
		each: () => prims.value,
		key: (n) => n,
		width: 100,
		children: (n) => n, // a bare number — legal on the JSXNode type surface
	}),
);
check("primitive rows mount as 3 nodes", primHost.contents.length === 3);
check(
	"each primitive row is a Label with its stringified value",
	primHost.contents.every((c) => c instanceof StubContent) &&
		primHost.contents.map((c) => c.string).join(",") === "1,2,3",
);
disposePrim();

// --- For/VirtualList rows that are an ARRAY or null fail LOUD — a port
// constraint (one row = one mounted node; a raw array corrupts the piu tree,
// null died later in reconcile with an unactionable TypeError). NOT a Solid
// parity point: Solid accepts fragment rows; this port refuses them audibly. ---
{
	// mount-time (synchronous — propagates out of the initial effect run)
	let arrErr = "";
	try {
		createRoot(() => For({ each: () => [["a", "b"]], width: 30, children: (r) => r }));
	} catch (e) {
		arrErr = String((e && e.message) || e);
	}
	check("For array row fails loud at mount", arrErr.includes("For: row must be a single element"));
	// booleans are legal JSXNode CHILDREN (skipped) but not rows — same refusal
	let boolErr = "";
	try {
		createRoot(() => For({ each: () => [false], width: 30, children: (r) => r }));
	} catch (e) {
		boolErr = String((e && e.message) || e);
	}
	check("For boolean row fails loud", boolErr.includes("For: row must be a single element"));
	// a DOUBLE-thunk row: asNode unwraps one function level; the remaining
	// function must be refused, not mounted raw into the piu tree
	let fnErr = "";
	try {
		createRoot(() => For({ each: () => [1], width: 30, children: () => () => () => "x" }));
	} catch (e) {
		fnErr = String((e && e.message) || e);
	}
	check(
		"For double-thunk row fails loud (a function is not a node)",
		fnErr.includes("For: row must be a single element (got a function)"),
	);
	// update-time (notification path — contained, healthy rows survive)
	const caught = [];
	sandbox.__spError = (e) => caught.push(String((e && e.message) || e));
	const rows9 = signal([1]);
	const [nulHost] = createRoot(() =>
		For({ each: () => rows9.value, width: 30, children: (r) => r }),
	);
	rows9.value = [1, null]; // the null row throws inside the pass — CONTAINED
	check(
		"For null row fails loud on update (contained; healthy row survives)",
		caught.length === 1 &&
			caught[0].includes("For: row must be a single element") &&
			nulHost.contents.length === 1 &&
			nulHost.contents[0].string === "1",
	);
	sandbox.__spError = undefined;
	// a row that throws during the INITIAL pass must not orphan rows built
	// EARLIER in that same pass — the sweeper registers with the owner
	// BEFORE the effect, so the caller's dispose still reaches rd[]
	{
		const leakPing = signal(0);
		let leakRuns = 0;
		let threw10 = false;
		try {
			createRoot(() =>
				For({
					each: () => [1, null], // row 1 builds; the null row throws
					width: 30,
					children: (r) =>
						r === null
							? r // asRow throws loud on the null row
							: jsx(StubContent, {
									string: () => {
										leakRuns++;
										return `r${leakPing.value}`;
									},
								}),
				}),
			);
		} catch {
			threw10 = true;
		}
		const runsAtMount = leakRuns;
		leakPing.value = 1; // a leaked row-1 root would re-run its binding here
		check(
			"For mount-throw does not orphan earlier rows in the pass",
			threw10 && leakRuns === runsAtMount,
		);
	}
	// owner-teardown ORDER: the reconcile effect dies BEFORE the sweeper (the
	// sweeper registers first; owner drain is LIFO), so a row cleanup that
	// writes an each() dependency mid-teardown cannot re-enter a half-dead
	// reconcile pass. A duplicate LATE sweeper regressed exactly this: it
	// drained first, rows disposed while the effect was still subscribed.
	{
		const eachSig = signal([1]);
		let rowBuilds = 0;
		const [, d11] = createRoot(() =>
			For({
				each: () => eachSig.value,
				width: 30,
				children: (r) => {
					rowBuilds++;
					signals.onCleanup(() => {
						eachSig.value = [...eachSig.value, 99]; // dependency write mid-teardown
					});
					return jsx(StubContent, { string: `x${r}` });
				},
			}),
		);
		const buildsBefore = rowBuilds;
		let tore = true;
		try {
			d11();
		} catch {
			tore = false;
		}
		check(
			"For teardown with a dependency-writing row cleanup does not re-enter reconcile",
			tore && rowBuilds === buildsBefore,
		);
	}
	// VirtualList rich mode: an array slot is the same defect, at build time
	let vlErr = "";
	try {
		createRoot(() =>
			VirtualList({
				data: { count: () => 2, get: (i) => i },
				rows: 1,
				width: 30,
				renderRow: () => ["x", "y"],
			}),
		);
	} catch (e) {
		vlErr = String((e && e.message) || e);
	}
	check(
		"VirtualList array slot fails loud",
		vlErr.includes("VirtualList: row must be a single element"),
	);
}

// --- Show default mode: swap + dispose, auto-wrapped ---
const on = signal(false),
	n = signal(0);
const [showHost] = createRoot(() =>
	Show({
		when: () => on.value,
		width: 100,
		height: 50,
		fallback: () => jsx(StubContent, { string: "off" }),
		children: () => jsx(StubContent, { string: () => "n=" + n.value }),
	}),
);
check(
	"fallback mounted (wrapped)",
	showHost.contents.length === 1 && inner(showHost).string === "off",
);
on.value = true;
check("children mounted", showHost.contents.length === 1 && inner(showHost).string === "n=0");
n.value = 5;
check("nested binding live", inner(showHost).string === "n=5");
on.value = false;
n.value = 6;
check("disposed binding dead after swap", inner(showHost).string === "off");

// --- Show default mode: a predicate re-eval that does NOT flip truthiness
// must NOT rebuild the shown subtree (its state/effects survive) ---
const gate = signal(1);
let dbuilt = 0;
const [memoHost] = createRoot(() =>
	Show({
		when: () => gate.value > 0,
		width: 10,
		height: 10,
		children: () => {
			dbuilt++;
			return jsx(StubContent, { string: () => "g=" + gate.value });
		},
		fallback: () => {
			dbuilt++;
			return jsx(StubContent, { string: "off" });
		},
	}),
);
const dBuiltAtMount = dbuilt; // children built once
gate.value = 2; // still > 0 — same side, must be a no-op rebuild-wise
check("default same-truthiness re-eval does not rebuild", dbuilt === dBuiltAtMount);
check(
	"shown subtree stayed live (nested binding updated in place)",
	inner(memoHost).string === "g=2",
);
gate.value = 0; // flips false — NOW it rebuilds to the fallback
check(
	"truthiness flip still swaps",
	dbuilt === dBuiltAtMount + 1 && inner(memoHost).string === "off",
);

// --- Show default mode: a CONTAINED throwing side must not latch `cur` —
// the memo guard would then suppress every retry while the predicate keeps
// that truthiness (sticky blank side). Reset-then-latch self-heals in BOTH
// directions (mirrors For's U7 contract). ---
{
	sandbox.__spError = () => {}; // contain-mode: errors swallowed by the app hook
	const g5 = signal(0); // start on the healthy fallback side
	let boom5 = true;
	let childBuilds = 0;
	const [healHost] = createRoot(() =>
		Show({
			when: () => g5.value > 0,
			width: 20,
			height: 20,
			fallback: () => jsx(StubContent, { string: "off" }),
			children: () => {
				childBuilds++;
				if (boom5) throw new Error("side boom");
				return jsx(StubContent, { string: "healed" });
			},
		}),
	);
	g5.value = 1; // flip to the THROWING side — contained, host left empty
	check("contained throwing side leaves the host empty", healHost.contents.length === 0);
	g5.value = 0; // flip BACK: a latched cur=0 would claim 'fallback mounted' and skip
	check(
		"flip back after a contained throw rebuilds the fallback",
		inner(healHost).string === "off",
	);
	boom5 = false;
	g5.value = 2; // the side heals once its builder stops throwing
	check("throwing side retries and heals on the next flip", inner(healHost).string === "healed");
	const buildsAtHeal = childBuilds;
	g5.value = 3; // same truthiness, healthy subtree — memoization back in force
	check("healed side memoizes again (no rebuild)", childBuilds === buildsAtHeal);
	sandbox.__spError = undefined;
}

// --- Show default mode: a builder that writes a `when` dependency DURING its
// own build re-enters the effect mid-build — the latch must early-return it
// (an unlatched cur double-mounted the side and leaked a root; refuter probe) ---
{
	const g6 = signal(1);
	let builds6 = 0;
	const [reHost] = createRoot(() =>
		Show({
			when: () => g6.value > 0,
			width: 20,
			height: 20,
			children: () => {
				builds6++;
				if (builds6 === 1) g6.value = 2; // same truthiness, mid-build write
				return jsx(StubContent, { string: () => "v" + g6.value });
			},
		}),
	);
	check(
		"mid-build same-truthiness write does not double-mount",
		reHost.contents.length === 1 && builds6 === 1,
	);
	check("re-entrant build's binding stays live", inner(reHost).string === "v2");
	g6.value = 0; // flip to the (missing) fallback — empty wrapper, single child
	check("flip after a re-entrant build swaps cleanly", reHost.contents.length === 1);
}

// --- Show wrapper sizing: a l/r/t/b-sized Show must hand its side a
// CONSTRAINED wrapper (0/0 fill coordinates) — copying only width/height left
// the wrapper unconstrained, ignoring the host's box (the side rendered
// content-measured at the host origin instead of filling the sized region —
// A/B receipts screenshots/showlrtb-gabbro.png vs showlrtb-oldwrap-gabbro.png,
// codex round nine + round-ten correction) ---
{
	const [boxHost] = createRoot(() =>
		Show({
			when: () => true,
			left: 10,
			right: 10,
			top: 40,
			bottom: 40,
			children: () => jsx(StubContent, { string: "boxed" }),
		}),
	);
	const w = boxHost.contents[0];
	check(
		"l/r/t/b Show wrapper fills the host on both axes",
		w.left === 0 && w.right === 0 && w.top === 0 && w.bottom === 0 && w.width === undefined,
	);
	// width/height-sized Show keeps the device-proven width/height wrapper
	const [whHost] = createRoot(() =>
		Show({ when: () => true, width: 20, height: 30, children: () => jsx(StubContent, {}) }),
	);
	const w2 = whHost.contents[0];
	check(
		"width/height Show wrapper keeps the proven shape",
		w2.width === 20 && w2.height === 30 && w2.left === undefined,
	);
	// MIXED: width pinned, vertical axis via top/bottom — fill only that axis
	const [mixHost] = createRoot(() =>
		Show({ when: () => true, width: 20, top: 5, bottom: 5, children: () => jsx(StubContent, {}) }),
	);
	const w3 = mixHost.contents[0];
	check(
		"mixed-size Show wrapper fills only the coordinate axis",
		w3.width === 20 && w3.left === undefined && w3.top === 0 && w3.bottom === 0,
	);
	// NO size props at all: unconstrained wrapper (content-measured), untouched
	const [freeHost] = createRoot(() =>
		Show({ when: () => true, children: () => jsx(StubContent, {}) }),
	);
	const w4 = freeHost.contents[0];
	check(
		"size-less Show wrapper stays unconstrained (content-measured)",
		w4.width === undefined && w4.left === undefined && w4.top === undefined,
	);
}

// --- Show keepAlive: prebuilt sides, replace-based swap, both stay live ---
const on2 = signal(false),
	m = signal(0);
let built = 0;
const [kaHost] = createRoot(() =>
	Show({
		keepAlive: true,
		when: () => on2.value,
		width: 100,
		height: 50,
		fallback: () => {
			built++;
			return jsx(StubContent, { string: "ka-off" });
		},
		children: () => {
			built++;
			return jsx(StubContent, { string: () => "m=" + m.value });
		},
	}),
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
		width: 50,
		height: 20,
		children: () => jsx(StubContent, { string: "solo" }),
	}),
);
check("one-sided keepAlive mounts children", inner(oneSided).string === "solo");
const soloWrapper = oneSided.contents[0];
on3.value = false; // placeholder swapped in via replace()
check(
	"placeholder side mounted",
	oneSided.contents.length === 1 && oneSided.contents[0] !== soloWrapper,
);
on3.value = true; // back via replace() — same prebuilt wrapper, no re-add
check("one-sided swap back reuses wrapper", oneSided.contents[0] === soloWrapper);

// --- For with duplicate keys: first occurrence wins, no orphaned rows ---
const dupItems = signal([{ id: 1 }, { id: 2 }]);
let dupBuilt = 0;
const [dupHost] = createRoot(() =>
	For({
		each: () => dupItems.value,
		key: (it) => it.id,
		width: 50,
		children: () => {
			dupBuilt++;
			return jsx(StubContent, { string: "row" });
		},
	}),
);
dupItems.value = [{ id: 3 }, { id: 3 }, { id: 1 }];
check("duplicate keys collapse to one row", dupHost.contents.length === 2);
check("duplicate built once", dupBuilt === 3);
dupItems.value = [];
check("dup cleanup empties host", dupHost.contents.length === 0);

// --- VirtualList: fixed recycled cells, windowed over a data source ---
const off = signal(0);
const src = { count: () => 5, get: (i) => "v" + i };
const [vl] = createRoot(() =>
	VirtualList({ data: src, rows: 3, at: () => off.value, format: (v) => v }),
);
check("VL renders exactly `rows` cells", vl.contents.length === 3);
check("VL initial window", vl.contents.map((c) => c.string).join(",") === "v0,v1,v2");
const cell0 = vl.contents[0],
	cell2 = vl.contents[2]; // capture node identity
off.value = 2;
check("VL scrolls window", vl.contents.map((c) => c.string).join(",") === "v2,v3,v4");
check(
	"VL RECYCLES nodes (no create/destroy on scroll)",
	vl.contents[0] === cell0 && vl.contents[2] === cell2 && vl.contents.length === 3,
);
off.value = 3; // window v3,v4,[v5] but count=5 -> last slot past end
check("VL past-end slot blanks", vl.contents.map((c) => c.string).join(",") === "v3,v4,");
check(
	"VL default format is String()",
	(() => {
		const [d] = createRoot(() => VirtualList({ data: { count: () => 1, get: () => 7 }, rows: 1 }));
		return d.contents[0].string === "7";
	})(),
);

// VirtualList renderRow: rich recycled rows via a row template
const rrBuilt = [];
const [rl] = createRoot(() =>
	VirtualList({
		data: { count: () => 5, get: (i) => "v" + i },
		rows: 2,
		at: () => 0,
		renderRow: (idxThunk, dataArg) => {
			rrBuilt.push(idxThunk);
			const c = new StubContent(null, {});
			c.string = dataArg.get(idxThunk());
			return c;
		},
	}),
);
check("renderRow builds `rows` rows", rl.contents.length === 2);
check("renderRow slot index thunks", rrBuilt[0]() === 0 && rrBuilt[1]() === 1);
check("renderRow row content", rl.contents[0].string === "v0" && rl.contents[1].string === "v1");

// renderRow returning a PRIMITIVE is wrapped into a Label (as For does), not
// passed raw to host.add (which crashes the port)
const [rlPrim] = createRoot(() =>
	VirtualList({
		data: { count: () => 3, get: (i) => i * 10 },
		rows: 2,
		renderRow: (idxThunk, dataArg) => dataArg.get(idxThunk()), // a bare number
	}),
);
check(
	"rich renderRow primitive rows wrap into Labels",
	rlPrim.contents.length === 2 &&
		rlPrim.contents.every((c) => c instanceof StubContent) &&
		rlPrim.contents.map((c) => c.string).join(",") === "0,10",
);

// --- Navigator: screen stack, exactly ONE screen built at any depth ---
const { Navigator } = flow;
let navRef = null;
const nbuilt = [];
const rootPing = signal(0);
let rootRuns = 0;
const [navHost] = createRoot(() =>
	Navigator({
		root: (nav) => {
			navRef = nav;
			nbuilt.push("root");
			// a live binding so we can prove leaving the screen disposes it
			return jsx(StubContent, {
				string: () => {
					rootRuns++;
					return "root " + rootPing.value;
				},
			});
		},
	}),
);
// The root screen builds on DISPLAY, not at construction: the initial swap is
// deferred onto the host's onDisplaying so the deep render chain is unwound
// before a screen tree stacks on it (the 384-slot value-stack wall — both nav
// canaries only boot on device with this). Nothing is mounted until then.
check("nav builds nothing before display", navHost.contents.length === 0 && nbuilt.length === 0);
navHost.display(); // Piu fires onDisplaying when the host joins the display tree
check("nav mounts one screen", navHost.contents.length === 1);
check("nav root built once", nbuilt.join(",") === "root");
check("nav depth starts at 1, cannot pop", navRef.depth() === 1 && navRef.canPop() === false);
check("nav root binding live", inner(navHost).string === "root 0");
rootPing.value = 1;
check("nav root binding updates", inner(navHost).string === "root 1");
const rootRunsBefore = rootRuns;

// push a child: parent is disposed, child built, still ONE screen mounted
navRef.push((nav) => {
	nbuilt.push("child" + nav.depth());
	return jsx(StubContent, { string: "child" });
});
check("push keeps ONE screen mounted", navHost.contents.length === 1);
check("push built the child", nbuilt.join(",") === "root,child2");
check("push depth=2, canPop", navRef.depth() === 2 && navRef.canPop() === true);
check("child screen is shown", inner(navHost).string === "child");
rootPing.value = 2; // parent's binding must be DEAD now
check("popped-away parent binding disposed", rootRuns === rootRunsBefore);

// pop: child disposed, parent REBUILT from its stored builder
navRef.pop();
check("pop keeps ONE screen mounted", navHost.contents.length === 1);
check("pop rebuilt the root", nbuilt.join(",") === "root,child2,root");
check("pop depth back to 1", navRef.depth() === 1 && navRef.canPop() === false);
check("rebuilt root reflects current signal", inner(navHost).string === "root 2");
navRef.pop(); // pop at root is a no-op
check("pop at root is a no-op", navRef.depth() === 1 && nbuilt.length === 3);

// --- coverage: default-arg branches + keepAlive same-side early return ---
// For WITHOUT key (default identity keyOf) and children returning a THUNK
// (asNode's function branch)
const ki = signal([1, 2]);
const [forNoKey] = createRoot(() =>
	For({
		each: () => ki.value,
		children: (n) => () => jsx(StubContent, { string: "n" + n }), // returns a thunk
	}),
);
check("For without key uses identity", forNoKey.contents.length === 2);
check("For child thunk resolved via asNode", forNoKey.contents[0].string === "n1");

// VirtualList WITHOUT rows (default 3) and renderRow WITHOUT at (default 0)
const [vlDefault] = createRoot(() =>
	VirtualList({
		data: { count: () => 9, get: (i) => i },
		renderRow: (idx) => {
			const c = new StubContent(null, {});
			c.string = "r" + idx();
			return c;
		},
	}),
);
check("VirtualList default rows = 3", vlDefault.contents.length === 3);
check("renderRow default at = 0", vlDefault.contents[0].string === "r0");

// makeHost with left+right given: width is NOT defaulted to screen.width
const [vlLR] = createRoot(() =>
	VirtualList({
		data: { count: () => 1, get: () => 0 },
		rows: 1,
		left: 5,
		right: 5,
	}),
);
check("left+right suppresses width default", vlLR.width === undefined && vlLR.left === 5);

// Show keepAlive: when() re-runs but returns the SAME side -> early return
const lvl = signal(1);
let kbuilt = 0;
createRoot(() =>
	Show({
		keepAlive: true,
		when: () => lvl.value > 0,
		width: 10,
		height: 10,
		children: () => {
			kbuilt++;
			return jsx(StubContent, { string: "on" });
		},
		fallback: () => {
			kbuilt++;
			return jsx(StubContent, { string: "off" });
		},
	}),
);
const builtAfterMount = kbuilt;
lvl.value = 2; // still > 0 -> same side -> no swap
check("keepAlive same-side re-eval is a no-op", kbuilt === builtAfterMount);

// coverage: dispose an EMPTY For -> cleanup loop runs over zero rows
const [emptyFor, disposeEmpty] = createRoot(() =>
	For({
		each: () => [],
		key: (x) => x,
		width: 10,
		children: (x) => jsx(StubContent, { string: "" + x }),
	}),
);
check("empty For has no rows", emptyFor.contents.length === 0);
disposeEmpty(); // exercises the rd-empty cleanup branch
check("empty For disposes cleanly", true);

// coverage: disposing the OWNER of a Show (default mode) runs its tracked
// cleanup (dispose the live side)
const shOn = signal(true);
const [, disposeShowOwner] = createRoot(() => {
	Show({
		when: () => shOn.value,
		width: 10,
		height: 10,
		children: () => jsx(StubContent, { string: "on" }),
		fallback: () => jsx(StubContent, { string: "off" }),
	});
	return 0;
});
disposeShowOwner(); // runs Show's `if (dispose) dispose()` cleanup
check("Show owner-dispose runs cleanup", true);

// coverage: disposing the OWNER of a Navigator runs its tracked cleanup
const [, disposeNavOwner] = createRoot(() => {
	Navigator({ root: () => jsx(StubContent, { string: "screen" }) }).display();
	return 0;
});
disposeNavOwner(); // runs Navigator's `if (disposeTop) disposeTop()` cleanup
check("Navigator owner-dispose runs cleanup", true);

// coverage: a STALE handle (a global `NAV` outliving its owner) must no-op
// push()/pop() after disposal — else swap() runs on the unmounted host and
// createRoot leaks the pushed screen's effects with no owner to track them
{
	let staleNav = null;
	const built = [];
	const [, disposeStale] = createRoot(() => {
		Navigator({
			root: (nav) => {
				staleNav = nav;
				built.push("root");
				return jsx(StubContent, { string: "root" });
			},
		}).display();
		return 0;
	});
	disposeStale(); // Navigator gone; the captured handle is now stale
	staleNav.push(() => {
		built.push("late");
		return jsx(StubContent, { string: "late" });
	});
	staleNav.pop();
	check(
		"stale Navigator push/pop after dispose no-op",
		built.join(",") === "root" && staleNav.depth() === 1,
	);
}

// coverage: a screen builder may return a THUNK (auto-thunk unwrap in swap —
// the inlined asNode path where `typeof s === "function"` is TRUE)
{
	const [navHost, disposeThunkNav] = createRoot(() =>
		Navigator({ root: () => () => jsx(StubContent, { string: "thunked" }) }),
	);
	navHost.display();
	const screenOf = (h) => h.contents[0].contents[0];
	check(
		"Navigator unwraps a thunk-returning screen builder",
		screenOf(navHost).string === "thunked",
	);
	disposeThunkNav();
}

// coverage: dispose a NON-empty For -> cleanup loop runs over live rows (taken)
const [fullFor, disposeFull] = createRoot(() =>
	For({
		each: () => [1, 2],
		key: (x) => x,
		width: 10,
		children: (x) => jsx(StubContent, { string: "" + x }),
	}),
);
check("non-empty For built rows", fullFor.contents.length === 2);
disposeFull(); // cleanup loop iterates the 2 live disposers
check("non-empty For disposes cleanly", true);

// animate(): eases a signal from->to over ms via the (mocked) interval clock
const [, disposeAnim] = createRoot(() => {
	const x = animate(0, 100, 99); // dur 99, step 33 -> 3 ticks to finish
	check("animate starts at from", x() === 0);
	tick(1);
	check("animate steps toward to", x() > 0 && x() < 100);
	tick(2);
	check("animate reaches to and stops", x() === 100);
	const before = x();
	tick(5);
	check("animate stopped (no overshoot)", x() === before);
	const z0 = animate(0, 8, 0); // ms<=0 -> dur clamps to 1, finishes in one tick
	tick(1);
	check("animate with ms<=0 clamps and completes", z0() === 8);
	return 0;
});
disposeAnim();

// A2 regression: N concurrent tweens share ONE native timer (not one per
// tween). Two live tweens -> exactly one interval; both advance on a single
// tick; when the last stops, the timer is released.
const [, dShared] = createRoot(() => {
	check("no timer before any tween", liveTimers() === 0);
	const a = animate(0, 100, 9999);
	const b = animate(0, 50, 9999);
	check("two tweens share ONE timer", liveTimers() === 1);
	tick(1);
	check("both tweens advanced on the single tick", a() > 0 && b() > 0);
	a.stop();
	check("timer stays live while one tween remains", liveTimers() === 1);
	b.stop();
	check("timer released when the last tween stops", liveTimers() === 0);
	return 0;
});
dShared();

// animate .stop() halts before completion
const [, dStop] = createRoot(() => {
	const y = animate(0, 100, 9999);
	tick(1);
	const mid = y();
	y.stop();
	tick(9);
	check("animate .stop() freezes the value", y() === mid);
	return 0;
});
dStop();

// a completion write that CASCADES — stops the finishing tween and starts a
// replacement in the same tick — must not let tickAll null the fresh ticker
const [, dCascade] = createRoot(() => {
	const first = animate(0, 10, 33); // dur == STEP -> completes in one tick
	let replacement;
	signals.effect(() => {
		if (first() >= 10 && !replacement) {
			first.stop();
			replacement = animate(0, 20, 9999); // fresh ticker installed mid-tick
		}
	});
	tick(1); // first completes -> effect stops it and starts the replacement
	check("cascade restart keeps a live timer (not orphaned)", liveTimers() === 1);
	const before = replacement();
	tick(1);
	check("cascade replacement tween still advances", replacement() > before);
	replacement.stop();
	return 0;
});
dCascade();

// --- ErrorBoundary: per-subtree catch, fallback, reset, nesting ------------
// Solid's opt-in local boundary. Catches BUILD-time and RE-RUN throws in its
// subtree, swaps in fallback(err, reset), keeps the rest of the app alive.
// report() logs EVERY error — boundary-caught included (owner decision) — so
// the whole section runs under a stubbed console to keep test output clean;
// the log-on-catch contract itself is pinned in signals.test.mts.
const ebSavedConsole = sandbox.console;
sandbox.console = { log: () => {} };

// (a) BUILD-time throw in children -> fallback shows, receives the error
{
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: (err) => jsx(StubContent, { string: "caught:" + err.message }),
			children: () => {
				throw new Error("build-fail");
			},
		}),
	);
	check(
		"EB: build-time throw shows fallback with the error",
		inner(host).string === "caught:build-fail",
	);
}

// (a2) wrapper sizing mirrors Show's wrapSide: a l/r/t/b-sized boundary hands
// its sides a 0/0 FILL wrapper; width/height keeps the proven shape; no size
// props keeps the content-measured wrapper (codex round ten — same class as
// the round-nine Show fix, A/B receipts screenshots/showlrtb-*.png)
{
	const [lrtbHost] = createRoot(() =>
		ErrorBoundary({
			left: 10,
			right: 10,
			top: 40,
			bottom: 40,
			fallback: () => jsx(StubContent, {}),
			children: () => jsx(StubContent, { string: "boxed" }),
		}),
	);
	const ebw = lrtbHost.contents[0];
	check(
		"EB: l/r/t/b boundary wrapper fills the host on both axes",
		ebw.left === 0 &&
			ebw.right === 0 &&
			ebw.top === 0 &&
			ebw.bottom === 0 &&
			ebw.width === undefined,
	);
	const [whEbHost] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: () => jsx(StubContent, {}),
			children: () => jsx(StubContent, {}),
		}),
	);
	const ebw2 = whEbHost.contents[0];
	check(
		"EB: width/height boundary wrapper keeps the proven shape",
		ebw2.width === 100 && ebw2.height === 50 && ebw2.left === undefined,
	);
}

// (b) CREATION-TIME binding throw (first render of a binding) -> fallback, and
// the orphan children tree is NOT stacked over it (the re-entrancy guard)
{
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: (err) => jsx(StubContent, { string: "fb:" + err.message }),
			children: () =>
				jsx(StubContent, {
					string: () => {
						throw new Error("first-render");
					},
				}),
		}),
	);
	check("EB: creation-time binding throw shows fallback", inner(host).string === "fb:first-render");
	check("EB: no orphan tree stacked over the fallback", host.contents.length === 1);
}

// (c) RE-RUN throw -> fallback; a SIBLING outside the boundary stays alive,
// and the error never reached the terminal sink (no crash)
{
	const bad = signal(0);
	const sib = signal("s0");
	const [root, disposeRoot] = createRoot(() => {
		const eb = ErrorBoundary({
			width: 100,
			height: 50,
			fallback: (err) => jsx(StubContent, { string: "fb:" + err.message }),
			children: () =>
				jsx(StubContent, {
					string: () => {
						if (bad.value === 1) throw new Error("rerun-fail");
						return "child" + bad.value;
					},
				}),
		});
		const s = jsx(StubContent, { string: () => sib.value }); // OUTSIDE the boundary
		return [eb, s];
	});
	check("EB: children render before the error", inner(root[0]).string === "child0");
	bad.value = 1; // throws on re-run -> caught by the boundary
	check("EB: re-run throw swaps in the fallback", inner(root[0]).string === "fb:rerun-fail");
	sib.value = "s1";
	check("EB: sibling outside the boundary stays alive", root[1].string === "s1");
	disposeRoot();
}

// (d) reset(): re-runs children under a fresh root
{
	const bad = signal(1); // start broken
	let resetFn = null;
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: (err, reset) => {
				resetFn = reset;
				return jsx(StubContent, { string: "fb" });
			},
			children: () =>
				jsx(StubContent, {
					string: () => {
						if (bad.value === 1) throw new Error("x");
						return "ok" + bad.value;
					},
				}),
		}),
	);
	check("EB: starts in fallback (build failed)", inner(host).string === "fb");
	bad.value = 2; // heal — but the boundary won't re-mount on its own
	check("EB: fallback stays until reset", inner(host).string === "fb");
	resetFn(); // re-run children -> now healthy
	check("EB: reset re-mounts the healed children", inner(host).string === "ok2");
	bad.value = 3;
	check("EB: reset children track again", inner(host).string === "ok3");
	bad.value = 1; // break again -> back to fallback
	check("EB: re-breaks after reset", inner(host).string === "fb");
}

// (e) NESTING: an inner fallback that itself throws escalates to the OUTER
// boundary (Solid semantics), not back into the inner one
{
	const innerBad = signal(0);
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: () => jsx(StubContent, { string: "OUTER" }),
			children: () =>
				ErrorBoundary({
					width: 100,
					height: 50,
					// the inner fallback THROWS -> must go to the outer boundary
					fallback: () => {
						throw new Error("fallback-boom");
					},
					children: () =>
						jsx(StubContent, {
							string: () => {
								if (innerBad.value === 1) throw new Error("inner");
								return "inner-ok";
							},
						}),
				}),
		}),
	);
	// inner children render fine, inside the outer host -> wrapper -> inner host
	check(
		"EB nest: inner children render",
		inner(host).contents[0].contents[0].string === "inner-ok",
	);
	innerBad.value = 1; // inner throws -> inner fallback throws -> OUTER catches
	check(
		"EB nest: inner fallback throw escalates to the outer boundary",
		inner(host).string === "OUTER",
	);
}

// (f) reset() when the children build throws SYNCHRONOUSLY (a component body,
// not a binding) -> reset's own try/catch re-shows the fallback
{
	let boom = true;
	let resetFn = null;
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: (err, reset) => {
				resetFn = reset;
				return jsx(StubContent, { string: "fb2" });
			},
			children: () => {
				if (boom) throw new Error("sync-build");
				return jsx(StubContent, { string: "healed" });
			},
		}),
	);
	check("EB: sync build-throw shows fallback", inner(host).string === "fb2");
	resetFn(); // still failing -> reset's catch keeps the fallback up
	check("EB: reset of a still-failing sync build stays in fallback", inner(host).string === "fb2");
	boom = false;
	resetFn(); // healed -> children mount
	check("EB: reset after healing mounts children", inner(host).string === "healed");
}

// (g) two throwing bindings in one build: the FIRST swaps in the fallback; the
// SECOND (built after, still under this boundary) re-enters onError while it is
// already showing the fallback -> escalates OUT (no loop). Outermost boundary
// (no parent) -> the terminal sink, observed here via setSink.
{
	const escalated = [];
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} }; // report() logs before the sink; keep output clean
	signals.setSink((e) => escalated.push(String(e && e.message ? e.message : e)));
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 50,
			fallback: () => jsx(StubContent, { string: "fb3" }),
			children: () =>
				jsx(StubContent, {
					children: [
						jsx(StubContent, {
							string: () => {
								throw new Error("boom-a");
							},
						}),
						jsx(StubContent, {
							string: () => {
								throw new Error("boom-b");
							},
						}),
					],
				}),
		}),
	);
	check("EB: first throwing binding shows the fallback", inner(host).string === "fb3");
	check(
		"EB: second binding (already shown) escalates to the terminal sink, no loop",
		escalated.length === 1 && escalated[0] === "boom-b",
	);
	signals.setSink(null);
	sandbox.console = savedC;
}

// (h) host sizing (the inlined ebHost, post-move): no width and no left/right
// -> defaults to screen.width (a width-less container measures 0, gotcha 16);
// left+right anchoring suppresses the default (the box is already constrained)
{
	const [defHost] = createRoot(() =>
		ErrorBoundary({
			height: 20,
			fallback: () => jsx(StubContent, { string: "f" }),
			children: () => jsx(StubContent, { string: "c" }),
		}),
	);
	check("EB host defaults width to screen.width", defHost.width === jsxM.screen.width);
	const [lrHost] = createRoot(() =>
		ErrorBoundary({
			left: 0,
			right: 0,
			height: 20,
			fallback: () => jsx(StubContent, { string: "f" }),
			children: () => jsx(StubContent, { string: "c" }),
		}),
	);
	check("EB host left+right anchoring skips the width default", lrHost.width === undefined);
}

// (i) children returning a THUNK (the auto-thunk JSX boundary) is unwrapped
{
	const [host] = createRoot(() =>
		ErrorBoundary({
			width: 60,
			height: 20,
			fallback: () => jsx(StubContent, { string: "f" }),
			children: () => () => jsx(StubContent, { string: "unwrapped" }),
		}),
	);
	check("EB unwraps a thunk-returning children build", inner(host).string === "unwrapped");
}

sandbox.console = ebSavedConsole; // end of the stubbed ErrorBoundary section

// ---- deep-review regressions (flow) ----------------------------------------

// U2: a tween whose completion write cascades into stopping ANOTHER tween
// must still remove ITSELF (stale-index splice removed the wrong one; the
// shifted tween froze forever and the shared timer leaked).
{
	const a2 = animate(0, 100, 10000); // long tween, sits at index 0
	const b2 = animate(0, 1, 1); // completes on the first tick
	const e2 = signals.effect(() => {
		if (b2() >= 1) a2.stop(); // subscriber of B stops A mid-tick
	});
	tick(1); // B completes -> write -> effect stops A -> B must STILL remove itself
	check("U2 completed tween removes itself after a cascade", liveTimers() === 0);
	signals.dispose(e2);
}

// U7: a CONTAINED mid-reconcile throw (custom __spError) leaves a recorded
// row unmounted — the next pass's sweep must tolerate it, not crash piu.
{
	sandbox.__spError = () => {}; // contain-mode: errors swallowed by the app hook
	const items7 = signal([{ id: 3 }]); // healthy initial mount
	const [h7] = createRoot(() =>
		For({
			each: () => items7.value,
			key: (it) => it.id,
			width: 40,
			children: (it) => {
				if (it.id === 2) throw new Error("row boom");
				return jsx(StubContent, { string: "r" + it.id });
			},
		}),
	);
	items7.value = [{ id: 3 }, { id: 2 }]; // RE-RUN pass: row 2 throws, CONTAINED
	let swept = true;
	try {
		items7.value = [{ id: 1 }]; // sweep of the half-recorded pass
	} catch {
		swept = false;
	}
	check("U7 sweep tolerates a recorded-but-unmounted row", swept && h7.contents.length === 1);
	sandbox.__spError = undefined;
}

// U3: a screen builder that REDIRECTS (nav.push during its own build) must
// not double-mount — the orphan outer tree is dropped, the pushed screen's
// disposer is kept (it leaked forever before; ledger U3).
{
	const probe3 = signal(0);
	let childRuns = 0;
	const [nh3] = createRoot(() =>
		Navigator({
			width: 60,
			height: 40,
			root: (nav) => {
				nav.push(() =>
					jsx(StubContent, {
						string: () => {
							childRuns++;
							return "child" + probe3.value;
						},
					}),
				);
				return jsx(StubContent, { string: "root-screen" });
			},
		}),
	);
	nh3.display();
	check("U3 no double-mount after push-during-build", nh3.contents.length === 1);
	const shown = nh3.contents[0].contents[0].string;
	check("U3 the PUSHED screen is the one mounted", shown === "child0");
	// the pushed screen's root is owned: popping disposes it (no leak)
	// (nav handle not exposed here; dispose the whole nav root instead)
	const runsBefore = childRuns;
	probe3.value = 1;
	check("U3 pushed screen live before dispose", childRuns === runsBefore + 1);
}

// U4: a creation-time BINDING throw inside an EB *fallback* under an outer
// boundary — the torn-down inner boundary must DROP its in-flight fallback
// root (it leaked undisposably and re-crashed retried apps; ledger U4).
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} };
	const probe4 = signal(0);
	let innerFallbackRuns = 0;
	const bad4 = signal(0);
	const [r4, dr4] = createRoot(() =>
		ErrorBoundary({
			width: 60,
			height: 40,
			fallback: () => jsx(StubContent, { string: "outer-fallback" }),
			children: () =>
				ErrorBoundary({
					width: 60,
					height: 40,
					fallback: () =>
						jsx(StubContent, {
							string: () => {
								innerFallbackRuns++;
								void probe4.value;
								throw new Error("fallback binding boom"); // creation throw -> outer
							},
						}),
					children: () =>
						jsx(StubContent, {
							string: () => {
								if (bad4.value === 1) throw new Error("children boom");
								return "ok";
							},
						}),
				}),
		}),
	);
	bad4.value = 1; // children throw -> inner fallback builds -> ITS binding throws -> outer catches
	const outerShown = r4.contents[0].contents[0].string === "outer-fallback";
	dr4(); // tear everything down
	const runsAtDispose = innerFallbackRuns;
	probe4.value = 1; // the leaked fallback root would re-run here
	check(
		"U4 in-flight fallback root dropped when the boundary died",
		outerShown && innerFallbackRuns === runsAtDispose,
	);
	sandbox.console = savedC;
}

// U9: NaN keys must reconcile as a stable key (not rebuild every pass)
{
	let built9 = 0;
	const items9 = signal([{ v: NaN }]);
	const [h9] = createRoot(() =>
		For({
			each: () => items9.value,
			key: (it) => it.v, // NaN key from bad data
			width: 40,
			children: () => {
				built9++;
				return jsx(StubContent, { string: "nan-row" });
			},
		}),
	);
	items9.value = [{ v: NaN }]; // same NaN key -> must REUSE, not rebuild
	check("U9 NaN key is stable across passes", built9 === 1 && h9.contents.length === 1);
}

// ---- Move: reactive position via moveBy (delta-applied, rounded) ----
{
	const { Move } = flow;
	const mx = signal(0),
		my = signal(0);
	const kid = new StubContent(null, { string: "sprite" });
	const [mv, dmv] = createRoot(() =>
		Move({
			left: 10,
			top: 10,
			width: 20,
			height: 20,
			x: () => mx.value,
			y: () => my.value,
			children: kid,
		}),
	);
	check("Move mounts its children once", mv.contents[0] === kid);
	check("Move at rest (0,0) never calls moveBy", mv.moveCalls === undefined);
	mx.value = 30;
	check(
		"Move applies the x offset as a delta",
		mv.moveCalls === 1 && mv.movedX === 30 && (mv.movedY || 0) === 0,
	);
	mx.value = 30; // same value -> signal dedupes, no move
	check("Move ignores a same-value write", mv.moveCalls === 1);
	my.value = 12;
	mx.value = 5; // back toward base: delta must be NEGATIVE
	check(
		"Move tracks both axes and applies negative deltas",
		mv.movedX === 5 && mv.movedY === 12 && mv.moveCalls === 3,
	);
	// float source (an animate() tween): rounds BEFORE diffing, no drift
	mx.value = 5.4; // rounds to 5 -> no call
	const callsAt54 = mv.moveCalls;
	mx.value = 5.6; // rounds to 6 -> delta +1
	check(
		"Move rounds offsets before diffing (float tween, no drift)",
		callsAt54 === 3 && mv.moveCalls === 4 && mv.movedX === 6,
	);
	dmv();
	mx.value = 99; // disposed root: the effect must be dead
	check("Move stops tracking after dispose", mv.moveCalls === 4 && mv.movedX === 6);
}

// Move without x/y: a static wrapper, zero effect traffic
{
	const { Move } = flow;
	const [still] = createRoot(() => Move({ left: 0, top: 0, width: 10, height: 10 }));
	check("Move without offsets never moves", still.moveCalls === undefined);
}

// Move with a nonzero INITIAL offset: applied on the mount run
{
	const { Move } = flow;
	const ix = signal(25);
	const [init] = createRoot(() =>
		Move({ left: 0, top: 0, width: 10, height: 10, x: () => ix.value }),
	);
	check(
		"Move applies a nonzero initial offset at mount",
		init.movedX === 25 && init.moveCalls === 1,
	);
}

// U3b: a screen that REDIRECTS by pushing the SAME builder function object —
// stack-top identity alone cannot see it (top === build compares equal), so
// the disposeTop signal must drop the outer orphan. Pre-guard, the orphan
// double-mounted AND clobbered disposeTop, losing the real screen's disposer.
{
	const p9 = signal(0);
	let builds9 = 0;
	const screen9 = (nav) => {
		builds9++;
		if (builds9 === 1) nav.push(screen9); // redirect: the SAME function object
		return jsx(StubContent, { string: () => "s" + p9.value });
	};
	const [nh9, disposeNav9] = createRoot(() => Navigator({ width: 60, height: 40, root: screen9 }));
	nh9.display();
	check(
		"U3b same-builder redirect mounts exactly one screen",
		nh9.contents.length === 1 && builds9 === 2,
	);
	check("U3b the mounted screen is live", nh9.contents[0].contents[0].string === "s0");
	// the LIVE disposer must belong to the real (inner) mount: disposing the
	// nav owner must kill the screen's binding, not a dropped orphan's
	disposeNav9();
	p9.value = 5;
	check(
		"U3b nav dispose kills the real screen's binding (no orphaned disposer)",
		nh9.contents.length === 0 || nh9.contents[0].contents[0].string === "s0",
	);
}

// --- Navigator wrapper sizing (codex round eleven, same class as Show/EB):
// a l/r/t/b-ANCHORED navigator hands each screen a 0/0 FILL wrapper — the
// old concrete full-screen wrapper overflowed/ignored the anchored box;
// width/height and the no-constraint full-screen fallback keep their
// measured-safe concrete shapes ---
{
	const [anch] = createRoot(() =>
		Navigator({
			left: 10,
			right: 10,
			top: 30,
			bottom: 30,
			root: () => jsx(StubContent, { string: "anchored" }),
		}),
	);
	anch.display();
	const nw = anch.contents[0];
	check(
		"Navigator: anchored host gives screens a fill wrapper",
		nw.left === 0 && nw.right === 0 && nw.top === 0 && nw.bottom === 0 && nw.width === undefined,
	);
	const [sized] = createRoot(() =>
		Navigator({ width: 60, height: 40, root: () => jsx(StubContent, {}) }),
	);
	sized.display();
	const nw2 = sized.contents[0];
	check(
		"Navigator: explicit width/height wrapper unchanged",
		nw2.width === 60 && nw2.height === 40 && nw2.left === undefined,
	);
	const [free] = createRoot(() => Navigator({ root: () => jsx(StubContent, {}) }));
	free.display();
	const nw3 = free.contents[0];
	check(
		"Navigator: unconstrained host keeps the concrete full-screen wrapper",
		typeof nw3.width === "number" && typeof nw3.height === "number" && nw3.left === undefined,
	);
}

// --- Navigator preserves its construction-time ErrorBoundary across push()
// (codex round twelve): a screen pushed from OUTSIDE render (a button handler
// runs with g.c=null) still routes its effect throws to the boundary the
// Navigator was built under — not the top-level crash sink. The INITIAL swap
// runs with the boundary already in scope, so it skips the wrapper frame; only
// this push path exercises withBoundary. ---
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} }; // swallow the log-on-catch line
	const caught: string[] = [];
	let navRef: { push: (b: unknown) => void } | null = null;
	const [bhost] = createRoot(() =>
		withBoundary(
			(e: unknown) => caught.push(String((e as Error).message)),
			() =>
				Navigator({
					width: 100,
					height: 100,
					root: (nav: { push: (b: unknown) => void }) => {
						navRef = nav;
						return jsx(StubContent, { string: "root" });
					},
				}),
		),
	);
	// Display (Piu's onDisplaying) builds the root. Note the initial swap now
	// ALSO runs outside the boundary scope — deferral moved it to the run loop —
	// so it takes the same withBoundary branch push/pop take, and the screen is
	// still tagged with the Navigator's construction-time boundary.
	bhost.display();
	// push OUTSIDE the boundary scope (getBoundary() === null here, so the swap
	// takes the withBoundary branch and tags the pushed screen's binding).
	// This screen is a THUNK — the withBoundary-path auto-thunk unwrap must
	// still run (its own `typeof s === "function"` copy, since the deep-path
	// body is deliberately duplicated to spend no extra value-stack frame).
	const boom = signal(0);
	navRef!.push(
		() => () =>
			jsx(StubContent, {
				string: () => {
					if (boom.value === 1) throw new Error("pushed-boom");
					return "s2";
				},
			}),
	);
	boom.value = 1; // the pushed screen's binding re-runs and throws
	check(
		"Navigator: pushed-screen throw routes to the construction-time boundary",
		caught.join() === "pushed-boom",
	);
	// a second push through the boundary path with a DIRECT (non-thunk) screen —
	// covers the other side of the withBoundary copy's auto-thunk check
	navRef!.push(() => jsx(StubContent, { string: "s3" }));
	// a pushed screen whose BUILDER throws SYNCHRONOUSLY (not via a later effect
	// re-run) must ALSO route to the construction-time boundary — else the throw
	// escapes createRoot/push to the button dispatcher after the old screen is
	// gone and the local fallback is bypassed (codex round 17)
	navRef!.push(() => {
		throw new Error("sync-build-boom");
	});
	check(
		"Navigator: SYNCHRONOUS pushed-screen build throw routes to the boundary",
		caught.join().includes("sync-build-boom"),
	);
	sandbox.console = savedC;
}

// --- round 13: a boundary that disposes a control-flow node MID-BUILD -------
// The new side/row/screen's first binding can throw during creation; report()
// runs synchronously, so an ErrorBoundary above can clear + dispose the whole
// Show/For/Navigator while its createRoot is STILL on the stack. That root then
// returns normally, and adopting it left effects owned by nothing — free to keep
// reacting after the fallback was already painted (codex P2, three sites).
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} };
	const probe = signal(0);
	const flip = signal(0);
	let sideRuns = 0;
	const [rs, ds] = createRoot(() =>
		ErrorBoundary({
			width: 60,
			height: 40,
			fallback: () => jsx(StubContent, { string: "show-fb" }),
			children: () =>
				Show({
					width: 60,
					height: 40,
					when: () => flip.value === 1,
					fallback: () => jsx(StubContent, { string: "off" }),
					children: () =>
						jsx(StubContent, {
							string: () => {
								sideRuns++;
								void probe.value; // subscribe BEFORE throwing
								throw new Error("side boom");
							},
						}),
				}),
		}),
	);
	flip.value = 1; // build the truthy side -> its binding throws at creation
	const shown = rs.contents[0].contents[0].string === "show-fb";
	const runsAtDispose = sideRuns;
	probe.value = 1; // an ORPHANED side root would re-run its binding here
	check(
		"Show drops the side root its boundary disposed mid-build",
		shown && sideRuns === runsAtDispose,
	);
	ds();
	sandbox.console = savedC;
}
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} };
	const probe = signal(0);
	const items = signal<number[]>([]);
	let rowRuns = 0;
	const [rf, df] = createRoot(() =>
		ErrorBoundary({
			width: 60,
			height: 40,
			fallback: () => jsx(StubContent, { string: "for-fb" }),
			children: () =>
				For({
					width: 60,
					height: 40,
					each: () => items.value,
					children: () =>
						jsx(StubContent, {
							string: () => {
								rowRuns++;
								void probe.value;
								throw new Error("row boom");
							},
						}),
				}),
		}),
	);
	items.value = [1]; // build the first row -> its binding throws at creation
	const shown = rf.contents[0].contents[0].string === "for-fb";
	const runsAtDispose = rowRuns;
	probe.value = 1; // an ORPHANED row root would re-run here
	check(
		"For drops the row root its boundary disposed mid-build",
		shown && rowRuns === runsAtDispose,
	);
	df();
	sandbox.console = savedC;
}
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} };
	const probe = signal(0);
	let screenRuns = 0;
	let navRef: { push: (b: unknown) => void } | null = null;
	const [rn, dn] = createRoot(() =>
		ErrorBoundary({
			width: 100,
			height: 100,
			fallback: () => jsx(StubContent, { string: "nav-fb" }),
			children: () =>
				Navigator({
					width: 100,
					height: 100,
					root: (nav: { push: (b: unknown) => void }) => {
						navRef = nav;
						return jsx(StubContent, { string: "root" });
					},
				}),
		}),
	);
	rn.display();
	navRef!.push(() =>
		jsx(StubContent, {
			string: () => {
				screenRuns++;
				void probe.value;
				throw new Error("screen boom");
			},
		}),
	);
	const shown = rn.contents[0].contents[0].string === "nav-fb";
	const runsAtDispose = screenRuns;
	probe.value = 1; // an ORPHANED screen root would re-run here
	check(
		"Navigator drops the screen root its boundary disposed mid-build",
		shown && screenRuns === runsAtDispose,
	);
	dn();
	sandbox.console = savedC;
}

// --- round 13: a Navigator with NO local boundary must still REPORT ---------
// Both getBoundary() and navBoundary are null, so the inline branch ran with no
// try/catch — and since the initial swap moved to onDisplaying, render()'s own
// build try/catch has already returned. The throw escaped the installed
// top-level crash sink entirely instead of painting the crash UI (codex P2).
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} };
	const caught: string[] = [];
	sandbox.__spError = (e: unknown) => caught.push(String((e as Error).message));
	const [nh, dnb] = createRoot(() =>
		Navigator({
			width: 100,
			height: 100,
			root: () => {
				throw new Error("no-boundary-build-boom");
			},
		}),
	);
	// display() is the Piu run-loop callback: it must NOT rethrow past the host
	nh.display();
	check(
		"Navigator with no local boundary reports its build throw to the sink",
		caught.join() === "no-boundary-build-boom",
	);
	dnb();
	sandbox.__spError = undefined;
	sandbox.console = savedC;
}

// --- round 13: one advancement per tween per ticker turn --------------------
// A completion/tick write can cascade into stop() for a tween at a LOWER index;
// the array shifts down and the descending walk revisits the record it just
// advanced, ticking it TWICE in the same 33 ms turn — shortening and distorting
// the animation (codex P2).
{
	const [b, dcascade] = createRoot(() => {
		const a = animate(0, 100, 990); // index 0 — the victim of the cascade
		const bb = animate(0, 330, 330); // index 1 — walked FIRST (descending)
		// reacting to bb's per-tick write, stop `a`: active [a, bb] becomes [bb],
		// so slot 0 now holds bb — the very record this turn just advanced
		signals.effect(() => {
			if (bb() > 0) a.stop();
		});
		return bb;
	});
	tick(1);
	check(
		"a tween shifted down by a cascading stop() is not advanced twice",
		Math.round(b()) === 33, // 330 * (33/330); a double advance would read 66
	);
	dcascade();
	check("the cascade test released every timer", liveTimers() === 0);
}

done();
