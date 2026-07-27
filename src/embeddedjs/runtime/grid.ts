// Grid — an N-column tile layout: the opt-in `runtime/grid` module (React Native
// `FlatList numColumns` analog; app launchers, icon pickers, keypads). OPT-IN &
// ZERO-COST: an app that never imports it never ships it (the manifest prunes to
// the import closure — README tree-shaking), so it costs non-users nothing.
//
// COMPOSITION (Rule 2 — no new substrate): there is NO native Piu grid class, so
// a Grid is plain nodes — a `Column` of `Row`s, each Row holding up to `columns`
// cells built by the caller's `cell(item, i)` render prop (the Card/menu
// Column/Row idiom). ceil(n / columns) rows; the last row is short when n isn't a
// multiple of columns (cells are simply added — no padding node, so the row packs
// left). appendChild mounts each cell (flattening arrays, skipping nullish).
//
// STATIC STRUCTURE (the port's construction-time layout rule): Piu lays a Grid
// out ONCE at construction from the items read at call time — this is not a
// reactive list. For a grid whose ITEMS change, drive it with <For>/VirtualList
// over the rows (which recycle nodes) rather than rebuilding coordinates, which
// the port rejects post-mount. `items` may still be a thunk purely so a caller
// can compute it inline; it is read ONCE (untracked-in-effect semantics N/A —
// there is no effect here).
//
// CELLS OWN THEIR SIZE: `cell` returns a fully-sized node (a Content/Label/Image
// with its own width/height) — Grid does not size or pad cells (gotcha 16 is the
// caller's to satisfy per cell), keeping this a pure layout wrapper (Rule 2). No
// `gap` prop: cells that need spacing include their own margins.
//
// NO MODULE SCOPE (Rule 5 / gotcha 13): every Row/Column is built INSIDE Grid at
// call time; the one export is a `function` declaration like Card.
import { appendChild, type JSXNode } from "runtime/jsx-runtime";
import type { Content, Container as PiuContainer } from "../../../types/moddable/piu/MC-types";

/** Props for {@link Grid}. */
export type GridProps<T> = {
	/** Number of cells per row (>= 1). */
	columns: number;
	/** The items to lay out — an array, or a thunk returning one (read ONCE at construction). */
	items: T[] | (() => T[]);
	/** Renders one cell from its item + flat index. Returns a fully-sized node (Grid does not size cells). */
	cell: (item: T, index: number) => JSXNode;
	/** Grid width in px. Optional (omit to size to content). */
	width?: number;
	/** Grid height in px. Optional (omit to size to content). */
	height?: number;
};

/**
 * Grid — lay items out in `columns`-wide rows: the RN `FlatList numColumns`
 * analog (app launchers, icon pickers, keypads).
 *
 *   <Grid columns={3} items={icons} cell={(it, i) => <Label string={it.label} width={40} height={40} />} />
 *
 * Builds a Column of ceil(n / columns) Rows, each holding up to `columns` cells
 * from `cell(item, index)`; the last row is short when n isn't a multiple. STATIC
 * structure — Piu lays it out once at construction (for a changing item set, drive
 * <For>/VirtualList over the rows instead). Cells own their own size (Grid is a
 * pure layout wrapper — gotcha 16 is per-cell). Built per-call at runtime (Rule 5
 * — no module scope). See the module header.
 */
export function Grid<T>(props: GridProps<T>): Content {
	const { cell } = props;
	// `columns` reaching 0 or a negative number (from config, or caller state)
	// never advanced the walk below — `r += 0` loops forever and `r += -1` runs
	// away allocating Rows until the arena dies. A noCheck build cannot rely on
	// the type, so clamp: one column renders something recoverable, a hung watch
	// does not (codex P2).
	const columns = props.columns >= 1 ? props.columns : 1;
	const items = typeof props.items === "function" ? props.items() : props.items;

	const colDict: Record<string, number> = {};
	if (props.width !== undefined) colDict.width = props.width;
	if (props.height !== undefined) colDict.height = props.height;
	const column = new Column(
		null,
		colDict as ConstructorParameters<typeof Column>[1],
	) as PiuContainer;

	// Walk the items `columns` at a time; each slice becomes one Row of cells. The
	// flat index (r + c) is passed to cell() so callers can key/label by position.
	for (let r = 0; r < items.length; r += columns) {
		const row = new Row(null, {} as ConstructorParameters<typeof Row>[1]) as PiuContainer;
		for (let c = 0; c < columns && r + c < items.length; c++) {
			// appendChild flattens arrays and skips nullish, so a cell may return a
			// fragment or a dead `{cond && <X/>}` safely.
			appendChild(row, cell(items[r + c], r + c));
		}
		column.add(row);
	}

	return column;
}
