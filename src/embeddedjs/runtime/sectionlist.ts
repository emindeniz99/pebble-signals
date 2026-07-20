// A grouped, sectioned selectable list (React Native's <SectionList>) — the
// opt-in `runtime/sectionlist` module. OPT-IN & ZERO-COST: an app that never
// imports `runtime/sectionlist` never ships it (the manifest prunes to the
// import closure — README tree-shaking), so this module costs non-users nothing.
//
// ⚠️ DEVICE-GATED — HANGS on gabbro (MEASURED 2026-07). SectionList needs
// per-row styling (bold headers, highlight fill), so it drives VirtualList in
// RICH mode (`renderRow`) with `rows>1` — and THAT combination wedges the
// firmware (the screenshot/watch-info transport times out). Bisected on a clean
// emulator: `richlist` (rich, rows=1) renders; `forbind5vl` (simple `format`,
// rows=5) renders; a rich list with rows>1 hangs even NON-scrolling and even
// string-only. The Node suite passes (the stub Piu never hangs) — this is the
// exact "build passes, device fails" class. The fix is a VirtualList-level
// change (rich multi-row layout) or a SectionList redesign, tracked separately.
// Do NOT ship SectionList to a device until then.
//
// WHAT (Rule 2 — no new substrate): RN's <SectionList> — section HEADERS
// interleaved with item ROWS — composed over flow.ts's windowed VirtualList (our
// FlatList). SectionList owns NO scroll/recycle machinery of its own: it FLATTENS
// the sections+headers into ONE index space and hands that flat model to
// VirtualList, which recycles a fixed set of `rows` slot Labels as the window
// moves (RAM O(rows), not O(items) — the whole VirtualList trick). DISPLAY-ONLY
// (Rule 8): the APP owns the selected ITEM index (a signal) and drives it
// (buttons / a rotary); SectionList highlights the selected row and keeps it in
// view. No input handling — a loader is the sole self-owning widget, not this.
//
// FLATTEN (the one piece of real logic): sections `[{header, rows:[…]}, …]`
// become `flat = [{type:'header',data}, {type:'row',data}, …]` in section order —
// each section contributes ONE non-selectable header record followed by its row
// records. A parallel `rowFlat[]` records the flat index of every ROW (headers
// skipped), so a `selected` ITEM index (0-based over rows only, never a header)
// maps to a flat index by `rowFlat[selected]` — that is how "selection skips
// headers" (a header index can never be selected). `sections` is a THUNK but read
// ONCE at construction (like grid.ts's `items`): Piu lays the list out at
// construction and VirtualList windows a FIXED model — for a CHANGING section set,
// rebuild the screen (the port's static-layout rule). The thunk is purely so a
// caller can compute sections inline.
//
// RECYCLED HETEROGENEOUS SLOTS (the dispatch): VirtualList calls our slot builder
// ONCE per visible slot; we build ONE `rowHeight`-tall Label per slot and drive
// its `string`/`style`/`skin` from ONE effect that re-reads the slot's CURRENT
// flat index (`idxThunk()` — reads the window signal) and DISPATCHES on the record
// type: a 'header' record wears the BOLD header Style and shows
// `renderHeader(headerData)`; a 'row' record wears the normal Style (or the active
// Style + fill Skin when it is the selected row) and shows `renderRow(rowData)`; a
// past-the-end slot blanks. Only `string`/`style`/`skin` are written reactively —
// all on the jsx-runtime REACTIVE_PROPS whitelist (coordinate props are
// construction-time on this port and a reactive write THROWS); the Label's width +
// rowHeight are construction-time statics (gotcha 16 — a size-less Label and the
// active fill Skin need an explicit box). This is menu.ts's `cell.style`/`.skin`
// highlight idiom + VirtualList's reactive-string recycling. (NB: the earlier
// claim that this "inherits their on-device proof — no moveBy at all" was WRONG
// on both counts — VirtualList DOES moveBy internally, and rich `rows>1` HANGS on
// gabbro; see the device-gated banner at the top of this file.)
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
import { VirtualList, type DataSource } from "runtime/flow";
import type { Color, Content, Label as PiuLabel } from "../../../types/moddable/piu/MC-types";

// One flattened record: a section HEADER (non-selectable) or an item ROW. The
// sections tree collapses to a `FlatRec[]` in section order so VirtualList can
// window it as a single index space; the `type` tag drives the per-slot dispatch.
type FlatRec<H, R> = { type: "header"; data: H } | { type: "row"; data: R };

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
 * SectionList — a grouped list of section HEADERS + item ROWS over the windowed
 * VirtualList: React Native's <SectionList> on a watch.
 *
 *   const [sel, setSel] = useState(0);
 *   <SectionList
 *     sections={() => [{ header: "Fruit", rows: ["Apple", "Pear"] }, …]}
 *     renderHeader={(h) => h} renderRow={(r) => r}
 *     selected={sel} rows={5} height={170} />
 *
 * DISPLAY-ONLY (Rule 8) — the app owns the selected ITEM index and drives it
 * (buttons / a rotary); SectionList highlights that row and keeps it in view. The
 * sections+headers are FLATTENED into one index space and handed to VirtualList,
 * which recycles a fixed `rows` slot Labels as the window moves (RAM O(rows)).
 * Each slot's `string`/`style`/`skin` (all REACTIVE_PROPS-whitelisted) are driven
 * by ONE effect that dispatches on the current record's type — a bold header, a
 * normal row, or an active row (fill Skin) when selected. `selected` is an ITEM
 * index over ROWS only, so it can never land on a header. See the module header
 * for the flatten + keep-in-view contract.
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

	// FLATTEN the sections into one index space (read `sections` ONCE, like
	// grid.ts). `rowFlat[i]` is the flat index of the i-th ROW — headers are pushed
	// but never recorded here, so a selected ITEM index maps straight past them.
	const flat: FlatRec<H, R>[] = [];
	const rowFlat: number[] = [];
	for (const sec of props.sections()) {
		flat.push({ type: "header", data: sec.header });
		for (const item of sec.rows) {
			rowFlat.push(flat.length);
			flat.push({ type: "row", data: item });
		}
	}
	const rowCount = rowFlat.length;

	// The DataSource VirtualList windows: get(i) returns undefined past the end (a
	// blank slot). count() is the FLATTENED length — headers + rows.
	const flatData: DataSource<FlatRec<H, R> | undefined> = {
		count: () => flat.length,
		get: (i) => flat[i],
	};
	const flatLen = flatData.count();
	const maxAt = Math.max(0, flatLen - rows);

	// selected ITEM index -> its flat index (via rowFlat, so headers are skipped);
	// -1 when there is no selection or no selectable rows (nothing highlights).
	const selectedFlat = (): number => {
		if (selected === undefined) return -1;
		if (rowCount === 0) return -1;
		const raw = typeof selected === "function" ? selected() : selected;
		return rowFlat[Math.max(0, Math.min(raw, rowCount - 1))];
	};

	// Window start (flat index) — a signal VirtualList reads; keep-in-view writes
	// it. `winStart` is the last-applied start (mirrors menu.ts's `scroll`) so each
	// change scrolls INCREMENTALLY and a self-loop is impossible (never read here).
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

	return VirtualList<FlatRec<H, R> | undefined>({
		data: flatData,
		rows,
		width,
		height,
		at: () => atSig.value,
		// params annotated (not left to union contextual typing) so this compiles
		// clean under strict/noImplicitAny — the `data` here IS `flatData`.
		renderRow: (idxThunk: () => number, data: DataSource<FlatRec<H, R> | undefined>) => {
			// ONE recycled Label per slot; width + rowHeight are construction-time
			// statics (gotcha 16 — the active fill Skin needs a real box).
			const cell = new Label(null, { width, height: rowHeight }) as PiuLabel;
			// ONE effect drives string/style/skin (all REACTIVE_PROPS-whitelisted):
			// re-read the slot's CURRENT flat index (scroll) + `selected` (highlight)
			// and DISPATCH on the record type.
			effect(() => {
				const fi = idxThunk();
				const rec = data.get(fi);
				if (rec === undefined) {
					cell.string = ""; // past the end of the flat list -> blank slot
					cell.style = rowStyle;
					cell.skin = null;
				} else if (rec.type === "header") {
					cell.string = renderHeader(rec.data);
					cell.style = headerStyle; // bold, non-selectable
					cell.skin = null;
				} else {
					cell.string = renderRow(rec.data);
					const active = fi === selectedFlat();
					cell.style = active ? activeStyle : rowStyle;
					cell.skin = active ? activeSkin : null;
				}
			});
			return cell;
		},
	});
}
