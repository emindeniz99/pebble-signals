// grid suite — runtime/grid (opt-in N-column tile layout; a Column of Rows).
// Proves: Grid builds ceil(n/columns) Rows, each holding up to `columns` cells;
// the last row is SHORT when n isn't a multiple (no padding node); `cell` is
// invoked with (item, FLAT index) so callers can key by position; `items` accepts
// a bare array OR a thunk (read once); width/height pass through to the Column
// only when given; and an empty item list builds an empty Column (no rows). Cells
// are built by the caller and mounted via the real appendChild, so these assert
// the integrated layout, not a re-implementation. StubContent (load-runtime) is
// the host Column/Row; a cell returns a StubLeaf carrying its item+index so the
// structure is fully visible.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot } = signals;
const { Grid } = await loadModule("runtime/grid");
const { check, done } = makeChecker("grid");

// A cell records the (item, index) it was built from on a fresh leaf node, so a
// Row's contents expose exactly what Grid laid out where.
const cell = (item: string, index: number) => new sandbox.Content(null, { item, index });
// flatten a Column-of-Rows into "item@index" strings per row for readable asserts
const layout = (col: any): string[] =>
	col.contents.map((row: any) => row.contents.map((c: any) => `${c.item}@${c.index}`).join(","));

// --- exact multiple: 6 items / 3 cols -> 2 full rows; flat index threads through --
{
	const items = ["a", "b", "c", "d", "e", "f"];
	const [col, dispose] = createRoot(() => Grid({ columns: 3, items, cell }));
	check("ceil(n/columns) rows for an exact multiple (6/3 = 2)", col.contents.length === 2);
	check(
		"each row holds `columns` cells",
		col.contents.every((r: any) => r.contents.length === 3),
	);
	check(
		"cell() receives (item, FLAT index) row-major",
		layout(col)[0] === "a@0,b@1,c@2" && layout(col)[1] === "d@3,e@4,f@5",
	);
	dispose();
}

// --- remainder: 5 items / 3 cols -> a full row + a SHORT row (no padding) --------
{
	const items = ["a", "b", "c", "d", "e"];
	const [col, dispose] = createRoot(() => Grid({ columns: 3, items, cell }));
	check("ceil(5/3) = 2 rows", col.contents.length === 2);
	check("the last row is SHORT (2 cells, not padded to 3)", col.contents[1].contents.length === 2);
	check("the short row carries the trailing items", layout(col)[1] === "d@3,e@4");
	dispose();
}

// --- thunk items + width/height pass-through to the Column ------------------------
{
	const [col, dispose] = createRoot(() =>
		Grid({ columns: 2, items: () => ["x", "y", "z", "w"], cell, width: 120, height: 120 }),
	);
	check("a THUNK items source is read (4 items / 2 cols = 2 rows)", col.contents.length === 2);
	check(
		"width/height pass through to the Column (gotcha 16)",
		col.width === 120 && col.height === 120,
	);
	dispose();
}

// --- single column: n rows of 1 --------------------------------------------------
{
	const [col, dispose] = createRoot(() => Grid({ columns: 1, items: ["a", "b", "c"], cell }));
	check("columns:1 makes n single-cell rows", col.contents.length === 3);
	check(
		"each single-cell row has exactly one cell",
		col.contents.every((r: any) => r.contents.length === 1),
	);
	dispose();
}

// --- empty items: an empty Column, no rows, no width unless given -----------------
{
	const [col, dispose] = createRoot(() => Grid({ columns: 3, items: [], cell }));
	check("an empty item list builds a Column with no rows", col.contents.length === 0);
	check(
		"no width/height set when neither is passed",
		col.width === undefined && col.height === undefined,
	);
	dispose();
}

// --- round 13: a non-positive `columns` used to hang or OOM the watch --------
// `r += 0` never reaches items.length and `r += -1` runs away allocating Rows;
// a noCheck build cannot lean on the type, so the count is clamped (codex P2).
{
	const [zero, dz] = createRoot(() =>
		Grid({ items: [1, 2, 3], columns: 0, cell: (n: number) => ({ n }) as never }),
	);
	check("columns:0 renders one row per item instead of hanging", zero.contents.length === 3);
	check(
		"…each clamped row holds exactly one cell",
		zero.contents.every((r: any) => r.contents.length === 1),
	);
	dz();
	const [neg, dn] = createRoot(() =>
		Grid({ items: [1, 2], columns: -4, cell: (n: number) => ({ n }) as never }),
	);
	check("a negative columns is clamped the same way", neg.contents.length === 2);
	dn();
}

done();
