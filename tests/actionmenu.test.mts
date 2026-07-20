// ActionMenu suite — runtime/actionmenu (opt-in modal action sheet, display-
// only). Proves: ActionMenu returns an OUTER backdrop Container with EXPLICIT
// width+height + a fill Skin (gotcha 16) wrapping an inner Column (explicit
// width + content height = [title?] + actions*rowHeight) that stacks an optional
// title Label over one Label per action whose strings match; the `active` action
// wears `activeColor` text + the `activeFill` Skin while the rest wear `color`
// text + a null skin (tabs.ts idiom); a reactive `active` thunk moves the
// highlight on signal change (idiom 5b — drive the signal, re-read the rows'
// styles); the title (borrowing activeColor + titleFont) is present when set and
// absent when not, and never highlighted; an out-of-range `active` clamps to the
// ends; an empty action set is a cell-less column with no crash; ActionMenu owns
// no timer (display-only, Rule 8); and every prop branch (width/height/
// background/color/activeColor/activeFill/titleFont/font/rowHeight defaults vs
// overrides, title present vs absent, static number vs thunk) is covered.
// `Style`/`Skin` are host compartment globals (absent in the Node sandbox) —
// inject dict-storing stubs BEFORE loading actionmenu, the idiom tabs.test /
// menu.test / card.test use, so each row's `.style.d.color` / `.skin.d.fill` and
// the backdrop's `.skin.d.fill` are assertable. StubContent (load-runtime) is
// the Container/Column, StubLeaf the Labels.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule, liveTimers } = await loadRuntime();
jsxM.screen.width = 144; // ActionMenu reads screen.width for its default backdrop width (gotcha 16)
jsxM.screen.height = 168; // ...and screen.height for its default backdrop height
// Style/Skin stubs: store the construction dict so font/color/fill are assertable.
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
const { ActionMenu } = await loadModule("runtime/actionmenu");
const { check, done } = makeChecker("actionmenu");

// --- defaults + static number active + title present ---
{
	const [node] = createRoot(() =>
		ActionMenu({ actions: ["Reply", "Archive", "Delete"], active: 1, title: "Message" }),
	);
	check("ActionMenu returns a container", node && typeof node.add === "function");
	// outer backdrop carries EXPLICIT width + height + a fill Skin (gotcha 16) — a
	// size-less container measures 0 and draws nothing on device.
	check(
		"outer backdrop is explicit screen-sized with the default background fill",
		node.width === 144 && node.height === 168 && node.skin.d.fill === "#000000",
	);
	const col = node.contents[0];
	check(
		"outer wraps exactly one inner Column",
		node.contents.length === 1 && col && typeof col.add === "function",
	);
	// inner column: explicit width + content height = title(30) + 3 actions*30 = 120
	check(
		"inner column sized to width + content height (30 + 3*30)",
		col.width === 144 && col.height === 120,
	);
	// title Label first, then one Label per action
	check("column holds the title + one Label per action", col.contents.length === 4);
	const title = col.contents[0];
	check("title Label sits on top with the title string", title.string === "Message");
	check("title uses the default bold 24px Gothic font", title.style.d.font === "bold 24px Gothic");
	check("title borrows activeColor (default white)", title.style.d.color === "white");
	check("title row carries explicit width + rowHeight", title.width === 144 && title.height === 30);
	// action rows follow the title (offset by 1 in the column)
	check(
		"action strings match in order after the title",
		col.contents[1].string === "Reply" &&
			col.contents[2].string === "Archive" &&
			col.contents[3].string === "Delete",
	);
	check(
		"action rows carry an explicit width + the default rowHeight (30)",
		col.contents[1].width === 144 && col.contents[1].height === 30,
	);
	check(
		"action rows use the default 18px Gothic font",
		col.contents[1].style.d.font === "18px Gothic",
	);
	// active action is index 1 => column child 2 (title offset)
	check(
		"active action uses activeColor (default white) + the activeFill skin (default #1a4d4d)",
		col.contents[2].style.d.color === "white" && col.contents[2].skin.d.fill === "#1a4d4d",
	);
	check(
		"inactive actions use color (default #808080) + a null skin",
		col.contents[1].style.d.color === "#808080" &&
			col.contents[1].skin === null &&
			col.contents[3].style.d.color === "#808080" &&
			col.contents[3].skin === null,
	);
}

// --- reactive thunk active + every override + title; the highlight moves (5b) ---
{
	const a = signal(0);
	const [node] = createRoot(() =>
		ActionMenu({
			actions: ["A", "B", "C"],
			active: () => a.value,
			title: "Pick",
			width: 120,
			height: 100,
			background: "#123",
			color: "#111",
			activeColor: "cyan",
			activeFill: "#004",
			titleFont: "bold 28px Gothic",
			font: "24px Gothic",
			rowHeight: 20,
		}),
	);
	check(
		"explicit width/height/background override the backdrop",
		node.width === 120 && node.height === 100 && node.skin.d.fill === "#123",
	);
	const col = node.contents[0];
	check("inner column content height = title(20) + 3*20", col.width === 120 && col.height === 80);
	const title = col.contents[0];
	check("title font override applied", title.style.d.font === "bold 28px Gothic");
	check("title borrows the activeColor override", title.style.d.color === "cyan");
	check("title row height follows the rowHeight override", title.height === 20);
	check(
		"action rows follow the width + rowHeight + font overrides",
		col.contents[1].width === 120 &&
			col.contents[1].height === 20 &&
			col.contents[1].style.d.font === "24px Gothic",
	);
	// initial active 0 => first action = column child 1
	check(
		"initial active action uses the activeColor + activeFill overrides",
		col.contents[1].style.d.color === "cyan" && col.contents[1].skin.d.fill === "#004",
	);
	check(
		"initial inactive action uses the color override + a null skin",
		col.contents[2].style.d.color === "#111" && col.contents[2].skin === null,
	);
	// drive the signal -> the highlight moves to action index 2 (column child 3)
	a.value = 2;
	check(
		"reactive active moves the highlight (idiom 5b)",
		col.contents[3].style.d.color === "cyan" && col.contents[3].skin.d.fill === "#004",
	);
	check(
		"the previously-active action reverts to inactive (color + null skin)",
		col.contents[1].style.d.color === "#111" && col.contents[1].skin === null,
	);
}

// --- title omitted: no title Label, actions start at column child 0 ---
{
	const [node] = createRoot(() => ActionMenu({ actions: ["X", "Y"], active: 0 }));
	const col = node.contents[0];
	check("omitted title yields one Label per action, no header", col.contents.length === 2);
	check(
		"actions start at the top when there is no title",
		col.contents[0].string === "X" && col.contents[1].string === "Y",
	);
	check("column content height excludes the title row (2*30)", col.height === 60);
	check(
		"active action 0 is highlighted, the other inactive",
		col.contents[0].style.d.color === "white" &&
			col.contents[0].skin.d.fill === "#1a4d4d" &&
			col.contents[1].style.d.color === "#808080" &&
			col.contents[1].skin === null,
	);
}

// --- out-of-range active clamps to the ends ---
{
	const [over] = createRoot(() => ActionMenu({ actions: ["X", "Y"], active: 5 }));
	const oc = over.contents[0];
	check(
		"an over-range active clamps to the LAST action",
		oc.contents[1].style.d.color === "white" &&
			oc.contents[1].skin.d.fill === "#1a4d4d" &&
			oc.contents[0].style.d.color === "#808080" &&
			oc.contents[0].skin === null,
	);
	const [under] = createRoot(() => ActionMenu({ actions: ["X", "Y"], active: -3 }));
	const uc = under.contents[0];
	check(
		"a negative active clamps to the FIRST action",
		uc.contents[0].style.d.color === "white" &&
			uc.contents[0].skin.d.fill === "#1a4d4d" &&
			uc.contents[1].style.d.color === "#808080",
	);
}

// --- empty actions + no title: a cell-less column, no crash (n=0 branch) ---
{
	const [node] = createRoot(() => ActionMenu({ actions: [], active: 0 }));
	const col = node.contents[0];
	check("empty actions + no title yield a cell-less column", col.contents.length === 0);
	check("an empty column has content height 0", col.height === 0);
	check(
		"an empty sheet still carries an explicit backdrop (width/height/fill)",
		node.width === 144 && node.height === 168 && node.skin.d.fill === "#000000",
	);
}

// --- empty actions WITH a title: just the title row, still no crash ---
{
	const [node] = createRoot(() => ActionMenu({ actions: [], active: 0, title: "Empty" }));
	const col = node.contents[0];
	check(
		"a titled empty sheet holds only the title row",
		col.contents.length === 1 && col.contents[0].string === "Empty",
	);
	check("its content height is one title row (30)", col.height === 30);
}

// --- display-only: ActionMenu owns no timer (Rule 8 — the app drives it) ---
check("ActionMenu registers no timer (display-only, not a self-owning loader)", liveTimers() === 0);

done();
