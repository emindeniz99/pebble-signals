// Device-smoke runner — the cataloged, repeatable on-device (QEMU) smokes we
// previously ran by hand after every runtime change (roadmap "test infra").
// For each cataloged app: build → install → drive buttons → assert the app is
// ALIVE (instruments heartbeats, no fxAbort) → screendump → assert the frame
// is non-blank → save a PNG receipt. Prints a PASS/FAIL matrix and exits 1 on
// any failure (Rule 12 — a skipped/failed smoke must not look green).
//
// Channel discipline (docs/debugging.md, learned the hard way): heartbeats
// are captured with the PROVEN recipe — `pebble logs` attached BEFORE a
// foreground `pebble install`, all in one shell (a fresh direct-qemu client's
// AppLogShippingControl is not reliably honored: drive.py connected to a
// live-and-painting counter and received ZERO log lines, measured while
// building this tool). Buttons and screendumps then go through
// tools/drive.py, which needs pypkjs KILLED first (single-client qemu port;
// pypkjs silently drops emu-button presses after a reboot). A capture with
// ZERO heartbeats is a dead transport, not a quiet app: the runner then runs
// tools/reset-emulator.sh and retries that app once (Rule 3).
//
// The screendump assert is deliberately shallow: >=MIN_PIXELS pixels that
// differ from the dominant (background) color proves the app PAINTED — it
// cannot prove WHAT it painted (a crash screen also paints; that's what the
// heartbeat + receipt-for-human-eyes combo is for). See docs/device-smokes.md
// for the per-app manual checklist this automates.
//
// STALENESS is the other half of the job (added with the run record): a PASS
// that leaves no DATED row is indistinguishable from a run that never happened
// — which is exactly how the catalog's "both platforms green" claim in
// docs/device-smokes.md drifted into "boot+paint only, and months ago" without
// anything ever turning red. So every run now appends one
// {app, platform, date, result, receiptPath} row per app to
// docs/smoke-matrix.json (append-only — old rows are never dropped) and
// re-renders docs/smoke-matrix.md from it: newest run per app/platform, with
// the AGE of each receipt in its own column. `--matrix` rebuilds that table
// from the json alone, and `--dry-run` walks the whole record/render path with
// no device at all (which is what tests/smokematrix.test.mts drives).
//
// Requires the Pebble SDK + a bootable emulator. Run:
//   pnpm run smoke:device                    # whole catalog on gabbro
//   node tools/device-smoke.mts --apps counter,movebox --platform gabbro
//   node tools/device-smoke.mts --matrix     # re-render the md from the json
//   node tools/device-smoke.mts --dry-run --apps counter   # no device touched
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

type Smoke = {
	app: string;
	/** drive.py actions AFTER the boot listen (buttons + settle sleeps). */
	drive: string[];
	/** What a human should SEE in the receipt (the manual checklist line). */
	expect: string;
};

// The catalog — one line per app: how to poke it, what the receipt must show.
// Boot-only entries are the depth-audit canaries (navmany/navreactive sit a
// slot from the 384 value-stack wall; ANY runtime change must keep them alive).
const SMOKES: Smoke[] = [
	{ app: "navmany", drive: [], expect: "Screen #1 + live tick (stack canary)" },
	{ app: "navreactive", drive: [], expect: "depth 1 + live ping (stack canary)" },
	{ app: "counter", drive: ["b:up", "s:1", "b:up", "s:1"], expect: "count = 2" },
	{
		app: "autothunk",
		drive: ["b:up", "s:1", "b:up", "s:1"],
		expect: "Count: 2 (lowered bare binding)",
	},
	{ app: "movebox", drive: ["b:up", "s:1", "b:up", "s:1"], expect: "x=40, box shifted right 40px" },
	{
		app: "loadms",
		drive: ["b:select", "s:1"],
		expect: "load <n>ms acc=247700 (importNow latency)",
	},
	{ app: "deviceinfo", drive: [], expect: "screen size/round/color + ticking clock" },
	{
		app: "rootapp",
		drive: ["b:up", "s:1", "b:up", "s:1"],
		expect: "root 2 (root-component entry via generated shim)",
	},
	// boot-only here: the settings round-trip needs pypkjs ALIVE (tools/
	// config-drive.py), which this runner kills before driving buttons —
	// drive that flow manually when touching the config path
	{ app: "config", drive: [], expect: "no config yet (pebble/message channel open)" },
	{ app: "fontface", drive: [], expect: "serif clock + 'Serif, from a TTF' (custom font)" },
	{ app: "kvprobe", drive: [], expect: "kv works boot=N (device.keyValue persists)" },
	// boot + SELECT sends a bridged log line; the runner's pixel assert only
	// sees the label — the pkjs> line needs the log capture (kept manual)
	{ app: "devlog", drive: ["b:select", "s:1"], expect: "sent 1 (dev-log bridge)" },
	// boot-only ON PURPOSE: SELECT opens the SYSTEM dictation UI and BACK
	// exits to the launcher (probe finding) — driving it would strand the run
	{ app: "dictate", drive: [], expect: "SELECT starts dictation (probe)" },
	{
		app: "pulse",
		drive: ["b:up", "s:1"],
		expect: "serif clock + date/secs + accent dot turns green (flagship)",
	},
];

const MIN_HEARTBEATS = 3; // capture spans SETTLE_S post-install; instruments ticks ~1/s
const MIN_PIXELS = 100; // non-background pixels that count as "painted"
const ROOT = join(import.meta.dirname, "..");
const DUMP_DIR = "/tmp/pebble-signals-drive"; // where drive.py writes .ppm dumps
// Post-install settle: how long the heartbeat capture stays open before the
// screendump fires. MEASURED (CLAUDE.md Rule 3): on a FRESHLY RESET emulator
// the firmware itself cold-boots ~30 s BEFORE the installed app loads, so the
// old 8 s window — correct mid-session — caught a firmware-boot frame and ZERO
// heartbeats once this runner started resetting per app. The ≥32 s cold-boot
// floor PLUS the ~8 s of heartbeats the MIN_HEARTBEATS assert was tuned for:
// cutting it to the floor alone leaves ~1 tick of margin on a 1/s heartbeat.
const SETTLE_S = 40;
// Receipts live in a SUBDIR of screenshots/: the committed catalog receipts
// (screenshots/<app>-<plat>.png) are the docs' evidence and predate this
// runner, so a smoke run must add beside them, never overwrite one.
const RECEIPTS_SUBDIR = join("screenshots", "smoke");
const CATALOG_RECEIPTS = "screenshots"; // never write receipts straight in here
const MATRIX_JSON = "smoke-matrix.json";
const MATRIX_MD = "smoke-matrix.md";
// --dry-run writes its record/table HERE, not into docs/: a dry run touches no
// device, and a row no device produced must never become the newest row of the
// committed matrix (that would make the staleness column lie).
const DRY_RECORD_DIR = "/tmp/pebble-signals-smoke-matrix";
/** A receipt older than this many days is flagged stale in the table. */
export const STALE_DAYS = 30;

/** One recorded smoke run — the machine-readable half of a receipt. */
export type SmokeRow = {
	app: string;
	platform: string;
	/** ISO day (YYYY-MM-DD) the run was recorded. */
	date: string;
	result: "pass" | "fail" | "dry-run";
	/** Repo-relative PNG path, e.g. `screenshots/smoke/counter-gabbro.png`. */
	receiptPath: string;
};

/** docs/smoke-matrix.json: every run ever recorded, oldest kept forever. */
export type SmokeRecord = { runs: SmokeRow[] };

/**
 * Merge fresh rows into the recorded history. APPEND-ONLY on purpose: a run
 * that happened is evidence, and a matrix that quietly drops old rows cannot
 * be used to argue anything about staleness. Newest-per-app/platform is a VIEW
 * over this array (see {@link latestRuns}), not a pruning step.
 *
 * The one thing collapsed is an EXACT duplicate (same app/platform/date/result/
 * receipt) — re-running the same smoke twice in a day is not new information,
 * and letting it grow the file would bury the history it is meant to keep. A
 * same-day re-run with a DIFFERENT result is kept: that is a state change.
 */
export function mergeRuns(prev: SmokeRow[], fresh: SmokeRow[]): SmokeRow[] {
	const out = [...prev];
	for (const row of fresh) {
		const dup = out.some(
			(r) =>
				r.app === row.app &&
				r.platform === row.platform &&
				r.date === row.date &&
				r.result === row.result &&
				r.receiptPath === row.receiptPath,
		);
		if (!dup) out.push(row);
	}
	// Stable sort by app/platform/date so the json diffs like a table and a
	// same-day pair keeps the order it was recorded in (see latestRuns).
	return out.sort(
		(a, b) =>
			a.app.localeCompare(b.app) ||
			a.platform.localeCompare(b.platform) ||
			a.date.localeCompare(b.date),
	);
}

/**
 * Newest run per app/platform. ISO dates make a string compare a chronological
 * compare; a tie goes to the row recorded LAST, so a same-day re-run (a fix, or
 * a fresh failure) is the one the table shows.
 */
export function latestRuns(runs: SmokeRow[]): SmokeRow[] {
	const newest = new Map<string, SmokeRow>();
	for (const r of runs) {
		const key = `${r.app}|${r.platform}`;
		const cur = newest.get(key);
		if (!cur || r.date >= cur.date) newest.set(key, r);
	}
	return [...newest.values()].sort(
		(a, b) => a.app.localeCompare(b.app) || a.platform.localeCompare(b.platform),
	);
}

/**
 * Whole days between two ISO days. Parsed as UTC deliberately: a local-time
 * parse makes the age column flip by a day depending on the runner's timezone,
 * and the age is the number the staleness flag is computed from.
 */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const RESULT_MARK: Record<string, string> = {
	pass: "✅ pass",
	fail: "❌ fail",
	"dry-run": "🟡 dry-run",
};

/**
 * Render docs/smoke-matrix.md from the recorded runs — a pure VIEW of the json,
 * regenerable at any time with `--matrix`.
 *
 * The age column is the entire point: an undated PASS table reads as "verified"
 * forever, which is how the catalog came to imply a freshness it no longer had.
 * `today` is a parameter (not `new Date()`) so the table is testable and the
 * whole file is reproducible from the json.
 */
export function renderMatrix(runs: SmokeRow[], today: string): string {
	const out: string[] = [
		"# Smoke matrix — dated device-smoke receipts",
		"",
		"<!-- GENERATED FILE — `node tools/device-smoke.mts --matrix` re-renders this",
		"     from smoke-matrix.json. Do not hand-edit; fix the runner or the json. -->",
		"",
		`Newest run per app/platform, as of ${today}. \`smoke-matrix.json\` beside this`,
		"file keeps EVERY run ever recorded (append-only); this table is the",
		`newest-wins view of it. A receipt older than ${STALE_DAYS} days is flagged stale`,
		"here rather than sitting in an undated table that implies it is fresh.",
		"",
	];
	if (!runs.length) {
		// A first checkout has no runs yet — say so, loudly, instead of
		// rendering an empty table that looks like "nothing to verify".
		out.push(
			"**No runs recorded yet** — run `pnpm run smoke:device` on a box with the Pebble",
			"SDK, then commit the json and this table.",
			"",
		);
		return out.join("\n");
	}
	out.push("| app | platform | last run | age | result | receipt |");
	out.push("|---|---|---|---|---|---|");
	for (const r of latestRuns(runs)) {
		const age = daysBetween(r.date, today);
		const ageCell = age >= STALE_DAYS ? `**${age} d** ⚠️ stale` : `${age} d`;
		// receiptPath is repo-relative and this file lives in docs/, hence ../
		out.push(
			`| \`${r.app}\` | ${r.platform} | ${r.date} | ${ageCell} | ${RESULT_MARK[r.result] ?? r.result} | [${r.receiptPath}](../${r.receiptPath}) |`,
		);
	}
	const dates = runs.map((r) => r.date).sort();
	out.push("", `_${runs.length} run(s) recorded, ${dates[0]} → ${dates[dates.length - 1]}._`, "");
	return out.join("\n");
}

/** Read the record. A MISSING file is the first run, not an error. */
export function loadRecord(path: string): SmokeRecord {
	if (!existsSync(path)) return { runs: [] };
	// `runs` is defaulted rather than trusted: the json is a committed file a
	// human can hand-edit, and losing the key must not crash the next run.
	const rec = JSON.parse(readFileSync(path, "utf8")) as Partial<SmokeRecord>;
	return { runs: rec.runs ?? [] };
}

/** Write the record: tab-indented + trailing newline, like the other tools. */
export function saveRecord(path: string, runs: SmokeRow[]): void {
	writeFileSync(path, `${JSON.stringify({ runs }, null, "\t")}\n`);
}

const sleep = (s: number) => execFileSync("sleep", [String(s)]);

const sh = (cmd: string, args: string[], timeout = 180_000): string =>
	execFileSync(cmd, args, {
		cwd: ROOT,
		encoding: "utf8",
		timeout,
		stdio: ["ignore", "pipe", "pipe"],
	});

// pypkjs owns the single-client qemu port; drive.py needs it gone. pkill
// exits 1 when nothing matched — that is fine, not an error.
const killPypkjs = () => {
	try {
		execFileSync("pkill", ["-9", "-f", "pypkjs"]);
	} catch {}
	sleep(1);
};

// Parse a binary P6 .ppm and count pixels differing from the dominant color
// (the background). Enough to prove the app painted SOMETHING.
const paintedPixels = (ppmPath: string): number => {
	const buf = readFileSync(ppmPath);
	// header: "P6\n<w> <h>\n<max>\n" then raw RGB — find the 3rd newline
	let pos = 0;
	for (let seen = 0; seen < 3 && pos < buf.length; pos++) if (buf[pos] === 10) seen++;
	const counts = new Map<number, number>();
	for (let i = pos; i + 2 < buf.length; i += 3) {
		const key = (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
		counts.set(key, (counts.get(key) || 0) + 1);
	}
	let total = 0,
		dominant = 0;
	for (const n of counts.values()) {
		total += n;
		if (n > dominant) dominant = n;
	}
	return total - dominant;
};

// Hard-reset the emulator (kills qemu+pypkjs, wipes the persist dir). Failures
// are swallowed on purpose: the very next install re-extracts a clean state
// dir, so a reset that could not run is not itself a smoke failure.
const resetEmulator = (plat: string) => {
	try {
		sh(join(ROOT, "tools", "reset-emulator.sh"), [plat], 300_000);
	} catch {}
};

// One full attempt for one app. Throws with a reason string on any failure.
const runSmoke = (
	s: Smoke,
	plat: string,
	receipts: string,
): { heartbeats: number; painted: number } => {
	sh(process.execPath, [join(ROOT, "build.mts"), "--app", s.app], 600_000);
	// The proven log-capture recipe (CLAUDE.md Rule 3), in ONE shell: attach
	// `pebble logs` BEFORE a FOREGROUND install, let the app emit SETTLE_S of
	// heartbeats, then kill the capture. Install retried once (Rule 3: the
	// first cold-boot install after a reset can flake).
	const cap = join(DUMP_DIR, `${s.app}.log`);
	const install = sh(
		"bash",
		[
			"-c",
			`mkdir -p ${JSON.stringify(DUMP_DIR)}
			pebble logs --emulator ${plat} > ${JSON.stringify(cap)} 2>&1 & LP=$!
			sleep 3
			pebble install --emulator ${plat} || { sleep 3; pebble install --emulator ${plat}; }
			sleep ${SETTLE_S}
			kill $LP 2>/dev/null || true`,
		],
		420_000,
	);
	if (!install.includes("App install succeeded")) throw new Error("install failed");
	const logTxt = readFileSync(cap, "utf8");
	const heartbeats = (logTxt.match(/instruments:/g) || []).length;
	if (logTxt.includes("fxAbort")) throw new Error(`fxAbort in logs (${heartbeats} heartbeats)`);
	if (heartbeats < MIN_HEARTBEATS)
		throw new Error(`dead/quiet transport: ${heartbeats} heartbeats < ${MIN_HEARTBEATS}`);
	// buttons + screendump go direct-to-qemu; pypkjs must die first. drive.py
	// can refuse the connection for a beat while the freed port settles —
	// retry once.
	killPypkjs();
	const args = ["tools/drive.py", plat, ...s.drive, `d:${s.app}`];
	let out: string;
	try {
		out = sh("python3", args);
	} catch {
		sleep(2);
		out = sh("python3", args);
	}
	if (!out.includes(`DUMP ${s.app}`)) throw new Error("screendump failed");
	const ppm = join(DUMP_DIR, `${s.app}.ppm`);
	const painted = paintedPixels(ppm);
	if (painted < MIN_PIXELS)
		throw new Error(`blank frame: ${painted} painted pixels < ${MIN_PIXELS}`);
	// PNG receipt for human eyes (PIL is present on the dev box; the ASSERT
	// above ran on the raw ppm, so a missing PIL only costs the pretty copy).
	const png = join(receipts, `${s.app}-${plat}.png`);
	try {
		sh("python3", [
			"-c",
			`from PIL import Image; Image.open(${JSON.stringify(ppm)}).save(${JSON.stringify(png)})`,
		]);
	} catch {
		console.log(`  (PIL missing — receipt stays at ${ppm})`);
	}
	return { heartbeats, painted };
};

// CLI. Guarded so tests/smokematrix.test.mts can import the record/render
// functions above WITHOUT the runner reaching for an emulator on import.
if (import.meta.main) {
	const { values: opts } = parseArgs({
		options: {
			platform: { type: "string", default: "gabbro" },
			apps: { type: "string" }, // comma-filter of catalog entries
			receipts: { type: "string", default: join(ROOT, RECEIPTS_SUBDIR) },
			// re-render the md table from the json and exit — no build, no device
			matrix: { type: "boolean", default: false },
			// walk build-row → merge → render with no device at all
			"dry-run": { type: "boolean", default: false },
			// where smoke-matrix.{json,md} live (default docs/, or a scratch dir
			// under --dry-run so a deviceless row never lands in the committed one)
			"record-dir": { type: "string" },
		},
	});
	const PLAT = opts.platform as string;
	if (!/^[a-z0-9]+$/.test(PLAT)) {
		console.error(`device-smoke: bad platform name: ${PLAT}`);
		process.exit(1);
	}
	const DRY = opts["dry-run"] as boolean;
	const receiptsDir = opts.receipts as string;
	// Refuse to write receipts straight into screenshots/: the 180+ committed
	// catalog receipts there are what docs/*.md points at, and a smoke run that
	// overwrites one destroys evidence it cannot regenerate (Rule 12 — loud).
	if (resolve(receiptsDir) === resolve(ROOT, CATALOG_RECEIPTS)) {
		console.error(
			`device-smoke: --receipts must not be the committed catalog dir (${CATALOG_RECEIPTS}/); use ${RECEIPTS_SUBDIR}/`,
		);
		process.exit(1);
	}
	const recordDir = (opts["record-dir"] as string) ?? (DRY ? DRY_RECORD_DIR : join(ROOT, "docs"));
	const jsonPath = join(recordDir, MATRIX_JSON);
	const mdPath = join(recordDir, MATRIX_MD);
	const today = new Date().toISOString().slice(0, 10);

	// --matrix: the table is a VIEW of the json, so it must be rebuildable
	// without a device — that is what keeps the dates honest after a run on a
	// box that never opens this repo again.
	if (opts.matrix) {
		mkdirSync(recordDir, { recursive: true });
		const { runs } = loadRecord(jsonPath);
		writeFileSync(mdPath, renderMatrix(runs, today));
		console.log(`device-smoke: wrote ${mdPath} from ${runs.length} recorded run(s)`);
		process.exit(0);
	}

	const wanted = opts.apps ? (opts.apps as string).split(",") : SMOKES.map((s) => s.app);
	const unknown = wanted.filter((a) => !SMOKES.some((s) => s.app === a));
	if (unknown.length) {
		console.error(`device-smoke: unknown app(s): ${unknown.join(", ")}`);
		process.exit(1);
	}
	if (!DRY) mkdirSync(receiptsDir, { recursive: true });

	const results: { app: string; ok: boolean; detail: string }[] = [];
	const rows: SmokeRow[] = [];
	for (const s of SMOKES.filter((s) => wanted.includes(s.app))) {
		console.log(`device-smoke: ${s.app} (${PLAT}) — expect: ${s.expect}`);
		// The row this app will contribute to the record, receipt path and all —
		// built up front so a dry run records exactly what a real run would.
		const receiptPath = relative(ROOT, join(receiptsDir, `${s.app}-${PLAT}.png`));
		if (DRY) {
			rows.push({ app: s.app, platform: PLAT, date: today, result: "dry-run", receiptPath });
			console.log("  DRY-RUN — recorded, nothing built, nothing installed");
			continue;
		}
		// RESET-PER-APP (CLAUDE.md Rule 3, MEASURED): the pypkjs screenshot/install
		// transport rots after ~4–8 installs in a session, and a rotted capture
		// returns a STALE frame that passes every size check — the FIRST app after
		// a reset is the reliable one. So every app starts from a wiped emulator,
		// not just the ones that already failed. (Cost: the SETTLE_S cold-boot
		// wait per app. That is the price of a receipt that means something.)
		// TRADE-OFF worth knowing: reset-emulator.sh wipes the PERSIST dir too, so
		// `kvprobe` now reads "boot=1" every run — its across-launches persistence
		// claim needs a manual second install with no reset in between.
		resetEmulator(PLAT);
		let attempt = 0;
		for (;;) {
			try {
				const { heartbeats, painted } = runSmoke(s, PLAT, receiptsDir);
				results.push({ app: s.app, ok: true, detail: `${heartbeats} hb, ${painted}px painted` });
				break;
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				if (attempt === 0) {
					// Rule 3: dead transport / wedged emulator — hard reset, retry ONCE
					console.log(`  FAILED (${reason}) — resetting emulator and retrying once`);
					resetEmulator(PLAT);
					attempt++;
					continue;
				}
				results.push({ app: s.app, ok: false, detail: reason });
				break;
			}
		}
		const r = results[results.length - 1];
		console.log(`  ${r.ok ? "PASS" : "FAIL"} — ${r.detail}`);
		rows.push({
			app: s.app,
			platform: PLAT,
			date: today,
			result: r.ok ? "pass" : "fail",
			receiptPath,
		});
	}

	// Record BEFORE the exit code: a failing run is exactly the run whose dated
	// row matters most, and a matrix that only records green is a lie by omission.
	mkdirSync(recordDir, { recursive: true });
	const merged = mergeRuns(loadRecord(jsonPath).runs, rows);
	saveRecord(jsonPath, merged);
	writeFileSync(mdPath, renderMatrix(merged, today));
	console.log(`\ndevice-smoke: recorded ${rows.length} row(s) in ${jsonPath} -> ${mdPath}`);

	// Rule 12: a dry run verified NOTHING on a device, so it must not print the
	// green PASS matrix a real run prints — in a log read later, the two must be
	// impossible to confuse.
	if (DRY) {
		console.log("device-smoke: DRY RUN — no app was built, installed, driven or captured");
		process.exit(0);
	}

	console.log("\ndevice-smoke matrix:");
	for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.app.padEnd(12)} ${r.detail}`);
	const failed = results.filter((r) => !r.ok).length;
	if (failed) {
		console.error(`device-smoke: ${failed}/${results.length} FAILED`);
		process.exit(1);
	}
	console.log(`device-smoke: all ${results.length} passed on ${PLAT}; receipts in ${receiptsDir}`);
}
