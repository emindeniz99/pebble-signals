// Card suite — runtime/card (opt-in titled content box). Proves: Card returns
// a fill-skinned Container wrapping a Column that stacks a bold title Label over
// a body Container; a passed child mounts in the body; a reactive title thunk
// updates the title Label's string on signal change (idiom 5b); the fill Skin
// and default title Style/color resolve; and every prop branch (fill/titleColor/
// bodyColor/width/height overrides, static vs thunk vs omitted title, omitted
// children) is covered. Skin/Style are host compartment globals (absent in the
// Node sandbox) — inject stubs BEFORE loading card, the same idiom badge.test
// uses for its default Style. StubContent (load-runtime) records construction
// dicts via Object.assign, so `node.skin` / `label.style` carry the stub dicts.
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
const { Card } = await loadModule("runtime/card");
const { check, done } = makeChecker("card");

// --- defaults + static title + a mounted child in the body ---
{
	const child = new sandbox.Label(null, { string: "body!" });
	const [node] = createRoot(() => Card({ title: "Weather", children: child }));
	check("Card returns a container", node && typeof node.add === "function");
	check("outer carries a fill Skin", node.skin && node.skin.d.fill === "#202020");
	const column = node.contents[0];
	check(
		"outer wraps one Column",
		node.contents.length === 1 && column && column.contents.length === 2,
	);
	const titleLabel = column.contents[0];
	check("title Label sits on top", titleLabel.string === "Weather");
	check("title uses the bold 18px Gothic style", titleLabel.style.d.font === "bold 18px Gothic");
	check("default title color is white", titleLabel.style.d.color === "white");
	const body = column.contents[1];
	check(
		"body holds the passed child",
		body.contents[0] === child && body.contents[0].string === "body!",
	);
	check("default body has no skin", body.skin === undefined);
}

// --- reactive title thunk updates on signal change (idiom 5b) ---
{
	const t = signal("Steps 0");
	const [node] = createRoot(() => Card({ title: () => t.value }));
	const titleLabel = node.contents[0].contents[0];
	check("reactive title renders initial value", titleLabel.string === "Steps 0");
	t.value = "Steps 42";
	check("reactive title updates when the signal changes", titleLabel.string === "Steps 42");
}

// --- all overrides: fill / titleColor / bodyColor / width / height ---
{
	const [node] = createRoot(() =>
		Card({
			title: "X",
			fill: "navy",
			titleColor: "yellow",
			bodyColor: "#111",
			width: 140,
			height: 80,
		}),
	);
	check("custom fill forwarded to the skin", node.skin.d.fill === "navy");
	check("explicit width wins over screen default", node.width === 140);
	check("explicit height applied", node.height === 80);
	const column = node.contents[0];
	check("custom title color forwarded", column.contents[0].style.d.color === "yellow");
	check("custom body color skins the body", column.contents[1].skin.d.fill === "#111");
}

// --- omitted title + omitted children: no crash, blank bar, empty body ---
{
	const [node] = createRoot(() => Card({}));
	const column = node.contents[0];
	check(
		"omitted title leaves the bar blank (no string set)",
		column.contents[0].string === undefined,
	);
	check("omitted children yield an empty body", column.contents[1].contents.length === 0);
	// screen.width is 0 until render() runs — the default path reads it, proving
	// the fallback branch (no explicit width) is taken.
	check("width defaults to screen width", node.width === 0);
}

done();
