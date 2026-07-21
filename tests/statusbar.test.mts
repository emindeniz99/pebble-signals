// StatusBar suite — runtime/statusbar (opt-in top strip: title left, time
// right). Proves: StatusBar returns a top-anchored Container with a title Label
// whose string matches; a reactive `time` thunk updates its Label when the
// signal it reads changes (drive the signal, re-read lbl.string); a static
// string title renders once; a reactive title thunk updates too; every prop
// default (height 20, color white) resolves; and a `background` builds a fill
// Skin. StubContent (load-runtime) is the Container, StubLeaf the Labels.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 200; // StatusBar reads screen.width for its explicit width (gotcha 16)
// `Style`/`Skin` are host compartment globals (absent in the Node sandbox);
// inject stubs BEFORE loading statusbar so its per-call `new Style`/`new Skin`
// construct — the same idiom badge.test.mts uses for the default Style.
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
const { StatusBar } = await loadModule("runtime/statusbar");
const { check, done } = makeChecker("statusbar");

// --- static string title + reactive time thunk: defaults + live update ---
{
	const clock = signal("12:00");
	const [bar, dispose] = createRoot(() => StatusBar({ title: "Inbox", time: () => clock.value }));
	check("StatusBar returns a node", bar && typeof bar.add === "function");
	// explicit width (gotcha 16) — a left+right anchor alone measures 0 on device
	check(
		"bar anchored top-left, explicit full width",
		bar.left === 0 && bar.top === 0 && bar.width === jsxM.screen.width,
	);
	check("default height applied", bar.height === 20);
	check("no background Skin by default", bar.skin === undefined);
	// two children: title (left), time (right), in that order.
	check("bar has title + time Labels", bar.contents.length === 2);
	const title = bar.contents[0];
	const time = bar.contents[1];
	check("title anchored left", title.left === 4 && title.right === undefined);
	check("time anchored right", time.right === 4 && time.left === undefined);
	check("static string title renders", title.string === "Inbox");
	check("default text color white in style", title.style.d.color === "white");
	check("style uses a valid font key", title.style.d.font === "18px Gothic");
	// reactive: the thunk read inside the driving effect auto-tracks the signal.
	check("time renders initial value", time.string === "12:00");
	clock.value = "12:01";
	check("time Label follows the signal", time.string === "12:01");
	// disposing the root disposes the driving effect: a later signal write is inert.
	dispose();
	clock.value = "12:02";
	check("disposed time Label stops updating", time.string === "12:01");
}

// --- reactive title thunk + custom height/color + background Skin ---
{
	const n = signal(3);
	const [bar] = createRoot(() =>
		StatusBar({ title: () => n.value + " new", height: 24, color: "black", background: "blue" }),
	);
	check("custom height applied", bar.height === 24);
	check("background builds a fill Skin", bar.skin && bar.skin.d.fill === "blue");
	check("omitted time renders no time Label", bar.contents.length === 1);
	const title = bar.contents[0];
	check("custom text color forwarded", title.style.d.color === "black");
	check("reactive title renders initial value", title.string === "3 new");
	n.value = 5;
	check("reactive title follows the signal", title.string === "5 new");
}

// --- empty StatusBar: no title, no time (both omitted) ---
{
	const [bar] = createRoot(() => StatusBar({}));
	check("StatusBar with no props renders no Labels", bar.contents.length === 0);
	check("empty StatusBar still applies default height", bar.height === 20);
}

// --- ROUND screen: a centered STACK (title over time), dropped below the bezel
//     dead-zone — a left/right edge anchor clips on the circle's narrow top band
//     (MEASURED: "Inbox" → "ıx"). Rect keeps title-left / time-right (above). ---
{
	jsxM.screen.round = true;
	const [bar] = createRoot(() => StatusBar({ title: "Inbox", time: () => "09:41" }));
	check("round: taller strip dropped below the top edge", bar.top === 14 && bar.height === 48);
	const title = bar.contents[0];
	const time = bar.contents[1];
	check(
		"round: title is a full-width CENTERED top row (2px breath)",
		title.left === 0 &&
			title.right === 0 &&
			title.top === 2 &&
			title.style.d.horizontal === "center",
	);
	check("round: time is the centered row below the title", time.left === 0 && time.top === 24);
	jsxM.screen.round = false;
}

done();
