// `signal-piu dev` — the one-command emulator loop: build → install (with the
// Rule-3 recovery baked in) → stream logs. Everything this repo learned the
// hard way about the emulator is encoded here so nobody re-learns it:
//   * never run `pebble logs` DURING an install (the channel races and the
//     install times out) — logs attach only after install succeeds;
//   * a failed install gets ONE reset-emulator + cold-boot retry (Rule 3);
//   * `--watch` turns it into a poor-man's hot reload: edits under src/tsx
//     rebuild + reinstall automatically (the emulator install ~5-10s IS the
//     reload). Ctrl-C exits.
//
// Usage: npm run dev -- --app clock [--watch] [--platform gabbro] [--no-logs]
// Works in-repo (tools/dev.mts) and from the packed tarball (dist/tools/
// dev.mjs) — same PKG/PROJ rules as build.mts.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { packageRoot } from "./pkg-root.mts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG = packageRoot(SCRIPT_DIR);
const EXT = import.meta.url.endsWith(".mjs") ? ".mjs" : ".mts";
const BUILD = join(SCRIPT_DIR, "..", `build${EXT}`);

const cli = parseArgs({
	options: {
		app: { type: "string" },
		platform: { type: "string" },
		watch: { type: "boolean" },
		logs: { type: "boolean" },
	},
	allowNegative: true,
}).values;
const APP = cli.app ?? process.env.APP ?? "list";
const PLATFORM = cli.platform ?? "gabbro";
const wantLogs = cli.logs ?? true;

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: "inherit" });

function build(): boolean {
	try {
		run(process.execPath, [BUILD, "--app", APP]);
		return true;
	} catch {
		console.error("dev: build failed — fix and save to retry");
		return false;
	}
}

function install(): boolean {
	try {
		run("pebble", ["install", "--emulator", PLATFORM]);
		return true;
	} catch {
		// Rule 3: one hard reset + cold-boot retry before giving up
		console.error("dev: install failed — resetting the emulator (Rule 3) and retrying once");
		const reset = join(PKG, "tools", "reset-emulator.sh");
		try {
			if (existsSync(reset)) run("sh", [reset, PLATFORM]);
			run("pebble", ["install", "--emulator", PLATFORM]);
			return true;
		} catch {
			console.error("dev: install failed again — is the Pebble SDK/emulator healthy?");
			return false;
		}
	}
}

let logsChild: ChildProcess | null = null;
function startLogs(): void {
	if (!wantLogs) return;
	// spawned AFTER install (never during — the channel races, gotcha 12);
	// inherits stdio so XS instrumentation + app logs stream to the terminal.
	logsChild = spawn("pebble", ["logs", "--emulator", PLATFORM], { stdio: "inherit" });
}
function stopLogs(): void {
	if (logsChild) {
		logsChild.kill("SIGTERM");
		logsChild = null;
	}
}

function cycle(): boolean {
	stopLogs();
	if (!build()) return false;
	if (!install()) return false;
	startLogs();
	return true;
}

if (!cycle() && !cli.watch) process.exit(1);

if (cli.watch) {
	const srcDir = join(process.cwd(), "src", "tsx");
	console.log(`dev: watching ${srcDir} — edit + save to rebuild/reinstall (Ctrl-C to quit)`);
	let pending: NodeJS.Timeout | null = null;
	watch(srcDir, { recursive: true }, (_event, file) => {
		if (pending) clearTimeout(pending); // debounce editor save bursts
		pending = setTimeout(() => {
			pending = null;
			console.log(`\ndev: ${file ?? "source"} changed — rebuilding`);
			cycle();
		}, 300);
	});
} else if (wantLogs) {
	console.log("dev: streaming logs — Ctrl-C to quit");
}
