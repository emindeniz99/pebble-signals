// jsx-runtime suite — the factory, host creation, reactive/button/tap
// bindings, setProp whitelist, appendChild child kinds, Fragment, render.
// Run with: node --experimental-vm-modules tests/jsx.test.mts
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox } = await loadRuntime();
const { signal, setSink } = signals;
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

// The renders above installed the default boundary sink; the legacy blocks
// below pin the BARE-core contract (no boundary), so restore it explicitly.
setSink(null);

// ---- guarded bindings, BARE mode (no boundary installed): a throwing thunk
// must not take the app down. Errors route to __spError (set here; console
// fallback otherwise) WITH prop + node-class context. Covers BOTH the first
// render (effect creation — used to abort the whole module load) and re-runs
// (the notify path). Under render()'s default boundary the same errors
// escalate to the crash screen instead — pinned in the boundary block below.
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

// DEV STRICT MODE (2026-07, owner-requested option): a RETHROWING __spError
// handler turns "contain & survive" into "log fully, THEN crash loudly" —
// the handler always runs first (full context/log), the rethrow then
// propagates (on device: fxAbort with its own stack). Zero runtime cost;
// it's just the existing hook's contract. Pin it so it can't regress.
{
	const seen = [];
	sandbox.__spError = (e) => {
		seen.push(String(e && e.message));
		throw e; // strict: escalate after logging
	};
	// first render: propagates out of jsx() (on device: module load aborts)
	let firstThrew = false;
	try {
		jsx(Label, {
			string: () => {
				throw new Error("strict-first");
			},
		});
	} catch (e) {
		firstThrew = e.message === "strict-first";
	}
	check(
		"strict mode: first-render handler ran, then propagated",
		seen[0] === "strict-first" && firstThrew,
	);
	// re-run: handler fires for the binding AND the notify layer, then the
	// throw propagates out of the setter (on device: fxAbort)
	seen.length = 0;
	const sv = signal(1);
	const nodeS = jsx(Label, {
		string: () => {
			if (sv.value === 2) throw new Error("strict-rerun");
			return "v" + sv.value;
		},
	});
	let rerunThrew = false;
	try {
		sv.value = 2;
	} catch (e) {
		rerunThrew = e.message === "strict-rerun";
	}
	check(
		"strict mode: re-run handler ran (twice: binding + notify), then propagated; last value kept",
		seen.length === 2 && rerunThrew && nodeS.string === "v1",
	);
	sandbox.__spError = undefined;
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
		// the sandbox Label stub's class is StubLeaf — asserting it proves the
		// context includes the NODE CLASS name (on-device this reads "Label")
		lines.some((l) => l.includes("binding 'string' on StubLeaf") && l.includes("ctxboom")),
	);
	// a NAMELESS node class (class `name` is configurable) falls back to "content"
	const savedName = Object.getOwnPropertyDescriptor(sandbox.Label, "name");
	Object.defineProperty(sandbox.Label, "name", { value: "", configurable: true });
	jsx(Label, {
		string: () => {
			throw new Error("noname boom");
		},
	});
	Object.defineProperty(sandbox.Label, "name", savedName);
	check(
		"guard falls back to 'content' for a nameless class",
		lines.some((l) => l.includes("binding 'string' on content") && l.includes("noname boom")),
	);
	sandbox.console = savedC;
}

// ---- top-level error boundary (2026-07 redesign): render()'s DEFAULT sink.
// Owner decision: on a product, telling the wearer the app crashed beats a
// silently frozen watchface. Contract pinned here: an escaped binding error
// disposes the WHOLE tree, empties the app, paints a crash screen carrying
// the context + message (newlines compacted to " ~ " so the small screen
// packs more per line), SELECT retries the build (Solid ErrorBoundary
// `reset` parity), and any other button rethrows the ORIGINAL error (on
// device: fxAbort → host exits the mod — the "exit" button).
{
	const savedC = sandbox.console;
	sandbox.console = { log: () => {} }; // report() logs before painting; keep test output clean
	// host-compartment globals the crash screen styles itself with (the real
	// host always has them; the sandbox needs stubs to cover those paths)
	sandbox.Skin = class {
		constructor(d) {
			Object.assign(this, d);
		}
	};
	sandbox.Style = class {
		constructor(d) {
			Object.assign(this, d);
		}
	};

	// (a) RE-RUN binding error → crash screen; the old tree is really disposed
	let runs = 0;
	const bs = signal(1);
	const app3 = render(
		() =>
			jsx(Container, {
				name: "good",
				children: jsx(Label, {
					string: () => {
						runs++;
						if (bs.value === 2) throw new Error("boundary boom");
						return "b" + bs.value;
					},
				}),
			}),
		undefined,
		{ boundary: true }, // explicit ON (same as the default)
	);
	check("boundary: app renders normally before the crash", app3.contents[0].name === "good");
	bs.value = 2; // throws in the binding -> report -> crash screen
	const crash = app3.contents[0];
	check(
		"boundary: crash screen replaced the tree",
		app3.contents.length === 1 && crash.name !== "good",
	);
	const txt = crash.contents[0];
	check(
		"boundary: crash text carries title, context, message and button hints",
		txt.string.includes("APP CRASHED") &&
			txt.string.includes("binding 'string'") &&
			txt.string.includes("boundary boom") &&
			txt.string.includes("retry") &&
			txt.string.includes("exit"),
	);
	check(
		"boundary: crash body compacts stack newlines to ' ~ '",
		// the Node Error stack is multi-line; on screen it must pack into one
		// wrapped paragraph — only the title and hint keep their own lines
		txt.string.includes(" ~ ") && txt.string.split("\n").length <= 4,
	);
	check(
		"boundary: crash screen styles itself from host globals",
		crash.skin instanceof sandbox.Skin && txt.style instanceof sandbox.Style,
	);
	const runsAtCrash = runs;
	bs.value = 3; // the root was disposed — the old binding must NOT run again
	check("boundary: old tree's effects are dead after the crash", runs === runsAtCrash);
	// the kill path: BACK (and up/down) rethrows the ORIGINAL error
	let killErr = null;
	try {
		crash.behavior.onPressBack(crash);
	} catch (e) {
		killErr = e;
	}
	check(
		"boundary: back press rethrows the original error (exit path)",
		killErr !== null && killErr.message === "boundary boom",
	);
	// the retry path: SELECT re-runs the build under a fresh root. The signal
	// is healthy again (bs=3), so the tree remounts and its binding is LIVE.
	const consumed = crash.behavior.onPressSelect(crash);
	check(
		"boundary: select retries — tree remounts with live bindings",
		consumed === true &&
			app3.contents.length === 1 &&
			app3.contents[0].name === "good" &&
			app3.contents[0].contents[0].string === "b3",
	);
	bs.value = 4;
	check("boundary: remounted binding tracks again", app3.contents[0].contents[0].string === "b4");
	// a retry whose build IMMEDIATELY re-throws just repaints the crash screen
	bs.value = 2; // crash again
	const crash2 = app3.contents[0];
	check("boundary: crashes again after retry", crash2.contents[0].string.includes("APP CRASHED"));
	crash2.behavior.onPressSelect(crash2); // retry while still broken (bs=2)
	check(
		"boundary: failing retry repaints the crash screen",
		app3.contents.length === 1 && app3.contents[0].contents[0].string.includes("APP CRASHED"),
	);
	bs.value = 3; // heal + retry once more -> live tree again
	const crash3 = app3.contents[0];
	crash3.behavior.onPressSelect(crash3);
	check("boundary: retry recovers after healing", app3.contents[0].name === "good");

	// (b) BUILD error → crash screen instead of propagating out of render().
	// A stackless object error keeps the message SHORT — pins the uncapped
	// side of the crash-text branch (Error throws all carry long Node stacks).
	const app4 = render(() => {
		throw { name: "BuildBoom", message: "build boom" };
	});
	check(
		"boundary: throwing build paints the crash screen",
		app4.contents.length === 1 &&
			app4.contents[0].contents[0].string.includes("build boom") &&
			!app4.contents[0].contents[0].string.includes("…"),
	);
	// retrying a build that STILL throws (the throw escapes createRoot, not
	// just a guarded binding) lands in retry's own catch and repaints
	const crash4 = app4.contents[0];
	crash4.behavior.onPressSelect(crash4);
	check(
		"boundary: retry of a throwing build repaints the crash screen",
		app4.contents.length === 1 && app4.contents[0].contents[0].string.includes("build boom"),
	);

	// (c) FIRST-RENDER binding error mid-build → crash screen up, orphan
	// siblings dropped (render() disposes the never-mounted tree). The second
	// throwing binding proves "first crash wins": its report re-enters the
	// sink after panicked is set and must NOT repaint. The long message pins
	// the 380-char cap (the screen is small and the arena is tight).
	const app5 = render(() =>
		jsx(Container, {
			name: "orphan",
			children: [
				jsx(Label, {
					string: () => {
						throw new Error("mid-build boom " + "x".repeat(400));
					},
				}),
				jsx(Label, {
					string: () => {
						throw new Error("second boom");
					},
				}),
			],
		}),
	);
	const crash5 = app5.contents[0];
	check(
		"boundary: mid-build crash shows the screen, not the tree",
		app5.contents.length === 1 &&
			crash5.name !== "orphan" &&
			crash5.contents[0].string.includes("mid-build boom"),
	);
	check(
		"boundary: first crash wins (second error does not repaint)",
		!crash5.contents[0].string.includes("second boom"),
	);
	check(
		"boundary: crash text is capped for the small screen",
		crash5.contents[0].string.includes("…") &&
			crash5.contents[0].string.length < 450 &&
			crash5.contents[0].string.includes("exit"),
	);

	// (d) boundary:false (strict): a build error PROPAGATES out of render()
	let strictBuild = false;
	try {
		render(
			() => {
				throw new Error("strict build");
			},
			undefined,
			{ boundary: false },
		);
	} catch (e) {
		strictBuild = e.message === "strict build";
	}
	check("boundary:false — build error propagates", strictBuild);

	// (e) boundary:false (strict): a re-run binding error escapes the setter
	const ss = signal(1);
	render(
		() =>
			jsx(Label, {
				string: () => {
					if (ss.value === 2) throw new Error("strict rerun");
					return "x";
				},
			}),
		undefined,
		{ boundary: false },
	);
	let strictRerun = false;
	try {
		ss.value = 2;
	} catch (e) {
		strictRerun = e.message === "strict rerun";
	}
	check("boundary:false — binding error escapes the setter", strictRerun);

	// (f) __spError still outranks the boundary: handler runs, no crash screen
	const seen = [];
	sandbox.__spError = (e) => seen.push(String(e && e.message));
	const hs = signal(1);
	const app6 = render(() =>
		jsx(Container, {
			name: "kept",
			children: jsx(Label, {
				string: () => {
					if (hs.value === 2) throw new Error("handler boom");
					return "h" + hs.value;
				},
			}),
		}),
	);
	hs.value = 2;
	check(
		"boundary: __spError outranks it (handler ran, tree kept)",
		seen[0] === "handler boom" && app6.contents[0].name === "kept",
	);
	sandbox.__spError = undefined;

	// (g) screen shape/depth: render() reads the HOST display global — round
	// panels get wider crash-text insets (content away from clipped corners)
	sandbox.screen = { round: true, color: true }; // gabbro-shaped host display
	const rr = signal(1);
	const app8 = render(() =>
		jsx(Label, {
			string: () => {
				if (rr.value === 2) throw new Error("round boom");
				return "r";
			},
		}),
	);
	check("screen.round/color read from the host display", screen.round && screen.color);
	rr.value = 2;
	check("crash text insets widen on a round screen", app8.contents[0].contents[0].left === 26);
	sandbox.screen = undefined;
	const app9 = render(() => jsx(Label, { string: "flat" }));
	check(
		"no host display global (tests) -> rect defaults",
		screen.round === false && screen.color === false && app9.contents[0].string === "flat",
	);

	setSink(null); // restore bare mode for whatever runs after this suite
	sandbox.console = savedC;
	sandbox.Skin = undefined; // (delete can be a no-op on a vm global)
	sandbox.Style = undefined;
}

// ---- __SP_CRASH_UI__ build flag (both DEFINED arms; undefined = every test
// above). false = the lean --no-crash-ui sink: an escaped error still LOGS,
// then CONTAINS — no crash screen, the node keeps its last good value, the
// tree stays mounted. true = explicitly-defined ON (esbuild `define` in a
// default build): identical to undefined — the crash screen paints.
{
	const savedC = sandbox.console;
	const lines = [];
	sandbox.console = { log: (...a) => lines.push(a.join(" ")) };

	sandbox.__SP_CRASH_UI__ = false; // lean build: DCE would drop showCrash
	const off = signal(1);
	const appOff = render(() =>
		jsx(Container, {
			name: "lean-tree",
			children: jsx(Label, {
				string: () => {
					if (off.value === 2) throw new Error("lean boom");
					return "ok" + off.value;
				},
			}),
		}),
	);
	off.value = 2; // escapes the binding — lean sink: log + contain
	check(
		"CRASH_UI=false: tree survives, label keeps last good value",
		appOff.contents[0].name === "lean-tree" && appOff.contents[0].contents[0].string === "ok1",
	);
	check(
		"CRASH_UI=false: the error still logged in full",
		lines.some((l) => l.includes("lean boom")),
	);

	sandbox.__SP_CRASH_UI__ = true; // defined-ON build: same as undefined
	const on = signal(1);
	const appOn = render(() =>
		jsx(Label, {
			string: () => {
				if (on.value === 2) throw new Error("on boom");
				return "v" + on.value;
			},
		}),
	);
	on.value = 2;
	check(
		"CRASH_UI=true: crash screen paints as in a default build",
		appOn.contents.length === 1 && appOn.contents[0].contents[0].string.includes("on boom"),
	);

	sandbox.__SP_CRASH_UI__ = undefined;
	setSink(null);
	sandbox.console = savedC;
}

// ---- deep-review regressions (jsx-runtime) ---------------------------------

// U1: react-jsx hoists `key` to the third argument — components must get it
// back as props.key (For's keyed reconcile depends on it), hosts ignore it.
{
	const gotKeys = [];
	const C = (p) => {
		gotKeys.push(p.key);
		return jsx(Label, { string: "k" });
	};
	jsx(C, { a: 1 }, "K1");
	jsx(C, null, "K2"); // transform may pass null props with a key
	const hk = jsx(Container, { name: "hostkey" }, "KH"); // host: ignored, no throw
	check("U1 hoisted key re-injected into component props", gotKeys.join(",") === "K1,K2");
	check("U1 host element ignores the key argument", hk.name === "hostkey");
	// an explicit props.key wins over the argument (never clobber)
	jsx(C, { key: "explicit" }, "arg");
	check("U1 explicit props.key wins", gotKeys[2] === "explicit");
}

// U5: a SECOND render() disposes the previous tree — its bindings must not
// keep running (and its crashes must not cross-wire onto the new app).
{
	const s5 = signal(0);
	let oldRuns = 0;
	render(() =>
		jsx(Label, {
			string: () => {
				oldRuns++;
				return "old" + s5.value;
			},
		}),
	);
	const after = oldRuns;
	render(() => jsx(Label, { string: "new" }));
	s5.value = 1; // must NOT re-run the old app's binding
	check("U5 second render disposes the previous root", oldRuns === after);
	setSink(null);
}

// U10: a user-supplied `behavior` silently clobbered by onTap/button props —
// now a loud conflict error.
{
	let u10 = "";
	try {
		jsx(Container, { behavior: { onDisplaying() {} }, onTap: () => {} });
	} catch (e) {
		u10 = e.message;
	}
	check("U10 behavior + onTap conflict fails loud", /behavior.*conflicts/.test(u10));
}

// --- non-container guard: a Piu LEAF cannot take children — fail loud AT the
// element (silent nothing / a later raw `add: not a function` before) ---
{
	let leafErr = "";
	try {
		jsx(Label, { string: "score", children: jsx(Container, {}) });
	} catch (e) {
		leafErr = String((e && e.message) || e);
	}
	check(
		"children on a Label throw loud with the element named",
		leafErr.includes("<StubLeaf> cannot take children (not a container)"),
	);
	// `nothing` children — a dead conditional like {debug && <X/>} — stay legal
	const quiet = jsx(Label, { string: "ok", children: false });
	check("nothing-children (false/null) on a leaf are legal", quiet.string === "ok");
	const quiet2 = jsx(Label, { string: "ok2", children: [null, false, [undefined]] });
	check("nested nothing-children arrays are legal too", quiet2.string === "ok2");
	// containers keep taking children exactly as before
	const box = jsx(Container, { children: jsx(Label, { string: "in" }) });
	check("containers still take children", box.contents[0].string === "in");
}

// --- D4 diet: comma-string membership must respect word boundaries ----------
// REACTIVE_PROPS/BUTTON_EVENTS/POSITION_PROPS became comma STRINGS (module
// scope is boot RAM — a frozen array costs ~2+N slots); a naive indexOf would
// accept substrings ("tring" inside "string") and bind an illegal prop.
{
	let boom = "";
	try {
		jsx(Container, { tring: () => "x" });
	} catch (e) {
		boom = String((e as Error).message);
	}
	check("substring of a valid reactive prop is still rejected", boom.indexOf("tring") >= 0);
	boom = "";
	try {
		jsx(Container, { strings: () => "x" });
	} catch (e) {
		boom = String((e as Error).message);
	}
	check("superstring of a valid reactive prop is still rejected", boom.indexOf("strings") >= 0);
	// a PREFIX of a button event with a function value is not a button — it
	// falls through to the reactive-prop whitelist and throws there
	boom = "";
	try {
		jsx(Container, { onPress: () => 0 });
	} catch (e) {
		boom = String((e as Error).message);
	}
	check("prefix of a button event is not treated as a button", boom.indexOf("onPress") >= 0);
	// boundary positives: first and last entries of each list still match
	const first = jsx(Container, { string: () => "ok" }) as any;
	check("first whitelist entry still binds", first.string === "ok");
	const last = jsx(Container, { active: () => true }) as any;
	check("last whitelist entry still binds", last.active === true);
}

done();
