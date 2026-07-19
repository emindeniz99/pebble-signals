// Dialog suite — runtime/dialog (opt-in centered modal card). Proves: Dialog
// returns a fill-skinned Container with an EXPLICIT width + height (gotcha 16)
// centered via computed left/top, wrapping a Column that stacks a bold title
// Label, a wrapping message Label (given an explicit width), and an optional
// hint Label; static strings render once; reactive title/message thunks update
// their Label's string on signal change (idiom 5b); every prop branch (fill/
// titleColor/textColor/width/height overrides vs defaults, static vs thunk vs
// omitted title/message, present vs omitted hint) is covered. Skin/Style are
// host compartment globals (absent in the Node sandbox) — inject stubs BEFORE
// loading dialog, the same idiom card.test uses. StubContent records
// construction dicts via Object.assign, so node.skin / node.width / label.style
// carry the stub dicts.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
// Skin/Style stubs: store the construction dict so fill/color/font are assertable.
sandbox.Skin = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
sandbox.Style = class {
	d: unknown;
	constructor(d: unknown) {
		this.d = d;
	}
};
const { signal, createRoot } = signals;
const { Dialog } = await loadModule("runtime/dialog");
const { check, done } = makeChecker("dialog");

// --- defaults + static title/message/hint, explicit width+height ---
{
	const [node] = createRoot(() =>
		Dialog({ title: "Alert", message: "Battery low", hint: "SELECT ok", width: 120, height: 100 }),
	);
	check("Dialog returns a container", node && typeof node.add === "function");
	check("outer carries the default fill Skin", node.skin && node.skin.d.fill === "#202020");
	check("outer has an explicit width", node.width === 120);
	check("outer has an explicit height", node.height === 100);
	check("outer is horizontally centered", node.left === (0 - 120) / 2);
	check("outer is vertically centered", node.top === (0 - 100) / 2);
	const column = node.contents[0];
	check(
		"outer wraps one Column of 3 Labels",
		node.contents.length === 1 && column.contents.length === 3,
	);
	const [titleLabel, messageLabel, hintLabel] = column.contents;
	check("title Label sits on top", titleLabel.string === "Alert");
	check("title uses bold 18px Gothic", titleLabel.style.d.font === "bold 18px Gothic");
	check("default title color is white", titleLabel.style.d.color === "white");
	check("message Label renders its string", messageLabel.string === "Battery low");
	check("message uses 18px Gothic", messageLabel.style.d.font === "18px Gothic");
	check("default message color is white", messageLabel.style.d.color === "white");
	check("message Label carries an explicit wrap width", messageLabel.width === 120 - 16);
	check("hint Label sits at the bottom", hintLabel.string === "SELECT ok");
	check("hint uses the smaller 14px Gothic", hintLabel.style.d.font === "14px Gothic");
}

// --- reactive title + message thunks update on signal change (idiom 5b) ---
// omits width/height to exercise the screen.{width,height} default branch.
{
	const t = signal("A");
	const m = signal("one");
	const [node] = createRoot(() => Dialog({ title: () => t.value, message: () => m.value }));
	const column = node.contents[0];
	const [titleLabel, messageLabel] = column.contents;
	check("reactive title renders initial value", titleLabel.string === "A");
	check("reactive message renders initial value", messageLabel.string === "one");
	// screen.width/height are 0 until render() runs — proves the default branch ran.
	check("width defaults from screen width", node.width === 0 - 20);
	check("height defaults from screen height", node.height === 0 - 40);
	t.value = "B";
	check("reactive title updates on signal change", titleLabel.string === "B");
	m.value = "two";
	check("reactive message updates on signal change", messageLabel.string === "two");
}

// --- all color/fill overrides + omitted hint (still has title + message) ---
{
	const [node] = createRoot(() =>
		Dialog({
			title: "X",
			message: "Y",
			fill: "navy",
			titleColor: "yellow",
			textColor: "cyan",
			width: 100,
			height: 80,
		}),
	);
	check("custom fill forwarded to the skin", node.skin.d.fill === "navy");
	const column = node.contents[0];
	check("omitted hint leaves only title + message", column.contents.length === 2);
	const [titleLabel, messageLabel] = column.contents;
	check("custom title color forwarded", titleLabel.style.d.color === "yellow");
	check("custom message color forwarded", messageLabel.style.d.color === "cyan");
}

// --- empty props: no title/message/hint — safe, empty column ---
{
	const [node] = createRoot(() => Dialog({}));
	check("empty Dialog still returns a container", node && typeof node.add === "function");
	check("empty Dialog has an empty column", node.contents[0].contents.length === 0);
	check("empty Dialog still carries the default fill", node.skin.d.fill === "#202020");
}

done();
