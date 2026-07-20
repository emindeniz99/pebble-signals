// Menu suite — runtime/menu (opt-in vertical scrolling selectable list,
// display-only). Proves: Menu returns an outer clipping Container with EXPLICIT
// width+height (gotcha 16) wrapping an inner Column (explicit width + content
// height = items*rowHeight) of one Label per item whose strings match; the
// `selected` row wears `activeColor` text + the `activeFill` Skin while the rest
// wear `color` text + a null skin (tabs.ts idiom); a reactive `selected` thunk
// moves the highlight AND records a moveBy on the inner Column with the expected
// delta when the selection scrolls out of view (idiom 5b + the Move moveBy
// idiom); a still-visible selection issues NO moveBy (Move's guard); an
// out-of-range `selected` clamps to the ends; an empty list is a cell-less
// column with no crash; and every prop branch (width/height/rowHeight/color/
// activeColor/activeFill/font defaults vs overrides, static number vs thunk) is
// covered. StubContent (load-runtime) is the Container/Column and tracks
// movedY/moveCalls for the scroll assertions; StubLeaf the Labels. `Style`/`Skin`
// are host compartment globals (absent in the Node sandbox) — inject dict-storing
// stubs BEFORE loading menu, the idiom tabs.test/card.test use, so each row's
// `.style.d.color` / `.skin.d.fill` is assertable.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 144; // Menu reads screen.width for its default viewport width (gotcha 16)
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
const { Menu } = await loadModule("runtime/menu");
const { check, done } = makeChecker("menu");

// --- defaults + static number selected: dims, rows, strings, highlight ---
{
	const [menu] = createRoot(() => Menu({ items: ["Alarms", "Timers", "Stopwatch"], selected: 1 }));
	check("Menu returns a container", menu && typeof menu.add === "function");
	// outer viewport carries EXPLICIT width + height and CLIPS (gotcha 16) — a
	// size-less container measures 0 and draws nothing on device.
	check(
		"outer clips to an explicit viewport (default width=screen, height=132)",
		menu.width === 144 && menu.height === 132 && menu.clip === true,
	);
	const col = menu.contents[0];
	check(
		"outer wraps exactly one inner Column",
		menu.contents.length === 1 && col && typeof col.add === "function",
	);
	// inner column: explicit width + content height = items.length*rowHeight (28)
	check(
		"inner column sized to width + content height (3*28)",
		col.width === 144 && col.height === 84,
	);
	check("one Label row per item", col.contents.length === 3);
	check(
		"row strings match the items in order",
		col.contents[0].string === "Alarms" &&
			col.contents[1].string === "Timers" &&
			col.contents[2].string === "Stopwatch",
	);
	check(
		"rows carry an explicit width + the default rowHeight (28)",
		col.contents[0].width === 144 && col.contents[0].height === 28,
	);
	// active row (index 1) uses the default activeColor + activeFill; the rest the
	// default color + a null skin.
	check("active row uses activeColor (default white)", col.contents[1].style.d.color === "white");
	check(
		"active row wears the activeFill skin (default #1a4d4d)",
		col.contents[1].skin.d.fill === "#1a4d4d",
	);
	check(
		"inactive rows use color (default #808080)",
		col.contents[0].style.d.color === "#808080" && col.contents[2].style.d.color === "#808080",
	);
	check(
		"inactive rows carry a null skin",
		col.contents[0].skin === null && col.contents[2].skin === null,
	);
	check(
		"default font is the valid 18px Gothic key",
		col.contents[1].style.d.font === "18px Gothic",
	);
	// list fits (3*28=84 <= 132) -> no scroll at construction (Move guard)
	check("a fitting list does not scroll at construction", (col.moveCalls || 0) === 0);
}

// --- reactive thunk moves the highlight AND scrolls; every override applied ---
// viewport height 60, rowHeight 20, 6 rows -> contentHeight 120, maxScroll 60.
{
	const sel = signal(0);
	const [menu] = createRoot(() =>
		Menu({
			items: ["A", "B", "C", "D", "E", "F"],
			selected: () => sel.value,
			width: 100,
			height: 60,
			rowHeight: 20,
			color: "#111",
			activeColor: "cyan",
			activeFill: "#004",
			font: "24px Gothic",
		}),
	);
	const col = menu.contents[0];
	check("explicit width/height override the viewport", menu.width === 100 && menu.height === 60);
	check("inner column content height = 6*20", col.height === 120);
	check("override rowHeight applied to every row", col.contents[0].height === 20);
	check("override font applied to the rows", col.contents[0].style.d.font === "24px Gothic");
	// initial selection (row 0) is visible -> highlighted, no scroll
	check(
		"initial active row uses the activeColor + activeFill overrides",
		col.contents[0].style.d.color === "cyan" && col.contents[0].skin.d.fill === "#004",
	);
	check(
		"initial inactive row uses the color override + a null skin",
		col.contents[1].style.d.color === "#111" && col.contents[1].skin === null,
	);
	check("a visible initial selection does not scroll", (col.moveCalls || 0) === 0);

	// select row 3 -> its bottom (80) is below the window (0+60) -> scroll DOWN 20
	sel.value = 3;
	check(
		"reactive selection moves the highlight to row 3 (idiom 5b)",
		col.contents[3].style.d.color === "cyan" && col.contents[3].skin.d.fill === "#004",
	);
	check(
		"the previously-active row reverts to inactive (color + null skin)",
		col.contents[0].style.d.color === "#111" && col.contents[0].skin === null,
	);
	check(
		"scrolling row 3 into view shifts the column UP by 20 (moveBy delta)",
		col.movedY === -20 && col.moveCalls === 1,
	);

	// select row 2 -> still inside the window (20..80) -> NO moveBy (Move guard)
	sel.value = 2;
	check(
		"selecting a still-visible row moves the highlight",
		col.contents[2].style.d.color === "cyan",
	);
	check(
		"a still-visible selection issues no moveBy (Move guard: moveCalls unchanged)",
		col.moveCalls === 1 && col.movedY === -20,
	);

	// select row 5 -> bottom (120) below window -> scroll to the clamped max (60)
	sel.value = 5;
	check(
		"scrolling to the last row shifts up another 40 (to maxScroll=60)",
		col.movedY === -60 && col.moveCalls === 2,
	);

	// back to row 0 -> its top (0) is above the window -> scroll all the way up
	sel.value = 0;
	check(
		"selecting row 0 scrolls the column back to the top",
		col.movedY === 0 && col.moveCalls === 3,
	);
	check("row 0 is active again after scrolling up", col.contents[0].style.d.color === "cyan");
}

// --- out-of-range static selected clamps to the ends (no scroll needed) ---
{
	const [over] = createRoot(() => Menu({ items: ["X", "Y", "Z"], selected: 9 }));
	const oc = over.contents[0];
	check(
		"an over-range selected clamps to the LAST row",
		oc.contents[2].style.d.color === "white" &&
			oc.contents[0].style.d.color === "#808080" &&
			oc.contents[1].style.d.color === "#808080",
	);
	check(
		"only the clamped last row is skinned",
		oc.contents[2].skin.d.fill === "#1a4d4d" &&
			oc.contents[0].skin === null &&
			oc.contents[1].skin === null,
	);
	const [under] = createRoot(() => Menu({ items: ["X", "Y", "Z"], selected: -5 }));
	const uc = under.contents[0];
	check(
		"a negative selected clamps to the FIRST row",
		uc.contents[0].style.d.color === "white" &&
			uc.contents[1].style.d.color === "#808080" &&
			uc.contents[2].style.d.color === "#808080",
	);
}

// --- empty items: a single cell-less inner column, no crash (n=0 branch) ---
{
	const [menu] = createRoot(() => Menu({ items: [], selected: 0 }));
	check(
		"empty items yield a single empty inner column",
		menu.contents.length === 1 && menu.contents[0].contents.length === 0,
	);
	check(
		"an empty menu still carries an explicit clipping viewport",
		menu.width === 144 && menu.height === 132 && menu.clip === true,
	);
	check("inner column content height is 0 for an empty list", menu.contents[0].height === 0);
	check("an empty menu performs no scroll (no crash)", (menu.contents[0].moveCalls || 0) === 0);
}

done();
