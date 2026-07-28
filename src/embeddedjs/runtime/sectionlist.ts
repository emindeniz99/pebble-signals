// A grouped, sectioned selectable list (React Native's <SectionList>) — the
// opt-in `runtime/sectionlist` module. OPT-IN & ZERO-COST: an app that never
// imports `runtime/sectionlist` never ships it (the manifest prunes to the
// import closure — README tree-shaking), so this module costs non-users nothing.
//
// HISTORY: this module was device-gated from birth — it died at boot on
// gabbro through every earlier reading (first "rich rows>1 hangs", then a
// height-shape theory, finally D4: plain arena-BUDGET pressure — the
// one-variable ablations in review-findings D3/D4 killed every structural
// suspect). The 2026-07-28 slim-down below (standalone window, derive-don't-
// flatten, no runtime/flow import) plus the D4 runtime diet is what finally
// brought its build under the budget.
//
// WHAT (Rule 2 — no new substrate): RN's <SectionList> — section HEADERS
// interleaved with item ROWS — a STANDALONE recycled window (D4 slot-diet;
// it no longer composes VirtualList, whose RICH mode cost two extra arrows
// per slot and shipped runtime/flow into apps that use nothing else from
// it). DISPLAY-ONLY (Rule 8): the APP owns the selected ITEM index (a
// signal) and drives it (buttons / a rotary); SectionList highlights the
// selected row and keeps it in view. No input handling.
//
// DERIVE, DON'T FLATTEN (D4 slot-diet): the sections are read ONCE (the
// static-layout rule — a CHANGING section set means rebuilding the screen);
// the only stored index is `start[s]`, the flat index of each section's
// header. Record kind/datum and the selected row's flat index are DERIVED by
// a short walk at read time — CPU for RAM. The old `{type,data}` record
// array + rowFlat[] cost ~45 boot slots on the demo alone.
//
// RECYCLED HETEROGENEOUS SLOTS: one Column host with an explicit box, one
// `rowHeight`-tall Label per visible slot, ONE effect per slot that re-reads
// the window signal + `selected` and dispatches: header records wear the
// BOLD Style; row records the normal Style (or active Style + fill Skin when
// selected); past-the-end slots blank. Only `string`/`style`/`skin` are
// written reactively — all on the jsx-runtime REACTIVE_PROPS whitelist;
// width/rowHeight are construction-time statics (gotcha 16). This is
// menu.ts's device-proven cell shape.
//
// KEEP-IN-VIEW (menu.ts's idiom, in ROW-INDEX units): the visible window start is
// a signal VirtualList reads; ONE effect watches the selected flat index and, when
// it would fall outside the window `[start, start+rows)`, shifts `start` up (reveal
// the row's top) or down (reveal its bottom), CLAMPED to `[0, flatLen-rows]` and
// GUARDED so a still-visible selection moves the window not at all (mirrors
// menu.ts's applyScroll — the VirtualList analog of its moveBy scroll, windowing
// row indices instead of shifting pixels). A bare-number `selected` positions the
// window once (static); a THUNK re-runs the effect on every change (idiom 5b).
// Highlight follows for free — each slot's own effect reads `selected`.
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): every Style/Skin/Label/signal/effect is
// built INSIDE SectionList at call time (a preloaded module's top-level
// `new Style/Skin` freezes into a broken ROM instance, measured on Badge), so
// nothing freezes into a broken preload instance; the exports are `type` aliases +
// a `function` declaration exactly like menu.ts. The module constructs NOTHING at
// top level — only plain style/color constants.
import { effect, signal } from "runtime/signals";
import { screen } from "runtime/jsx-runtime";
import type {
	Color,
	Container as PiuContainer,
	Content,
	Label as PiuLabel,
} from "../../../types/moddable/piu/MC-types";

// Valid Pebble system font keys (Rule 7 / tools/fontcheck): headers BOLD, rows
// normal. Muted gray inactive text, white active text, dark-teal active fill —
// menu.ts's palette so a mixed menu/section screen reads consistently.
const HEADER_FONT = "bold 18px Gothic";
const ROW_FONT = "18px Gothic";
const HEADER_COLOR: Color = "white";
const ROW_COLOR: Color = "#808080";
const ACTIVE_COLOR: Color = "white";
const ACTIVE_FILL: Color = "#1a4d4d";
// Default visible slot count and (when `height` is omitted) per-row height in px.
const DEFAULT_ROWS = 4;
const DEFAULT_ROW_HEIGHT = 34;

/** One section: a `header` datum plus its item `rows`. */
export type Section<H = unknown, R = unknown> = {
	/** The section header datum — passed to `renderHeader`; rendered bold + non-selectable. */
	header: H;
	/** The section's item data — each passed to `renderRow` and independently selectable. */
	rows: R[];
};

/** Props for {@link SectionList}. */
export type SectionListProps<H = unknown, R = unknown> = {
	/**
	 * The sections — a THUNK returning `[{ header, rows }, …]`, read ONCE at
	 * construction (like grid.ts's `items`): Piu lays the list out at construction
	 * and VirtualList windows a FIXED flat model, so a CHANGING section set means
	 * rebuilding the screen, not mutating this. The thunk is purely so a caller can
	 * compute the sections inline.
	 */
	sections: () => Section<H, R>[];
	/** Header datum -> caption string (SectionList styles it BOLD; headers never highlight). */
	renderHeader: (header: H) => string;
	/** Item datum -> caption string (SectionList styles it normal, or highlighted when selected). */
	renderRow: (row: R) => string;
	/**
	 * The selected ITEM index — 0-based over ROWS only (headers are never counted
	 * or selectable), so "selection skips headers" holds by construction. A THUNK
	 * (`() => i`) makes it reactive — one effect re-highlights AND keeps the row in
	 * view on change (idiom 5b); a bare number applies once (static). Clamped to
	 * `[0, rowCount-1]`. Omit for a static, non-highlighted list.
	 */
	selected?: number | (() => number);
	/** Visible slot count (recycled Labels — each is live Piu nodes on the 32KB heap; keep small). Defaults to 4. */
	rows?: number;
	/** List width in px. Defaults to the screen width (a width-less list measures 0 — gotcha 16). */
	width?: number;
	/** List height in px — split evenly into `rows` row heights. Defaults to `rows * 34`. */
	height?: number;
};

/**
 * SectionList — a grouped list of section HEADERS + item ROWS over a recycled
 * window: React Native's <SectionList> on a watch.
 *
 *   const [sel, setSel] = useState(0);
 *   <SectionList
 *     sections={() => [{ header: "Fruit", rows: ["Apple", "Pear"] }, …]}
 *     renderHeader={(h) => h} renderRow={(r) => r}
 *     selected={sel} rows={5} height={170} />
 *
 * DISPLAY-ONLY (Rule 8) — the app owns the selected ITEM index and drives it
 * (buttons / a rotary); SectionList highlights that row and keeps it in view. The
 * sections+headers share one DERIVED flat index space over a standalone window
 * that recycles a fixed `rows` slot Labels as the window moves (RAM O(rows)).
 * Each slot's `string`/`style`/`skin` (all REACTIVE_PROPS-whitelisted) are driven
 * by ONE effect that dispatches on the current record's type — a bold header, a
 * normal row, or an active row (fill Skin) when selected. `selected` is an ITEM
 * index over ROWS only, so it can never land on a header. See the module header
 * for the derive + keep-in-view contract.
 */
export function SectionList<H = unknown, R = unknown>(props: SectionListProps<H, R>): Content {
	const renderHeader = props.renderHeader;
	const renderRow = props.renderRow;
	const selected = props.selected;
	const rows = props.rows || DEFAULT_ROWS;
	const width = props.width ?? screen.width;
	const height = props.height ?? rows * DEFAULT_ROW_HEIGHT;
	const rowHeight = Math.floor(height / rows);

	// Two shared Styles (bold header vs normal row) + one active-text Style + one
	// active-fill Skin cover every slot — indices, not per-row allocations (Rule 4,
	// the 32KB heap). Built per-call at runtime, NEVER module scope (a preloaded
	// top-level `new Style/Skin` freezes broken, measured on Badge).
	const headerStyle = new Style({ font: HEADER_FONT, color: HEADER_COLOR });
	const rowStyle = new Style({ font: ROW_FONT, color: ROW_COLOR });
	const activeStyle = new Style({ font: ROW_FONT, color: ACTIVE_COLOR });
	const activeSkin = new Skin({ fill: ACTIVE_FILL });

	// DERIVE, don't flatten (D4 slot-diet). The old implementation materialized
	// every record as a `{type,data}` object plus a parallel rowFlat[] — ~45
	// boot slots for the demo's 10 records, on the exact budget SectionList
	// keeps dying on. `sections` is still read ONCE (static-layout rule); the
	// only stored index is `start[s]` = the flat index of section s's header
	// (ints, one per section). Everything else — record type, record datum, the
	// selected row's flat index — is DERIVED by a short walk over `secs` at
	// read time. CPU for RAM, the house rule: the walk is O(sections) with
	// single-digit section counts.
	const secs = props.sections();
	const start: number[] = [];
	let flatLen = 0;
	let rowCount = 0;
	for (let i = 0; i < secs.length; i++) {
		start[i] = flatLen;
		flatLen += 1 + secs[i].rows.length;
		rowCount += secs[i].rows.length;
	}
	const maxAt = Math.max(0, flatLen - rows);

	// selected ITEM index -> its flat index (headers skipped by construction);
	// -1 when there is no selection or no selectable rows (nothing highlights).
	const selectedFlat = (): number => {
		if (selected === undefined || rowCount === 0) return -1;
		const raw = typeof selected === "function" ? selected() : selected;
		let r = Math.max(0, Math.min(raw, rowCount - 1));
		let i = 0;
		while (r >= secs[i].rows.length) {
			r -= secs[i].rows.length;
			i++;
		}
		return start[i] + 1 + r;
	};

	// Window start (flat index) — a signal the slot effects read; keep-in-view
	// writes it. `winStart` is the last-applied start (mirrors menu.ts's
	// `scroll`) so each change scrolls INCREMENTALLY and a self-loop is
	// impossible (never read here).
	const atSig = signal(0);
	let winStart = 0;
	const keepInView = (selFlat: number): void => {
		if (selFlat < 0) return; // no selection -> leave the window where it is
		let next = winStart;
		if (selFlat < winStart)
			next = selFlat; // above the window -> reveal its top
		else if (selFlat >= winStart + rows) next = selFlat - rows + 1; // below -> reveal bottom
		next = Math.max(0, Math.min(next, maxAt)); // clamp with Math (no extra branches)
		if (next !== winStart) {
			winStart = next;
			atSig.value = next;
		}
	};

	// Position the window for the INITIAL selection before the slots are built (so
	// they open on the right window); a THUNK re-runs the effect on every change
	// (idiom 5b — auto-tracks `selected`), a bare number positions once (static).
	// Highlight follows for free — each slot's effect reads `selected` itself.
	if (selected !== undefined) {
		if (typeof selected === "function") effect(() => keepInView(selectedFlat()));
		else keepInView(selectedFlat());
	}

	// STANDALONE window (D4 slot-diet): SectionList used to hand the flat model
	// to VirtualList's RICH mode, which costs a builder arrow + an index-thunk
	// arrow per slot on top of the slot's own effect (~8 slots each) — and made
	// this module import runtime/flow, shipping a whole extra module in apps
	// that use nothing else from it. The recycling contract is tiny and menu.ts
	// already proves the shape on-device (explicit host box + fixed-height
	// cells + reactive string/style/skin): ONE Column host, `rows` recycled
	// Labels, ONE effect per slot reading the window signal directly.
	const host = new Column(null, { width, height }) as PiuContainer;
	for (let slot = 0; slot < rows; slot++) {
		// width + rowHeight are construction-time statics (gotcha 16 — a
		// size-less Label and the active fill Skin need an explicit box).
		const cell = new Label(null, { width, height: rowHeight }) as PiuLabel;
		// ONE effect drives string/style/skin (all REACTIVE_PROPS-whitelisted):
		// re-read the slot's CURRENT flat index (scroll) + `selected`
		// (highlight), DERIVE the record, and dispatch on its kind.
		effect(() => {
			const fi = atSig.value + slot;
			if (fi < 0 || fi >= flatLen) {
				cell.string = ""; // past the end of the flat space -> blank slot
				cell.style = rowStyle;
				cell.skin = null;
				return;
			}
			// find the section owning flat index fi (last i with start[i] <= fi)
			let i = 0;
			while (i + 1 < secs.length && start[i + 1] <= fi) i++;
			if (fi === start[i]) {
				cell.string = renderHeader(secs[i].header);
				cell.style = headerStyle; // bold, non-selectable
				cell.skin = null;
			} else {
				cell.string = renderRow(secs[i].rows[fi - start[i] - 1]);
				const active = fi === selectedFlat();
				cell.style = active ? activeStyle : rowStyle;
				cell.skin = active ? activeSkin : null;
			}
		});
		host.add(cell);
	}
	return host;
}
