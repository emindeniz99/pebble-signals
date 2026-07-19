// ActionBar suite — runtime/actionbar (opt-in right-edge button-hint strip).
// Proves: ActionBar returns a right-anchored Container holding a Column of THREE
// slot Labels carrying the given hint strings; a reactive `() => string` slot
// updates its Label on signal change (idiom 5b effect); omitted slots become
// empty Labels so layout stays stable; the container dict carries right:0; and
// the width/color/background prop defaults + overrides all resolve. StubContent/
// StubLeaf (load-runtime) stand in for Container/Column and Label.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.height = 168; // ActionBar reads screen.height for its explicit height (gotcha 16)
// Style + Skin are host compartment globals (absent in the Node sandbox);
// ActionBar constructs them per-call, so inject stubs before we call it — the
// same idiom badge.test.mts uses for the default Style.
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
sandbox.Skin = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { ActionBar } = await loadModule("runtime/actionbar");
const { check, done } = makeChecker("actionbar");

// helper: the three slot labels of a bar (bar → column → [up, select, down])
const slots = (bar: any) => bar.contents[0].contents;

// --- static strings: three hints, right-anchored, default width ---
{
	const [bar] = createRoot(() => ActionBar({ up: "+", select: "OK", down: "-" }));
	check("returns a container node", bar && Array.isArray(bar.contents));
	check("anchored to the right edge (right:0)", bar.right === 0);
	// explicit height (gotcha 16) — a top+bottom anchor alone measures 0 on device
	check("full height (top:0, explicit height)", bar.top === 0 && bar.height === jsxM.screen.height);
	check("default width is 28", bar.width === 28);
	const s = slots(bar);
	check("holds exactly three slot labels", s.length === 3);
	check("up hint in the top slot", s[0].string === "+");
	check("select hint in the middle slot", s[1].string === "OK");
	check("down hint in the bottom slot", s[2].string === "-");
	check("up slot anchored to the top", s[0].top === 0);
	check("down slot anchored to the bottom", s[2].bottom === 0);
	check("default hint color is white", s[0].style.d.color === "white");
}

// --- reactive slot thunk: the Label follows the signal ---
{
	const up = signal("1");
	const [bar] = createRoot(() => ActionBar({ up: () => up.value, select: "OK", down: "-" }));
	const s = slots(bar);
	check("reactive slot renders the initial value", s[0].string === "1");
	up.value = "2";
	check("reactive slot updates on signal change", s[0].string === "2");
	// a static neighbour is untouched by the reactive slot's effect
	check("static neighbour stays put", s[1].string === "OK");
}

// --- omitted slots become empty Labels (layout stays stable) ---
{
	const [bar] = createRoot(() => ActionBar({ select: "OK" }));
	const s = slots(bar);
	check("still three labels when slots are omitted", s.length === 3);
	check("omitted up slot is an empty label", s[0].string === "");
	check("omitted down slot is an empty label", s[2].string === "");
	check("provided slot still renders", s[1].string === "OK");
}

// --- width/color/background overrides + background Skin branch ---
{
	const [bar] = createRoot(() =>
		ActionBar({ up: "+", width: 40, color: "black", background: "white" }),
	);
	check("custom width forwarded", bar.width === 40);
	check("background builds a fill Skin", bar.skin && bar.skin.d.fill === "white");
	check("custom hint color forwarded", slots(bar)[0].style.d.color === "black");
}

done();
