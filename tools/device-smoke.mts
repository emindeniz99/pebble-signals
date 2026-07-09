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
// Requires the Pebble SDK + a bootable emulator. Run:
//   npm run smoke:device                    # whole catalog on gabbro
//   node tools/device-smoke.mts --apps counter,movebox --platform gabbro
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
];

const MIN_HEARTBEATS = 3; // capture spans ~8s post-install; instruments ticks ~1/s
const MIN_PIXELS = 100; // non-background pixels that count as "painted"
const ROOT = join(import.meta.dirname, "..");
const DUMP_DIR = "/tmp/signal-piu-drive"; // where drive.py writes .ppm dumps

const { values: opts } = parseArgs({
	options: {
		platform: { type: "string", default: "gabbro" },
		apps: { type: "string" }, // comma-filter of catalog entries
		receipts: { type: "string", default: "/tmp/signal-piu-smoke" },
	},
});
const PLAT = opts.platform as string;
if (!/^[a-z0-9]+$/.test(PLAT)) {
	console.error(`device-smoke: bad platform name: ${PLAT}`);
	process.exit(1);
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

// One full attempt for one app. Throws with a reason string on any failure.
const runSmoke = (s: Smoke): { heartbeats: number; painted: number } => {
	sh(process.execPath, [join(ROOT, "build.mts"), "--app", s.app], 600_000);
	// The proven log-capture recipe (CLAUDE.md Rule 3), in ONE shell: attach
	// `pebble logs` BEFORE a FOREGROUND install, let the app emit ~8s of
	// heartbeats, then kill the capture. Install retried once (Rule 3: the
	// first cold-boot install after a reset can flake).
	const cap = join(DUMP_DIR, `${s.app}.log`);
	const install = sh(
		"bash",
		[
			"-c",
			`mkdir -p ${JSON.stringify(DUMP_DIR)}
			pebble logs --emulator ${PLAT} > ${JSON.stringify(cap)} 2>&1 & LP=$!
			sleep 3
			pebble install --emulator ${PLAT} || { sleep 3; pebble install --emulator ${PLAT}; }
			sleep 8
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
	const args = ["tools/drive.py", PLAT, ...s.drive, `d:${s.app}`];
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
	const png = join(opts.receipts as string, `${s.app}-${PLAT}.png`);
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

const wanted = opts.apps ? (opts.apps as string).split(",") : SMOKES.map((s) => s.app);
const unknown = wanted.filter((a) => !SMOKES.some((s) => s.app === a));
if (unknown.length) {
	console.error(`device-smoke: unknown app(s): ${unknown.join(", ")}`);
	process.exit(1);
}
mkdirSync(opts.receipts as string, { recursive: true });

const results: { app: string; ok: boolean; detail: string }[] = [];
for (const s of SMOKES.filter((s) => wanted.includes(s.app))) {
	console.log(`device-smoke: ${s.app} (${PLAT}) — expect: ${s.expect}`);
	let attempt = 0;
	for (;;) {
		try {
			const { heartbeats, painted } = runSmoke(s);
			results.push({ app: s.app, ok: true, detail: `${heartbeats} hb, ${painted}px painted` });
			break;
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			if (attempt === 0) {
				// Rule 3: dead transport / wedged emulator — hard reset, retry ONCE
				console.log(`  FAILED (${reason}) — resetting emulator and retrying once`);
				try {
					sh(join(ROOT, "tools", "reset-emulator.sh"), [PLAT], 300_000);
				} catch {}
				attempt++;
				continue;
			}
			results.push({ app: s.app, ok: false, detail: reason });
			break;
		}
	}
	const r = results[results.length - 1];
	console.log(`  ${r.ok ? "PASS" : "FAIL"} — ${r.detail}`);
}

console.log("\ndevice-smoke matrix:");
for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.app.padEnd(12)} ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
if (failed) {
	console.error(`device-smoke: ${failed}/${results.length} FAILED`);
	process.exit(1);
}
console.log(`device-smoke: all ${results.length} passed on ${PLAT}; receipts in ${opts.receipts}`);
