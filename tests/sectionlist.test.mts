// sectionlist suite — runtime/sectionlist (opt-in grouped list over VirtualList).
// Proves: the sections+headers FLATTEN into ONE index space in section order
// (`[header, row, row, header, row]`) that VirtualList windows; a `selected` ITEM
// index maps to a flat index THROUGH the rows only (headers skipped — "selection
// skips headers"); the selected row is highlighted (active Style + fill Skin) and
// the window is kept in view (menu.ts's clamp/guard idiom, in row-index units:
// scroll DOWN to reveal a below-window selection, UP for an above-window one, and
// NOT AT ALL while it is already visible); slots past the flattened length blank
// (VirtualList is fed exactly `flatLen` records); a bare-number `selected` applies
// once + clamps out-of-range; a header-only section (rowCount 0) and empty
// sections highlight nothing without crashing; the width/height/rows defaults; and
// disposal frees every effect (a later selection change is inert). Every branch —
// header vs row vs past-end slot, active vs inactive row, thunk vs number vs absent
// selected, keep-in-view up/down/none, rowCount 0, flatten with/without rows — is
// covered for 100% line/branch/function coverage.
//
// `Style`/`Skin` are host compartment globals (absent in the Node sandbox) — inject
// stubs that STORE the construction dict BEFORE loading the module (the tabs.test
// idiom) so each slot's `.style.d.font`/`.style.d.color`/`.skin.d.fill` is
// assertable. StubContent (load-runtime) is VirtualList's host Column, StubLeaf the
// slot Labels; SectionList uses the REAL VirtualList (runtime/flow) so these assert
// integrated behavior, not a re-implementation.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, jsx: jsxM, sandbox, loadModule } = await loadRuntime();
jsxM.screen.width = 180; // SectionList reads screen.width for its default width (gotcha 16)
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
const { SectionList } = await loadModule("runtime/sectionlist");
const { check, done } = makeChecker("sectionlist");

// Distinguishable captions so a slot's TYPE (header vs row) and DATA are visible in
// its `.string`: headers "H:<x>", rows "R:<x>".
const H = (h: string) => "H:" + h;
const R = (r: string) => "R:" + r;
// Two sections -> flat = [H:Fruit(0), R:apple(1), R:pear(2), H:Veg(3), R:kale(4)]
// (length 5); rowFlat = [1,2,4] so items 0,1,2 map to flat 1,2,4 (headers skipped).
const SECTIONS = () => [
	{ header: "Fruit", rows: ["apple", "pear"] },
	{ header: "Veg", rows: ["kale"] },
];
const strs = (host: any) => host.contents.map((c: any) => c.string).join("|");

// --- reactive selection: flatten window, highlight, keep-in-view up/down, dispose -
{
	const sel = signal(0);
	const [host, dispose] = createRoot(() =>
		SectionList({
			sections: SECTIONS,
			renderHeader: H,
			renderRow: R,
			selected: () => sel.value,
			rows: 2, // small window over a 5-record list -> it actually scrolls
			width: 160,
			height: 60, // rowHeight = 30
		}),
	);
	check("VirtualList builds exactly `rows` recycled slots", host.contents.length === 2);
	check(
		"slot Labels carry construction-time width + derived rowHeight (gotcha 16)",
		host.contents[0].width === 160 && host.contents[0].height === 30,
	);
	// item 0 -> flat 1 (apple); flat 1 is inside the initial [0,2) window -> no scroll
	check("initial window shows the flattened head in order", strs(host) === "H:Fruit|R:apple");
	check(
		"a header slot wears the BOLD header style and no skin (non-selectable)",
		host.contents[0].style.d.font === "bold 18px Gothic" && host.contents[0].skin === null,
	);
	check(
		"the selected row is highlighted (normal font, active color, fill skin)",
		host.contents[1].style.d.font === "18px Gothic" &&
			host.contents[1].style.d.color === "white" &&
			host.contents[1].skin.d.fill === "#1a4d4d",
	);

	// step DOWN to item 2 -> flat 4 (kale): below the window -> keep-in-view scrolls down
	sel.value = 2;
	check("selecting a below-window item scrolls down to reveal it", strs(host) === "H:Veg|R:kale");
	check(
		"the newly-selected row is highlighted after the down-scroll",
		host.contents[1].skin.d.fill === "#1a4d4d" && host.contents[1].style.d.color === "white",
	);
	check(
		"the header scrolled into view stays bold + unskinned",
		host.contents[0].style.d.font === "bold 18px Gothic" && host.contents[0].skin === null,
	);

	// step UP to item 0 -> flat 1 (apple): above the window -> keep-in-view scrolls up
	sel.value = 0;
	check("selecting an above-window item scrolls up to reveal it", strs(host) === "R:apple|R:pear");
	check(
		"the selected row is active and the other visible row is INACTIVE",
		host.contents[0].skin.d.fill === "#1a4d4d" &&
			host.contents[1].skin === null &&
			host.contents[1].style.d.color === "#808080",
	);

	// disposal: a later selection change must NOT move the window or highlight (a live
	// effect would scroll to Veg/kale; a disposed one leaves apple/pear untouched)
	const frozen = strs(host);
	dispose();
	sel.value = 2;
	check("disposal frees every effect (a later selection change is inert)", strs(host) === frozen);
}

// --- flatten order in full + VirtualList fed exactly the flattened length + no sel -
{
	const [host] = createRoot(() =>
		SectionList({
			sections: SECTIONS,
			renderHeader: H,
			renderRow: R,
			rows: 7, // > flat length (5): the last two slots must blank
			// width omitted -> screen.width (180); height omitted -> rows * default
		}),
	);
	check(
		"VirtualList still builds `rows` slots past the flattened length",
		host.contents.length === 7,
	);
	check(
		"flatten interleaves headers + rows in section order across the whole list",
		host.contents
			.slice(0, 5)
			.map((c: any) => c.string)
			.join("|") === "H:Fruit|R:apple|R:pear|H:Veg|R:kale",
	);
	check(
		"VirtualList is fed EXACTLY the flattened length (slots past it blank)",
		host.contents[5].string === "" && host.contents[6].string === "",
	);
	check(
		"slot width defaults to screen.width when width is omitted",
		host.contents[0].width === 180,
	);
	check(
		"without `selected` no row is highlighted (every row inactive, no skin)",
		host.contents[1].skin === null &&
			host.contents[1].style.d.color === "#808080" &&
			host.contents[4].skin === null,
	);
}

// --- static-number selected: positions once + highlights the mapped row ------------
{
	const [host] = createRoot(() =>
		SectionList({
			sections: SECTIONS,
			renderHeader: H,
			renderRow: R,
			selected: 2, // static NUMBER: item 2 -> flat 4 (kale)
			rows: 5, // whole list fits -> no scroll
			width: 100,
			height: 100, // rowHeight = 20
		}),
	);
	check(
		"static-number selected shows the whole list unscrolled",
		strs(host) === "H:Fruit|R:apple|R:pear|H:Veg|R:kale",
	);
	check(
		"static-number selected highlights the mapped row (item 2 -> kale)",
		host.contents[4].skin.d.fill === "#1a4d4d" && host.contents[4].style.d.color === "white",
	);
	check(
		"non-selected rows stay inactive under a static selection",
		host.contents[1].skin === null && host.contents[2].skin === null,
	);
}

// --- out-of-range item index clamps to the ends (Math clamp, both directions) ------
{
	const [over] = createRoot(() =>
		SectionList({
			sections: SECTIONS,
			renderHeader: H,
			renderRow: R,
			selected: 99,
			rows: 5,
			width: 100,
			height: 100,
		}),
	);
	check(
		"an over-range item index clamps to the LAST row (kale)",
		over.contents[4].skin.d.fill === "#1a4d4d",
	);
	const [under] = createRoot(() =>
		SectionList({
			sections: SECTIONS,
			renderHeader: H,
			renderRow: R,
			selected: -5,
			rows: 5,
			width: 100,
			height: 100,
		}),
	);
	check(
		"a negative item index clamps to the FIRST row (apple)",
		under.contents[1].skin.d.fill === "#1a4d4d",
	);
}

// --- a header-only section (rowCount 0): header renders, nothing selectable ---------
{
	const sel = signal(0);
	const [host] = createRoot(() =>
		SectionList({
			sections: () => [{ header: "Empty", rows: [] as string[] }],
			renderHeader: H,
			renderRow: R,
			selected: () => sel.value,
			rows: 3,
			width: 90,
			height: 90,
		}),
	);
	check(
		"a header-only section renders its header, remaining slots blank",
		host.contents[0].string === "H:Empty" &&
			host.contents[1].string === "" &&
			host.contents[2].string === "",
	);
	check(
		"with zero selectable rows nothing is highlighted (rowCount 0)",
		host.contents[0].skin === null,
	);
	// stepping the selection is a no-op with no rows (selectedFlat -> -1 -> keep-in-view early-returns)
	sel.value = 5;
	check(
		"selection is inert with zero rows (keep-in-view early-returns)",
		host.contents[0].string === "H:Empty",
	);
}

// --- empty sections + default rows: an all-blank list, no crash ---------------------
{
	const [host] = createRoot(() =>
		SectionList({ sections: () => [], renderHeader: H, renderRow: R }),
	);
	check(
		"empty sections yield an all-blank list at the DEFAULT row count (4)",
		host.contents.length === 4 && host.contents.every((c: any) => c.string === ""),
	);
}

done();
