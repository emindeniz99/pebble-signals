// Build orchestrator (ported from build.sh — C14). Transpile JSX
// (src/tsx -> src/embeddedjs/app), minify the runtime into
// src/embeddedjs/runtime-min (the manifest ships THAT copy — the mod archive
// has a hard ~15.9KB startup ceiling, README gotcha 15, and minifying
// module-scope identifiers buys back ~370B of it), then run the Pebble build.
// No npm RUNTIME dependencies; tsc + esbuild come from devDeps. If esbuild is
// unavailable the runtime ships unminified — correctness is identical either way.
//
// Run: node build.mts [flags]   (npm run build [-- flags]). Flags come as CLI
// args (discoverable, typo-checked by parseArgs) with env vars as equivalents —
// env stays supported because `APP=anim npm run build` composes better with npm
// scripts than `npm run build -- --app anim`. CLI wins over env when both given.
//   --app <name>        APP=<name>        example to build (default: list)
//   --no-minify         MINIFY=0          ship readable modules
//   --no-treeshake      TREESHAKE=0       keep the full runtime preloaded
//   --treeshake-force   TREESHAKE_FORCE=1 prune despite a dynamic import
//   --skip-fontcheck    SKIP_FONTCHECK=1  skip the Pebble-font validation
//   --bundle <mode>     BUNDLE=<mode>     "preload" points at multilazy
//   --no-check-c        CHECK_C=0         skip the clang-format gate
//   --no-lower          LOWER=0           skip the packed-API lowering — SAFE
//                                         (object API still works) but costs
//                                         ~2x slots per state and bare reactive
//                                         props need hand-written thunks
//   --no-crash-ui       CRASH_UI=0        drop render()'s on-watch crash SCREEN;
//                                         escaped errors still log + contain (the
//                                         node keeps its last good value). DCEs
//                                         showCrash — reclaims boot symbols/bytes
//                                         for a saturated app (see docs/field-notes)
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as esbuild from "esbuild";
import { classify } from "./tools/classify-module.mts";
import { packageRoot } from "./tools/pkg-root.mts";
import { renameRuntimeExports } from "./tools/symbol-rename.mts";

// PACKAGE root (where signal-piu lives — the repo itself, or
// node_modules/signal-piu inside a consumer project) vs PROJECT root (the app
// being built). In-repo they are the SAME directory and behavior is unchanged.
// A CONSUMER project runs `node node_modules/signal-piu/build.mts` from its own
// root: the project is detected by a package.json carrying a `pebble` field,
// app sources / manifest / scaffold come from the PROJECT, while the runtime
// sources, tsconfig.runtime-build and the compile tools come from the PACKAGE.
// This script runs from TWO layouts: the repo root (build.mts, tools/ beside
// it) and the packed tarball's dist/ (build.mjs, dist/tools/ beside it —
// compiled because Node refuses to type-strip .mts under node_modules). So the
// package root is found by walking UP, the tools dir is SCRIPT-relative, and
// tool file extensions follow this script's own compiled-ness.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG = packageRoot(SCRIPT_DIR);
const TOOLS = join(SCRIPT_DIR, "tools");
const EXT = import.meta.url.endsWith(".mjs") ? ".mjs" : ".mts";
const PROJ = (() => {
	const cwd = process.cwd();
	if (resolve(cwd) === resolve(PKG)) return PKG;
	try {
		const pj = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as Record<
			string,
			unknown
		>;
		if ("pebble" in pj) return cwd;
	} catch {
		/* no package.json here — fall through to the package root */
	}
	return PKG;
})();
process.chdir(PROJ);
const consumer = PROJ !== PKG;
if (consumer) console.log(`build: consumer project ${PROJ}\nbuild: signal-piu package ${PKG}`);

const cli = parseArgs({
	options: {
		app: { type: "string" },
		minify: { type: "boolean" }, // parseArgs auto-provides --no-minify negation
		treeshake: { type: "boolean" },
		"treeshake-force": { type: "boolean" },
		"skip-fontcheck": { type: "boolean" },
		bundle: { type: "string" },
		"check-c": { type: "boolean" },
		lower: { type: "boolean" },
		prune: { type: "boolean" },
		"preload-pure": { type: "boolean" },
		squash: { type: "boolean" },
		symdiet: { type: "boolean" },
		"crash-ui": { type: "boolean" },
	},
	allowNegative: true, // --no-minify / --no-treeshake / --no-check-c / --no-lower
}).values;
const env = (k: string, d: string) => process.env[k] ?? d;
// boolean flag: CLI (if given) beats env (if set) beats the default
const flag = (cliVal: boolean | undefined, envKey: string, on: string, dflt: boolean): boolean =>
	cliVal ?? (process.env[envKey] !== undefined ? process.env[envKey] === on : dflt);
// tsc binary: the package's devDep in-repo; a consumer brings its own
// typescript (devDep) — resolve theirs, else fall back to PATH.
const TSC = [join(PKG, "node_modules", ".bin", "tsc"), join(PROJ, "node_modules", ".bin", "tsc")]
	.concat("tsc")
	.find((p) => p === "tsc" || existsSync(p))!;

// Run a command, inheriting stdio, and abort the build on nonzero exit. Used for
// tsc / pebble / node tools (no clean in-process API). esbuild, by contrast, is
// driven through its programmatic API below — no subprocess per module, typed
// options, structured errors (the CLI is just a thin wrapper over build()).
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: "inherit" });
// esbuild via its JS API, with a fallback: return false instead of throwing so a
// missing/erroring esbuild can degrade to a verbatim copy (build.sh's `|| cp`).
const tryEsbuild = (opts: esbuild.BuildOptions): boolean => {
	try {
		esbuild.buildSync({ logLevel: "error", ...opts });
		return true;
	} catch {
		return false;
	}
};
const err = (msg: string) => process.stderr.write(`${msg}\n`);

// APP=<name> builds src/tsx/examples/<name>.tsx as the app (default: list, the
// shipping demo). One example = one standalone app — several prebuilt reactive
// screens in ONE mod exceed the 32KB arena at boot (README, M11). tsc compiles
// every example in place and esbuild --bundle stitches the chosen entry (with
// its local ./imports) into app/main.js below, runtime/* left external.
const APP = cli.app ?? env("APP", "list");
const appSrc = `src/tsx/examples/${APP}.tsx`;

// Generate the mod manifest from the base; image/vector resources are DERIVED
// from the app's own `new Texture("x.png")` refs (each mapped to assets/x), so
// an app bundles exactly the bitmaps it names. manifest.json is gitignored.
const manifestBase = existsSync("src/embeddedjs/manifest.base.json")
	? "src/embeddedjs/manifest.base.json" // the project's own
	: join(PKG, "src/embeddedjs/manifest.base.json"); // package default
copyFileSync(manifestBase, "src/embeddedjs/manifest.json");
run(process.execPath, [join(TOOLS, `gen-manifest${EXT}`), appSrc, "src/embeddedjs/manifest.json"]);

// Per-app runtime tree-shaking. Runtime modules are frozen into ROM by
// `preload`, and each preloaded module still costs a few XS aliases at boot. An
// app that never imports runtime/flow does not need it preloaded OR mapped —
// prune the manifest to the transitive closure of the runtime it imports.
// DEFAULT ON, self-disabling: if the app pulls a runtime module INDIRECTLY via a
// dynamic import()/importNow() the static scan can't resolve, pruning could drop
// a module reached at runtime (boot-crash), so SKIP and say why. TREESHAKE_FORCE=1
// prunes anyway; TREESHAKE=0 forces the full runtime.
// LAZY app modules (#27): a literal `importNow("app/<x>")` in the entry IS
// resolvable statically — <x> maps to src/tsx/examples/<APP>/<x>.tsx|ts,
// shipped later as a NON-preloaded manifest module (bytecode loads from
// flash on the first call). Resolved literals don't defeat the scans, so
// treeshake/prune stay ON; any OTHER dynamic import still self-disables.
const lazySet = new Set<string>();
let unresolvedDynamicImport = false;
if (existsSync(appSrc)) {
	// comments off first — the scan must see CODE only (a mention of
	// importNow() in a doc comment is not a dynamic import)
	const src = readFileSync(appSrc, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "");
	for (const m of src.matchAll(/import(?:Now)?\s*\(\s*([^)]*)\)/g)) {
		const lit = /^"app\/((?:screens\/)?[\w-]+)"\s*$/.exec(m[1]);
		const base = lit?.[1];
		if (base && existsSync(join("src/tsx/examples", APP, `${base}.tsx`))) lazySet.add(base);
		else if (base && existsSync(join("src/tsx/examples", APP, `${base}.ts`))) lazySet.add(base);
		// a COMPUTED name under the screens/ folder convention is still
		// resolvable: EVERY screens/* file ships (enumerated below), so the
		// dynamic import can only reach shipped-and-scanned modules
		else if (/^"app\/screens\/"\s*\+/.test(m[1]) && existsSync(join("src/tsx/examples", APP, "screens"))) {
			/* covered by the folder convention */
		} else unresolvedDynamicImport = true;
	}
}
// Folder convention: every src/tsx/examples/<APP>/screens/*.tsx|ts ships as
// a lazy module `app/screens/<name>` — no per-screen importNow literal
// needed, and the imported name may be computed at runtime (see above).
const screensDir = join("src/tsx/examples", APP, "screens");
if (existsSync(screensDir))
	for (const f of readdirSync(screensDir))
		if (/\.tsx?$/.test(f)) lazySet.add(`screens/${f.replace(/\.tsx?$/, "")}`);
const lazyBases = [...lazySet];
let treeshake = flag(cli.treeshake, "TREESHAKE", "1", true);
if (treeshake && !flag(cli["treeshake-force"], "TREESHAKE_FORCE", "1", false)) {
	if (unresolvedDynamicImport) {
		err(`treeshake: SKIPPED — ${APP}.tsx uses a dynamic import() the static scan can't follow;`);
		err("           pruning could drop a runtime module reached at runtime. TREESHAKE_FORCE=1 to override.");
		treeshake = false;
	}
}
// lazy modules' own runtime imports count toward the treeshake keep-set
const shakeSources = [
	appSrc,
	...lazyBases.map((b) => {
		const tsx = join("src/tsx/examples", APP, `${b}.tsx`);
		return existsSync(tsx) ? tsx : join("src/tsx/examples", APP, `${b}.ts`);
	}),
];
if (treeshake)
	run(process.execPath, [join(TOOLS, `treeshake${EXT}`), ...shakeSources, "src/embeddedjs/manifest.json"]);

// Font sanity check (gotcha 20): an invalid font string renders NOTHING — blank
// text, no error, hours lost. Validate every `font:` literal against the Pebble
// system-font table at COMPILE time and fail loud. SKIP_FONTCHECK=1 to escape.
if (!flag(cli["skip-fontcheck"], "SKIP_FONTCHECK", "1", false))
	run(process.execPath, [join(TOOLS, `fontcheck${EXT}`), appSrc]);

// Minify (DCE + identifier mangling) is DEFAULT ON — buys back ~370B of the
// ~15.9KB startup ceiling (gotcha 15) and DCEs unused runtime branches. MINIFY=0
// ships readable modules (correctness is identical either way). Self-disabling:
// if esbuild is missing/errors, each file falls back to a verbatim copy.
const minify = flag(cli.minify, "MINIFY", "1", true);
// Crash-screen build flag (DEFAULT ON). --no-crash-ui / CRASH_UI=0 esbuild-
// `define`s __SP_CRASH_UI__ = false in the runtime minify, so DCE drops
// jsx-runtime's showCrash body (Text/Skin/Style build + retry) and render()
// installs the lean log+contain sink instead. Boot symbols/bytes back for a
// saturated app that would rather keep the room than the on-watch error UI.
const crashUI = flag(cli["crash-ui"], "CRASH_UI", "1", true);
// esbuild `define` for the runtime minify: substitutes the compile-time flag so
// `typeof __SP_CRASH_UI__ === "undefined" || __SP_CRASH_UI__` folds to a const.
// ALWAYS define it (true when ON, false when OFF) — never leave it undefined in
// a minified build: an undefined free identifier survives as an archive SYMBOL
// (measured: `__SP_CRASH_UI__` cost 1 boot slot on every default build). Defined
// to `true`, esbuild folds the guard away AND the identifier vanishes; the
// `typeof` still protects Node tests / non-minified builds where it is genuinely
// undefined.
const crashDefine: Record<string, string> = { __SP_CRASH_UI__: crashUI ? "true" : "false" };
rmSync("src/embeddedjs/app", { recursive: true, force: true });
rmSync("src/embeddedjs/runtime-min", { recursive: true, force: true });
rmSync("src/embeddedjs/runtime-build", { recursive: true, force: true });
rmSync("src/embeddedjs/runtime-types", { recursive: true, force: true });

// Compile any .ts runtime sources to runtime-build/*.js (types erase —
// behavior-identical to the old hand-written .js, verified emit-diff); files
// still in .js are used as-is. The minify input for each module is
// runtime-build/X.js if converted, else runtime/X.js.
if (readdirSync(join(PKG, "src/embeddedjs/runtime")).some((f) => f.endsWith(".ts")))
	run(
		TSC,
		["-p", join(PKG, "tsconfig.runtime-build.json")].concat(
			// consumer: emit into the PROJECT tree (the manifest's ./runtime-min
			// sibling), not into node_modules
			consumer ? ["--outDir", join(PROJ, "src/embeddedjs/runtime-build")] : [],
		),
	);
run(TSC, ["-p", "tsconfig.json"]);
// PKJS (phone-side) glue: index.ts -> index.js for `pebble build` to bundle
// into the mobile app (separate engine/config — see tsconfig.pkjs.json).
if (existsSync("tsconfig.pkjs.json")) run(TSC, ["-p", "tsconfig.pkjs.json"]);

// ---- PRELOAD_PURE v1: route PURE app submodules to ROM (the smart split) --
// App code normally bundles into main.js, which loads INTO the 32KB arena —
// every app byte is heap (measured: navfat's 3-label screens die at boot when
// all-in-main). A PURE submodule (only const data + pure declarations — the
// classifier proves it) can instead ship like the runtime: a preloaded module
// FROZEN into the mod archive at build time, costing ROM instead of main.js
// heap. v1 scope: direct relative imports of the entry, no nested local
// imports, no lowering/auto-thunk inside the pure module (keep JSX + reactive
// reads in the entry; pure modules are data/logic). Default OFF until broadly
// measured; enable with --preload-pure / PRELOAD_PURE=1. Self-disables with
// treeshake (a dynamic import defeats the same static scan).
const preloadPure = flag(cli["preload-pure"], "PRELOAD_PURE", "1", false) && treeshake;
const entryJs = `src/embeddedjs/app/examples/${APP}.js`;
const pureIds: string[] = [];
const pureFiles: string[] = [];
if (preloadPure && existsSync(entryJs)) {
	let entrySrc = readFileSync(entryJs, "utf8");
	const manifest = JSON.parse(readFileSync("src/embeddedjs/manifest.json", "utf8")) as {
		modules: Record<string, string>;
		preload: string[];
	};
	for (const m of [...entrySrc.matchAll(/from\s*"(\.\/[^"]+)"/g)]) {
		const spec = m[1];
		const rel = `examples/${spec.slice(2)}`; // entry lives in app/examples/
		const file = `src/embeddedjs/app/${rel}.js`;
		if (!existsSync(file)) continue;
		const sub = readFileSync(file, "utf8");
		if (/from\s*"\.\.?\//.test(sub)) {
			err(`preload-pure: ${spec} imports other local modules — v1 keeps it in main`);
			continue;
		}
		const verdict = classify(sub);
		if (!verdict.pure) {
			err(`preload-pure: ${spec} is IMPURE (${verdict.reasons[0] ?? "?"}) — stays in main`);
			continue;
		}
		const base = spec.split("/").pop()!;
		const id = `app/${base}`;
		if (manifest.modules[id]) {
			err(`preload-pure: module id ${id} already taken — ${spec} stays in main`);
			continue;
		}
		manifest.modules[id] = `./app/${rel}`;
		manifest.preload.push(id);
		entrySrc = entrySrc.replaceAll(`"${spec}"`, `"${id}"`);
		pureIds.push(id);
		pureFiles.push(file);
		// ship the module minified like the runtime (bundle-mode for DCE;
		// runtime/* and app/* stay external)
		if (minify)
			tryEsbuild({
				entryPoints: [file],
				bundle: true,
				external: ["runtime/*", "app/*"],
				treeShaking: true,
				minify: true,
				format: "esm",
				outfile: file,
				allowOverwrite: true,
			});
		console.log(`preload-pure: ${spec} -> ${id} (ROM)`);
	}
	if (pureIds.length) {
		writeFileSync("src/embeddedjs/manifest.json", JSON.stringify(manifest, null, "\t"));
		writeFileSync(entryJs, entrySrc);
	}
}

// Bundle the chosen entry into ONE app/main.js — this makes MULTI-FILE apps
// work: the entry's local imports are inlined so the manifest only maps `main`,
// while `runtime/*` is left EXTERNAL so those modules stay preloaded (ROM, ~free)
// instead of pulled into the heap. Single-file apps bundle to themselves.
// BUNDLE=preload is a pointer to the device-verified multilazy strategy (lazy
// importNow of a preloaded screen); eager auto-preload of arbitrary app
// submodules is UNVERIFIED on this XS build (Rule 2), so fall back to `all`.
if ((cli.bundle ?? env("BUNDLE", "all")) === "preload") {
	err("bundle: 'preload' strategy — see src/tsx/examples/multilazy.tsx (device-verified");
	err("        lazy-import of a preloaded screen). Falling back to BUNDLE=all for this build.");
}
// treeShaking:true is explicit (DCE unreferenced app exports/branches during the
// bundle) even without minify, so BUNDLE stays lean when MINIFY=0. This one must
// succeed — buildSync throws on error, aborting the build (no verbatim fallback).
esbuild.buildSync({
	entryPoints: [`src/embeddedjs/app/examples/${APP}.js`],
	bundle: true,
	external: ["runtime/*", "app/*"],
	format: "esm",
	treeShaking: true,
	outfile: "src/embeddedjs/app/main.js",
	allowOverwrite: true,
	logLevel: "error",
});

// Stage-2/3 lowering on the bundled entry: rewrite useState/signal/computed +
// call sites to the packed API (S.sig/get/set/put/computed) so the per-state
// closures and the Signal object never exist at runtime. AST-based; anything
// ambiguous bails to the object API. A prod run re-lowers its own output and
// refuses to write if it is not a fixed point. Guarded by `--selftest`.
// OPTIONAL (--no-lower / LOWER=0): the object API works unlowered — it just
// costs ~2x slots per state and loses the auto-thunk sugar (docs/packaging.md).
if (flag(cli.lower, "LOWER", "1", true))
	run(process.execPath, [join(TOOLS, "lower", `cli${EXT}`), "src/embeddedjs/app/main.js"]);

// ---- LAZY app modules (#27): ship importNow("app/<x>") targets ------------
// Each resolved literal becomes a manifest module WITHOUT preload: its
// bytecode stays in flash until the first importNow() call. Boot still pays
// the module's 2 ids + its new-to-host symbols (fxMapArchive interns the
// whole SYMB atom eagerly — playbook "The boot floor"), so lazy modules
// should export `default` only and keep their symbol surface near zero.
// No lower/auto-thunk inside lazy modules (same v1 rule as PRELOAD_PURE:
// JSX with explicit thunks only).
const lazyFiles: string[] = [];
if (lazyBases.length) {
	const manifest = JSON.parse(readFileSync("src/embeddedjs/manifest.json", "utf8")) as {
		modules: Record<string, string>;
		preload: string[];
	};
	for (const base of lazyBases) {
		const rel = `examples/${APP}/${base}`;
		const file = `src/embeddedjs/app/${rel}.js`;
		if (!existsSync(file)) {
			err(`lazy: importNow("app/${base}") has no compiled module at ${file} — failing loud`);
			process.exit(1);
		}
		const id = `app/${base}`;
		if (manifest.modules[id]) {
			err(`lazy: module id ${id} already taken — failing loud`);
			process.exit(1);
		}
		manifest.modules[id] = `./app/${rel}`;
		// SQUASH pass (default ON): array-of-arrows -> ONE dispatch fn — the
		// device-proven lazymany->lazypack fix, applied mechanically. Narrow
		// and bail-safe; whatever it can't prove stays for the advisory below.
		if (flag(cli.squash, "SQUASH", "1", true))
			run(process.execPath, [join(TOOLS, `squash${EXT}`), file]);
		if (minify)
			tryEsbuild({
				entryPoints: [file],
				bundle: true,
				external: ["runtime/*", "app/*"],
				treeShaking: true,
				minify: true,
				format: "esm",
				outfile: file,
				allowOverwrite: true,
			});
		lazyFiles.push(file);
		// squash advisory: loading a module builds EVERY module-level function
		// object in RAM (~5-6 slots each; measured safe band ≤16 — playbook
		// "Code in ROM"). The count below is rough (nested arrows included).
		const fnCount = (readFileSync(file, "utf8").match(/=>|\bfunction\b/g) || []).length;
		if (fnCount > 16)
			err(
				`lazy: app/${base} creates ~${fnCount} function objects at load (safe band ~16) — ` +
					"the squash pass couldn't pack these; switch-pack by hand " +
					'(playbook "Code in ROM", lazypack example)',
			);
		console.log(`lazy: importNow("app/${base}") -> ${id} (flash, loads on first call)`);
	}
	writeFileSync("src/embeddedjs/manifest.json", JSON.stringify(manifest, null, "\t"));
}

// ---- runtime-min: per-app EXPORT pruning + minify (the #29 fix) -----------
// Runs AFTER lower so the keep-set is read off the FINAL main.js (lowering
// swaps `useState` for the packed `S`, so the pre-lower import list would keep
// the wrong things). Every runtime export the app + shipped sibling modules
// never import is demoted to a module-local declaration
// (tools/prune-exports.mts) and esbuild's minify DCE drops its code — the
// bisect showed the boot arena floor tracks runtime size (clock died at
// mc.xsa ~14.9KB purely from runtime growth), so unused exports are boot RAM.
// Self-disabling with treeshake (a dynamic import the scan can't follow could
// reach anything); --no-prune / PRUNE=0 forces the full surface.
const prune = flag(cli.prune, "PRUNE", "1", true) && treeshake;
// named imports per runtime module, scanned from built .js (`as` aliases keep
// the SOURCE name: `import { S as __sp }` needs export S)
const importScan = (file: string, keeps: Map<string, Set<string> | "all">) => {
	const src = readFileSync(file, "utf8");
	for (const m of src.matchAll(/import\s*(\*\s*as\s+\w+|{[^}]*})\s*from\s*"runtime\/([\w-]+)"/g)) {
		const mod = m[2];
		if (m[1].startsWith("*")) {
			keeps.set(mod, "all"); // namespace import — cannot prune this module
			continue;
		}
		const cur = keeps.get(mod);
		if (cur === "all") continue;
		const set = cur ?? new Set<string>();
		for (const name of m[1].slice(1, -1).split(","))
			if (name.trim()) set.add(name.trim().split(/\s+as\s+/)[0].trim());
		keeps.set(mod, set);
	}
};
const shipped = (
	JSON.parse(readFileSync("src/embeddedjs/manifest.json", "utf8")) as {
		modules?: Record<string, string>;
	}
).modules;
mkdirSync("src/embeddedjs/runtime-min", { recursive: true });
// Collect runtime module files (later dirs win on name collisions — build
// output over hand-written .js, same preference the old dir loop had).
const runtimeFiles = new Map<string, string>();
for (const dir of [join(PKG, "src/embeddedjs/runtime"), "src/embeddedjs/runtime-build"]) {
	if (!existsSync(dir)) continue;
	for (const name of readdirSync(dir))
		if (name.endsWith(".js")) runtimeFiles.set(name, join(dir, name));
}
// Emit in REVERSE-topological order (importers before importees: flow →
// jsx-runtime → signals), so by the time a module is pruned every sibling
// that imports it has already been emitted, DCE'd and import-pruned — its
// keep-set then reflects what actually SHIPS, not what the source mentioned.
// NOTE sibling runtime modules are NOT scanned from their raw builds: that
// kept exports alive that DCE was about to orphan (the ErrorBoundary receipt,
// 2026-07: watchface shipped withBoundary/getBoundary/track/untrack in
// signals only because jsx-runtime-BUILD's import clause named them; the
// DCE'd jsx-runtime-min used none of the four — +9 archive symbols, +540B,
// measured).
const runtimeDeps = new Map<string, string[]>();
for (const [name, f] of runtimeFiles)
	runtimeDeps.set(
		name,
		[...readFileSync(f, "utf8").matchAll(/from\s*"runtime\/([\w-]+)"/g)].map((m) => `${m[1]}.js`),
	);
const emitOrder: string[] = [];
const emitSeen = new Set<string>();
const emitVisit = (name: string): void => {
	if (emitSeen.has(name) || !runtimeFiles.has(name)) return;
	emitSeen.add(name);
	for (const dep of runtimeDeps.get(name) ?? []) emitVisit(dep);
	emitOrder.push(name); // post-order = dependencies first…
};
for (const name of runtimeFiles.keys()) emitVisit(name);
emitOrder.reverse(); // …reversed = importers first
// One emission pass: prune each module against `keeps`, minify (DCE), drop
// DCE-orphaned import specifiers, and feed the module's REAL imports into the
// keep-sets of modules emitted after it. Returns the emitted contents so the
// fixpoint check below can compare rounds.
const emitRuntime = (preScanPrevious: boolean): Map<string, string> => {
	const keeps = new Map<string, Set<string> | "all">();
	if (prune) {
		importScan("src/embeddedjs/app/main.js", keeps);
		// lazy app modules import runtime exports the entry may not — keep those
		for (const file of lazyFiles) importScan(file, keeps);
		// preload-pure app modules likewise (romscreens white-screen: screens.js
		// needed jsxs, main.js didn't — pruning it broke render silently)
		for (const file of pureFiles) importScan(file, keeps);
		// rounds 2+: seed with the PREVIOUS round's emitted min files, so a
		// dependency cycle between runtime modules (none today — flow →
		// jsx-runtime → signals is a DAG) would still converge to a safe
		// (possibly non-minimal) keep-set instead of pruning one side blind.
		if (preScanPrevious)
			for (const name of emitOrder) {
				const mod = name.replace(/\.js$/, "");
				const out = join("src/embeddedjs/runtime-min", name);
				if (shipped?.[`runtime/${mod}`] !== undefined && existsSync(out)) importScan(out, keeps);
			}
	}
	const outputs = new Map<string, string>();
	for (const name of emitOrder) {
		const f = runtimeFiles.get(name)!;
		const out = join("src/embeddedjs/runtime-min", name);
		copyFileSync(f, out); // work on a copy — never mutate the source dirs
		const mod = name.replace(/\.js$/, "");
		const keep = keeps.get(mod);
		if (prune && keep !== "all")
			run(process.execPath, [
				join(TOOLS, `prune-exports${EXT}`),
				out,
				[...(keep ?? new Set<string>())].join(","),
			]);
		if (minify)
			tryEsbuild({
				entryPoints: [out],
				// bundle:true is what makes the demoted exports actually DISAPPEAR:
				// esbuild only tree-shakes when bundling, and with runtime/* external
				// nothing gets inlined — imports/exports survive for the manifest map.
				bundle: true,
				external: ["runtime/*"],
				treeShaking: true,
				minify: true,
				// __SP_CRASH_UI__=false (--no-crash-ui) folds jsx-runtime's crash
				// screen guard so DCE drops showCrash; empty when the screen stays.
				define: crashDefine,
				format: "esm",
				outfile: out,
				allowOverwrite: true,
			});
		if (prune && minify)
			// drop the import specifiers DCE just orphaned (esbuild keeps them —
			// it can't prove an external import pure); tools/import-prune-min.mts
			run(process.execPath, [join(TOOLS, `import-prune-min${EXT}`), out]);
		// this module's REAL imports now feed the keep-sets of modules emitted
		// after it — but only if it ships (same rule the old build-scan applied)
		if (prune && shipped?.[`runtime/${mod}`] !== undefined) importScan(out, keeps);
		outputs.set(name, readFileSync(out, "utf8"));
	}
	return outputs;
};
// FIXPOINT check (owner-requested): re-run the pass and require byte-identical
// output. For today's DAG one pass IS the fixpoint — the re-run turns that
// argument into a build-time assertion; if a future runtime-module cycle (or a
// pipeline bug) makes keep-sets order-dependent, the loop converges within 3
// rounds or fails LOUD instead of shipping a silently mis-pruned runtime.
let emitted = emitRuntime(false);
if (prune && minify) {
	for (let round = 2; round <= 3; round++) {
		const next = emitRuntime(true);
		const same = [...next].every(([n, c]) => emitted.get(n) === c);
		emitted = next;
		if (same) {
			if (round > 2) console.log(`prune: keep-set fixpoint reached after ${round} rounds`);
			break;
		}
		if (round === 3) {
			err(
				"build: prune keep-sets did NOT converge in 3 rounds — shipping round 3. " +
					"Check for a runtime-module import cycle (fatal at the boot floor).",
			);
			process.exit(1);
		}
		console.log(`prune: keep-sets changed in round ${round} — iterating`);
	}
}

if (minify)
	tryEsbuild({
		entryPoints: ["src/embeddedjs/app/main.js"],
		minify: true,
		format: "esm",
		outfile: "src/embeddedjs/app/main.js",
		allowOverwrite: true,
	});

// Native C clang-format gate — DEFAULT ON, self-disabling: if clang-format isn't
// installed we skip with a note rather than fail. A misformatted src/c/*.c fails
// loud (CHECK_C=0 to override). Fix with `npm run format:c`.
if (flag(cli["check-c"], "CHECK_C", "1", true)) {
	const cFiles = readdirSync("src/c")
		.filter((f) => f.endsWith(".c"))
		.map((f) => join("src/c", f));
	try {
		run("clang-format", ["--dry-run", "--Werror", ...cFiles]);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") {
			// clang-format not installed — skip (build.sh parity), don't fail.
			err("build: clang-format not found — skipping native C format check");
		} else {
			err("build: native C is misformatted — run 'npm run format:c' (CHECK_C=0 to skip)");
			process.exit(1);
		}
	}
}

// ---- symbol diet: rename runtime EXPORT wire names to host-known ids -------
// Every new-to-host symbol in the archive costs a boot slot (fxMapArchive
// interns the SYMB atom eagerly). A runtime export's wire name (`jsx`, `S`,
// `useState`…) is new-to-host; renaming it — and every matching import — to a
// name the firmware already interns frees the slot. Runs LAST, on the final
// minified artifacts, touching only import/export specifier clauses (local
// code stays byte-identical). Self-disables with treeshake (a dynamic import
// the scan can't follow could reach an un-rewritten wire name). --no-symdiet /
// SYMDIET=0 to force off. See tools/symbol-rename.mts for the safety argument.
if (flag(cli.symdiet, "SYMDIET", "1", true) && treeshake) {
	const shippedMods = (
		JSON.parse(readFileSync("src/embeddedjs/manifest.json", "utf8")) as {
			modules: Record<string, string>;
		}
	).modules;
	const files: Record<string, string> = {};
	const runtimePaths = new Set<string>();
	for (const [id, rel] of Object.entries(shippedMods)) {
		const p = join("src/embeddedjs", `${rel}.js`);
		if (!existsSync(p)) continue;
		files[p] = readFileSync(p, "utf8");
		if (id.startsWith("runtime/")) runtimePaths.add(p);
	}
	const { map, outputs } = renameRuntimeExports(files, runtimePaths);
	for (const [p, src] of Object.entries(outputs)) writeFileSync(p, src);
	const n = Object.keys(map).length;
	if (n) console.log(`symbol-diet: ${n} runtime export(s) renamed to host-known ids`);
}

run("pebble", ["build"]);

// ---- symbol budget report (the boot-floor currency) ------------------------
// Every archive symbol interns at boot; new-to-host ones cost a slot each
// (playbook "The boot floor"). Print the count so a symbol regression is
// visible on every build; tools/host-symbols.py gives the precise
// new-to-host split when the SDK debug ELF is available.
try {
	const xsa = "build/mods/gabbro/mc.xsa";
	if (existsSync(xsa)) {
		const buf = readFileSync(xsa);
		let off = 8;
		const size = buf.readUInt32BE(0);
		while (off < size - 8) {
			const atomSize = buf.readUInt32BE(off);
			if (buf.toString("latin1", off + 4, off + 8) === "SYMB") {
				console.log(
					`symbols: ${buf.readUInt16LE(off + 8)} in ${xsa} (${statSync(xsa).size}B) — ` +
						"each new-to-host name costs a boot slot; see tools/host-symbols.py",
				);
				break;
			}
			off += atomSize;
		}
	}
} catch {
	// report only — never fail the build over it
}
