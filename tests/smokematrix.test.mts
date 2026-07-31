// smoke-matrix suite — the RECORD half of tools/device-smoke.mts: the
// append-only run history (docs/smoke-matrix.json) and the dated table rendered
// from it (docs/smoke-matrix.md).
//
// What this pins is a documentation failure, not a code failure. The device
// catalog was "green on both platforms" in docs/device-smokes.md for weeks
// after the last full run — the claim never turned red, because nothing in the
// system recorded WHEN a receipt was taken. So the rules under test are the
// ones that make staleness visible and keep it honest:
//
//   1. history is APPEND-ONLY — a merge that drops an old row destroys the only
//      evidence that a receipt ever existed (and a "3 runs" claim with 1 row is
//      how a matrix starts lying);
//   2. the table shows the NEWEST run per app/platform, ties to the row
//      recorded last, so a same-day re-run after a fix is what the reader sees;
//   3. every row carries its DATE and its AGE, and an age past STALE_DAYS is
//      flagged — an undated PASS reads as "verified" forever.
//
// None of this needs a device: the pure functions take `today` as a parameter,
// and the CLI's --dry-run walks the same record → merge → render path with no
// emulator, which is what the spawn tests at the bottom drive.
//
// Run: node --test tests/smokematrix.test.mts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	daysBetween,
	latestRuns,
	loadRecord,
	mergeRuns,
	renderMatrix,
	saveRecord,
	type SmokeRow,
	STALE_DAYS,
} from "../tools/device-smoke.mts";

const TOOL = join(import.meta.dirname, "..", "tools", "device-smoke.mts");

const row = (over: Partial<SmokeRow> = {}): SmokeRow => ({
	app: "counter",
	platform: "gabbro",
	date: "2026-07-31",
	result: "pass",
	receiptPath: "screenshots/smoke/counter-gabbro.png",
	...over,
});

const scratch = (): string => mkdtempSync(join(tmpdir(), "sp-smoke-matrix-"));

test("smoke-matrix: merging is append-only — an old row is never dropped", () => {
	// the whole point of the record: a receipt that existed stays in the file
	// even after the app is re-run, so "when was this last green" is answerable
	const prev = [row({ date: "2026-05-01" }), row({ app: "navmany", date: "2026-05-01" })];
	const merged = mergeRuns(prev, [row({ date: "2026-07-31" })]);
	assert.equal(merged.length, 3);
	assert.deepEqual(
		merged.map((r) => `${r.app}@${r.date}`),
		["counter@2026-05-01", "counter@2026-07-31", "navmany@2026-05-01"],
	);
});

test("smoke-matrix: an EXACT re-record collapses; a changed result does not", () => {
	// re-running the same smoke twice in a day is not new information — but the
	// same day going pass → fail is a state change, and swallowing it would hide
	// the failure the matrix exists to surface
	const same = mergeRuns([row()], [row()]);
	assert.equal(same.length, 1, "identical row must not grow the history");
	const changed = mergeRuns([row()], [row({ result: "fail" })]);
	assert.deepEqual(
		changed.map((r) => r.result),
		["pass", "fail"],
	);
	// a different receipt path on the same day is also a distinct row
	const moved = mergeRuns([row()], [row({ receiptPath: "screenshots/smoke/counter-emery.png" })]);
	assert.equal(moved.length, 2);
});

test("smoke-matrix: merge sorts app → platform → date, stably within a day", () => {
	// the json is read by humans in a diff; an unsorted append-only file becomes
	// unreadable within a few runs
	const merged = mergeRuns(
		[row({ app: "pulse", platform: "emery", date: "2026-06-02" })],
		[
			row({ app: "counter", platform: "emery", date: "2026-07-31" }),
			row({ app: "counter", platform: "gabbro", date: "2026-06-01" }),
			row({ app: "counter", platform: "gabbro", date: "2026-07-31", result: "fail" }),
			row({ app: "counter", platform: "gabbro", date: "2026-07-31", result: "dry-run" }),
		],
	);
	assert.deepEqual(
		merged.map((r) => `${r.app}/${r.platform}@${r.date}:${r.result}`),
		[
			"counter/emery@2026-07-31:pass",
			"counter/gabbro@2026-06-01:pass",
			"counter/gabbro@2026-07-31:fail",
			"counter/gabbro@2026-07-31:dry-run",
			"pulse/emery@2026-06-02:pass",
		],
	);
});

test("smoke-matrix: newest run per app/platform wins; a same-day tie goes to the last", () => {
	// gabbro and emery are tracked SEPARATELY — a fresh gabbro receipt must not
	// make a months-old emery receipt look current (that is the exact claim the
	// catalog got wrong)
	const runs = mergeRuns(
		[],
		[
			row({ date: "2026-05-01" }),
			row({ date: "2026-07-31" }),
			row({ platform: "emery", date: "2026-05-02" }),
		],
	);
	assert.deepEqual(
		latestRuns(runs).map((r) => `${r.app}/${r.platform}@${r.date}`),
		["counter/emery@2026-05-02", "counter/gabbro@2026-07-31"],
	);
	// same day, re-run after a fix: the LAST recorded row is the truth
	const tie = latestRuns([row({ result: "fail" }), row({ result: "pass" })]);
	assert.deepEqual(
		tie.map((r) => r.result),
		["pass"],
	);
	// ...and in the other direction, a same-day regression is not masked
	const regress = latestRuns([row({ result: "pass" }), row({ result: "fail" })]);
	assert.deepEqual(
		regress.map((r) => r.result),
		["fail"],
	);
});

test("smoke-matrix: age is whole UTC days, so it cannot drift with the runner's timezone", () => {
	assert.equal(daysBetween("2026-07-31", "2026-07-31"), 0);
	assert.equal(daysBetween("2026-07-30", "2026-07-31"), 1);
	// across a DST boundary a local-time parse returns 30.958… → rounds to 31
	assert.equal(daysBetween("2026-03-01", "2026-04-01"), 31);
	// a receipt dated in the future (clock skew on the run box) reads negative
	// rather than silently clamping to "fresh"
	assert.equal(daysBetween("2026-08-02", "2026-07-31"), -2);
});

test("smoke-matrix: the table dates every row and flags the stale ones", () => {
	const runs = mergeRuns(
		[],
		[
			row({ date: "2026-07-31" }),
			row({ app: "navmany", platform: "emery", date: "2026-05-01", result: "fail" }),
		],
	);
	const md = renderMatrix(runs, "2026-07-31");
	// fresh row: dated, aged, linked at the receipt it can be checked against
	assert.match(
		md,
		/\| `counter` \| gabbro \| 2026-07-31 \| 0 d \| ✅ pass \| \[screenshots\/smoke\/counter-gabbro\.png\]\(\.\.\/screenshots\/smoke\/counter-gabbro\.png\) \|/,
	);
	// stale row: the age is called out, not left for the reader to compute
	assert.match(md, /\| `navmany` \| emery \| 2026-05-01 \| \*\*91 d\*\* ⚠️ stale \| ❌ fail \|/);
	// the history behind the view is stated, so "2 rows" never reads as "2 runs"
	assert.match(md, /_2 run\(s\) recorded, 2026-05-01 → 2026-07-31\._/);
	assert.match(md, /GENERATED FILE/, "hand-editing a generated table is how it rots");
});

test("smoke-matrix: the stale flag turns on exactly at STALE_DAYS", () => {
	// an off-by-one here is a receipt that stays unflagged for one more day —
	// harmless alone, but the threshold is what the doc promises, so pin it
	// (the ⚠️ marker is asserted, not the word "stale": the preamble explains
	// the rule and would match a bare /stale/ on every table)
	assert.doesNotMatch(renderMatrix([row()], row().date), /⚠️/, "a same-day row is never stale");
	assert.equal(daysBetween("2026-01-01", "2026-01-31"), STALE_DAYS);
	assert.match(renderMatrix([row({ date: "2026-01-01" })], "2026-01-31"), /\*\*30 d\*\* ⚠️ stale/);
	const under = renderMatrix([row({ date: "2026-01-01" })], "2026-01-30");
	assert.match(under, /\| 29 d \|/);
	assert.doesNotMatch(under, /⚠️/);
});

test("smoke-matrix: a dry-run row renders as itself, and an unknown result survives", () => {
	// dry-run rows exist so the tooling can be exercised without a device; they
	// must never be mistaken for a PASS in the table
	const dry = renderMatrix([row({ result: "dry-run" })], "2026-07-31");
	assert.match(dry, /🟡 dry-run/);
	assert.doesNotMatch(dry, /✅/);
	// the json is a committed file a human can hand-edit — an unrecognised
	// result must render verbatim, not crash the regeneration
	const odd = renderMatrix(
		[{ ...row(), result: "skipped" as unknown as SmokeRow["result"] }],
		"2026-07-31",
	);
	assert.match(odd, /\| skipped \|/);
});

test("smoke-matrix: an empty record says so instead of rendering an empty table", () => {
	// a bare header with no rows reads as "nothing to verify"; the file must say
	// no run has ever been recorded
	const md = renderMatrix([], "2026-07-31");
	assert.match(md, /\*\*No runs recorded yet\*\*/);
	assert.doesNotMatch(md, /\| app \| platform \|/);
});

test("smoke-matrix: a missing or half-written record loads as empty, not as a crash", () => {
	const dir = scratch();
	const path = join(dir, "smoke-matrix.json");
	assert.deepEqual(loadRecord(path), { runs: [] }, "first run: no file yet");
	writeFileSync(path, '{"note":"hand-edited"}\n');
	assert.deepEqual(loadRecord(path), { runs: [] }, "a record without `runs` must not throw");
});

test("smoke-matrix: save → load round-trips, and the file is diff-friendly", () => {
	const dir = scratch();
	const path = join(dir, "smoke-matrix.json");
	const runs = mergeRuns([], [row(), row({ app: "navmany", date: "2026-05-01" })]);
	saveRecord(path, runs);
	const text = readFileSync(path, "utf8");
	assert.ok(text.endsWith("\n"), "trailing newline, like every other generated file here");
	assert.match(text, /\n\t"runs": \[/, "tab-indented — the repo's json style");
	assert.deepEqual(loadRecord(path).runs, runs);
});

test("smoke-matrix: --dry-run records + renders with no device, and stays idempotent", () => {
	// the deviceless path IS the tooling receipt: it proves the row shape, the
	// merge and the table render on a box with no emulator at all
	const dir = scratch();
	const out = execFileSync(
		process.execPath,
		[TOOL, "--dry-run", "--apps", "counter,navmany", "--record-dir", dir],
		{ encoding: "utf8", stdio: "pipe" },
	);
	assert.match(out, /DRY-RUN — recorded, nothing built, nothing installed/);
	assert.match(out, /recorded 2 row\(s\)/);
	const rec = loadRecord(join(dir, "smoke-matrix.json"));
	assert.deepEqual(
		rec.runs.map((r) => `${r.app}/${r.platform}:${r.result}`),
		["counter/gabbro:dry-run", "navmany/gabbro:dry-run"],
	);
	// the receipt path recorded is the one a REAL run would write, repo-relative
	// and inside the smoke/ subdir — never on top of a committed catalog receipt
	assert.equal(rec.runs[0].receiptPath, "screenshots/smoke/counter-gabbro.png");
	assert.ok(rec.runs[0].date.match(/^\d{4}-\d{2}-\d{2}$/), "rows are dated, always");
	const md = readFileSync(join(dir, "smoke-matrix.md"), "utf8");
	assert.match(md, /\| `counter` \| gabbro \|/);
	// a second identical dry run must not grow the history
	execFileSync(
		process.execPath,
		[TOOL, "--dry-run", "--apps", "counter,navmany", "--record-dir", dir],
		{
			encoding: "utf8",
			stdio: "pipe",
		},
	);
	assert.equal(loadRecord(join(dir, "smoke-matrix.json")).runs.length, 2);
});

test("smoke-matrix: --matrix re-renders the table FROM the json, with no run at all", () => {
	// the table has to be regenerable long after the run box is gone, or the
	// dates in it are unverifiable
	const dir = scratch();
	saveRecord(join(dir, "smoke-matrix.json"), [row({ date: "2026-01-01" })]);
	const out = execFileSync(process.execPath, [TOOL, "--matrix", "--record-dir", dir], {
		encoding: "utf8",
		stdio: "pipe",
	});
	assert.match(out, /wrote .*smoke-matrix\.md from 1 recorded run\(s\)/);
	const md = readFileSync(join(dir, "smoke-matrix.md"), "utf8");
	assert.match(md, /\| `counter` \| gabbro \| 2026-01-01 \|/);
	assert.match(md, /⚠️ stale/, "a 2026-01-01 receipt is stale by any run of this suite");
});

test("smoke-matrix: --matrix on a fresh checkout writes the empty-record table", () => {
	const dir = scratch();
	const out = execFileSync(process.execPath, [TOOL, "--matrix", "--record-dir", dir], {
		encoding: "utf8",
		stdio: "pipe",
	});
	assert.match(out, /from 0 recorded run\(s\)/);
	assert.match(readFileSync(join(dir, "smoke-matrix.md"), "utf8"), /\*\*No runs recorded yet\*\*/);
});

test("smoke-matrix: the CLI refuses the arguments that would destroy evidence", () => {
	const dir = scratch();
	// writing receipts straight into screenshots/ would overwrite the committed
	// catalog PNGs the docs point at — unrecoverable, so it must exit 1
	const catalogDir = join(import.meta.dirname, "..", "screenshots");
	assert.throws(
		() =>
			execFileSync(
				process.execPath,
				[TOOL, "--dry-run", "--receipts", catalogDir, "--record-dir", dir],
				{ encoding: "utf8", stdio: "pipe" },
			),
		(e: { status?: number; stderr?: string }) =>
			e.status === 1 && /must not be the committed catalog dir/.test(e.stderr ?? ""),
	);
	// a typo'd app name must not silently smoke a shorter catalog
	assert.throws(
		() =>
			execFileSync(process.execPath, [TOOL, "--dry-run", "--apps", "countr", "--record-dir", dir], {
				encoding: "utf8",
				stdio: "pipe",
			}),
		(e: { status?: number; stderr?: string }) =>
			e.status === 1 && /unknown app\(s\): countr/.test(e.stderr ?? ""),
	);
	// a bogus platform would land in the record as a real platform column
	assert.throws(
		() =>
			execFileSync(
				process.execPath,
				[TOOL, "--dry-run", "--platform", "gab bro", "--record-dir", dir],
				{ encoding: "utf8", stdio: "pipe" },
			),
		(e: { status?: number; stderr?: string }) =>
			e.status === 1 && /bad platform name/.test(e.stderr ?? ""),
	);
});
