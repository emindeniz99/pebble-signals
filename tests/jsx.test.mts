// jsx-runtime suite — the factory, host creation, reactive/button/tap
// bindings, setProp whitelist, appendChild child kinds, Fragment, render.
// Run with: node --experimental-vm-modules tests/jsx.test.mts
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox } = await loadRuntime();
const { signal } = signals;
const { jsx, jsxs, Fragment, appendChild, render, screen } = jsxM;
const { Container, Label } = sandbox;
const { check, done } = makeChecker("jsx");

// --- jsx dispatch: host vs component vs invalid ---
const host = jsx(Container, { name: "c" });
check("jsx(Piu) makes a host node", host instanceof Container && host.name === "c");
check("jsxs is jsx", jsxs === jsx);
let compProps = null;
const comp = jsx(
	(p) => {
		compProps = p;
		return jsx(Label, { string: "x" });
	},
	{ a: 1 },
);
check("jsx(function) calls the component", compProps.a === 1 && comp instanceof Label);
check("jsx(function) with no props gets {}", jsx(() => 1, undefined) === 1);
let threw = "";
try {
	jsx(123, {});
} catch (e) {
	threw = e.message;
}
check("jsx(non-type) throws", threw === "jsx:type");

// --- static vs reactive props ---
const sig = signal("hi");
const lbl = jsx(Label, { style: "s", string: () => sig.value });
check("static prop lands in dict", lbl.style === "s");
check("reactive prop binds initial", lbl.string === "hi");
sig.value = "bye";
check("reactive prop updates on change", lbl.string === "bye");

// --- reactive-prop whitelist: illegal reactive props rejected AT BIND TIME
// with an actionable message (not a cryptic per-run throw) ---
const catchMsg = (fn) => {
	try {
		fn();
	} catch (e) {
		return e.message;
	}
	return "";
};
check(
	"reactive visible rejected with guidance",
	/`visible` can't be reactive/.test(catchMsg(() => jsx(Label, { visible: () => true }))),
);
check(
	"reactive position prop rejected with guidance",
	/position\/size prop `left` is static/.test(catchMsg(() => jsx(Label, { left: () => 1 }))),
);
check(
	"reactive width (position) rejected with guidance",
	/position\/size prop `width` is static/.test(catchMsg(() => jsx(Label, { width: () => 1 }))),
);
check(
	"reactive unknown prop rejected with the reactive-props list",
	/can't be a reactive binding \(reactive props:/.test(
		catchMsg(() => jsx(Label, { frobnicate: () => 1 })),
	),
);

// --- onTap: active + behavior; delegate fires ---
let tapped = null;
const tapNode = jsx(Container, {
	onTap: (c, x, y) => {
		tapped = [x, y];
	},
});
check("onTap sets active", tapNode.active === true);
tapNode.behavior.onTouchEnded(tapNode, 0, 7, 9);
check("onTap delegate fires with coords", tapped[0] === 7 && tapped[1] === 9);

// --- button events: consume by default, pass-through on false ---
let pressed = 0;
const btn = jsx(Container, {
	onPressSelect: () => {
		pressed++;
	}, // returns undefined -> truthy consume
	onPressBack: () => false, // explicit pass-through
});
check("button consumes by default", btn.behavior.onPressSelect(btn) === true && pressed === 1);
check("button returning false passes up", btn.behavior.onPressBack(btn) === false);
check("unbound button on same behavior is false", btn.behavior.onPressUp(btn) === false);

// --- Fragment returns its children ---
check("Fragment returns children", Fragment({ children: [1, 2] }).join(",") === "1,2");

// --- appendChild: every child kind ---
const par = new Container(null, {});
appendChild(par, undefined);
appendChild(par, null);
appendChild(par, false);
appendChild(par, true);
check("nullish/boolean children are skipped", par.contents.length === 0);
appendChild(par, "text");
appendChild(par, 42);
check(
	"string/number children become Labels",
	par.contents.length === 2 && par.contents[0].string === "text" && par.contents[1].string === "42",
);
appendChild(par, [new Label(null, {}), new Label(null, {})]);
check("array child recurses", par.contents.length === 4);
let fnErr = "";
try {
	appendChild(par, () => 1);
} catch (e) {
	fnErr = e.message;
}
check("function child throws", fnErr === "jsx:fn-child");

// --- render: mounts a tree, seeds screen, applies focus ---
sandbox.Application.prototype.width = 200; // stub the measured screen size
sandbox.Application.prototype.height = 228;
let focused = null;
const origFocus = sandbox.Container.prototype.focus;
sandbox.Container.prototype.focus = function () {
	focused = this;
};
const app = render(() => jsx(Container, { focus: true, name: "root" }), { name: "app" });
check("render returns an Application", app instanceof sandbox.Application);
check("render mounts the tree", app.contents.length === 1 && app.contents[0].name === "root");
check("render seeds screen dimensions", screen.width === 200 && screen.height === 228);
check("render applies pending focus after mount", focused === app.contents[0]);
sandbox.Container.prototype.focus = origFocus;

// render() with NO dict arg (dict || {} default)
const app2 = render(() => jsx(Container, { name: "nodict" }));
check("render without dict works", app2.contents[0].name === "nodict");

// ---- guarded bindings (2026-07): a throwing thunk must not take the app down.
// Errors route to __spError (set here; console fallback otherwise) WITH prop +
// node-class context. Covers BOTH the first render (effect creation — used to
// abort the whole module load) and re-runs (the notify path).
{
	const reported = [];
	sandbox.__spError = (e) => reported.push(String(e && e.message ? e.message : e));
	// (a) FIRST render throws: node still created, siblings still render
	const sibsig = signal("sib");
	const tree = jsx(Container, {
		children: [
			jsx(Label, {
				name: "boomer",
				string: () => {
					throw new Error("first-render boom");
				},
			}),
			jsx(Label, { name: "sibling", string: () => sibsig.value }),
		],
	});
	check(
		"first-render binding throw is contained",
		reported.length === 1 && reported[0] === "first-render boom",
	);
	check("sibling binding still rendered", tree.contents[1].string === "sib");
	// (b) RE-run throws: last good value kept, subscription survives
	const val = signal(1);
	const risky = jsx(Label, {
		string: () => {
			if (val.value === 2) throw new Error("re-run boom");
			return "v" + val.value;
		},
	});
	check("risky binding first value ok", risky.string === "v1");
	val.value = 2; // throws inside the binding -> contained + reported
	check(
		"re-run binding throw keeps last value",
		risky.string === "v1" && reported.some((m) => m === "re-run boom"),
	);
	val.value = 3; // recovers: the subscription survived the throwing run
	check("binding recovers after a throwing run", risky.string === "v3");
	sandbox.__spError = undefined; // (delete can be a no-op on a vm global)
}

// binding guard falls back to the console (no __spError): context string
// includes the prop and the node class name
{
	const savedC = sandbox.console;
	const lines = [];
	sandbox.console = { log: (...a) => lines.push(a.map(String).join(" ")) };
	jsx(Label, {
		string: () => {
			throw new Error("ctxboom");
		},
	});
	check(
		"guard logs prop + node class context",
		// the sandbox stub's class is StubContent — asserting it proves the
		// context includes the NODE CLASS name (on-device this reads "Label")
		lines.some((l) => l.includes("binding 'string' on StubContent") && l.includes("ctxboom")),
	);
	sandbox.console = savedC;
}

done();
