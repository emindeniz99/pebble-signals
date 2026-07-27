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
		"outer wraps one Column of title + message box + hint",
		node.contents.length === 1 && column.contents.length === 3,
	);
	// the message is its OWN Column of per-line Labels — a width alone does not
	// wrap a Piu Label on this port, so the body is wrapped by hand (codex P2)
	const [titleLabel, messageBox, hintLabel] = column.contents;
	check("title Label sits on top", titleLabel.string === "Alert");
	check("title uses bold 18px Gothic", titleLabel.style.d.font === "bold 18px Gothic");
	check("default title color is white", titleLabel.style.d.color === "white");
	const messageLabel = messageBox.contents[0];
	check("short message needs exactly one line", messageBox.contents.length === 1);
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
	const [titleLabel, messageBox] = column.contents;
	check("reactive title renders initial value", titleLabel.string === "A");
	check("reactive message renders initial value", messageBox.contents[0].string === "one");
	// screen.width/height are 0 until render() runs — proves the default branch ran.
	check("width defaults from screen width", node.width === 0 - 20);
	check("height defaults from screen height", node.height === 0 - 40);
	t.value = "B";
	check("reactive title updates on signal change", titleLabel.string === "B");
	m.value = "two";
	// the box is REBUILT (flow.ts's Show shape), so re-read it — the old Label is gone
	check("reactive message updates on signal change", messageBox.contents[0].string === "two");
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
	const [titleLabel, messageBox] = column.contents;
	check("custom title color forwarded", titleLabel.style.d.color === "yellow");
	check("custom message color forwarded", messageBox.contents[0].style.d.color === "cyan");
}

// --- a long message WRAPS into one Label per line (the whole point of the fix) ---
{
	const [node] = createRoot(() =>
		Dialog({
			message: "the quick brown fox jumps over the lazy dog again and again",
			width: 120,
			height: 100,
		}),
	);
	const box = node.contents[0].contents[0];
	// width 120 - 16 padding = 104px / 9px per char = an 11-char budget
	check("long message becomes several line Labels", box.contents.length > 1);
	check(
		"every line stays within the character budget (or is a lone long word)",
		box.contents.every((l) => l.string.length <= 11 || l.string.indexOf(" ") < 0),
	);
	check(
		"the lines reassemble into the original message",
		box.contents.map((l) => l.string).join(" ") ===
			"the quick brown fox jumps over the lazy dog again and again",
	);
	check(
		"each line carries the wrap width",
		box.contents.every((l) => l.width === 104),
	);
}

// --- wrap edges: the line cap, and runs of whitespace -----------------------
{
	const [node] = createRoot(() =>
		Dialog({
			message: "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj",
			width: 60,
			height: 100,
		}),
	);
	const box = node.contents[0].contents[0];
	// 60 - 16 = 44px / 9 = a 4-char budget, so every word is its own line — the
	// 6-line cap must stop the wrap rather than overflow the card
	check("the wrap stops at the message line cap", box.contents.length === 6);
	check("the capped lines are the FIRST ones", box.contents[0].string === "aaaa");
}
{
	const [node] = createRoot(() =>
		Dialog({ message: "  double   spaced  text  ", width: 200, height: 100 }),
	);
	const box = node.contents[0].contents[0];
	check("runs of whitespace collapse to single spaces", box.contents.length === 1);
	check("…with no leading or trailing padding", box.contents[0].string === "double spaced text");
}

// --- empty props: no title/message/hint — safe, empty column ---
{
	const [node] = createRoot(() => Dialog({}));
	check("empty Dialog still returns a container", node && typeof node.add === "function");
	check("empty Dialog has an empty column", node.contents[0].contents.length === 0);
	check("empty Dialog still carries the default fill", node.skin.d.fill === "#202020");
}

done();
