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
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as esbuild from "esbuild";
import { classify } from "./tools/classify-module.mts";
import { packageRoot } from "./tools/pkg-root.mts";

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
let treeshake = flag(cli.treeshake, "TREESHAKE", "1", true);
if (treeshake && !flag(cli["treeshake-force"], "TREESHAKE_FORCE", "1", false)) {
	const usesDynamicImport =
		existsSync(appSrc) && /import(Now)?\s*\(/.test(readFileSync(appSrc, "utf8"));
	if (usesDynamicImport) {
		err(`treeshake: SKIPPED — ${APP}.tsx uses a dynamic import() the static scan can't follow;`);
		err("           pruning could drop a runtime module reached at runtime. TREESHAKE_FORCE=1 to override.");
		treeshake = false;
	}
}
if (treeshake) run(process.execPath, [join(TOOLS, `treeshake${EXT}`), appSrc, "src/embeddedjs/manifest.json"]);

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
const keeps = new Map<string, Set<string> | "all">();
if (prune) {
	importScan("src/embeddedjs/app/main.js", keeps);
	// sibling runtime modules that actually SHIP (per the possibly-treeshaken
	// manifest) also pull exports from each other
	for (const name of Object.keys(shipped ?? {})) {
		const rel = name.replace("runtime/", "");
		const built = join("src/embeddedjs/runtime-build", `${rel}.js`);
		if (name.startsWith("runtime/") && existsSync(built)) importScan(built, keeps);
	}
}
mkdirSync("src/embeddedjs/runtime-min", { recursive: true });
for (const dir of [join(PKG, "src/embeddedjs/runtime"), "src/embeddedjs/runtime-build"]) {
	if (!existsSync(dir)) continue;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".js")) continue;
		const f = join(dir, name);
		const out = join("src/embeddedjs/runtime-min", name);
		copyFileSync(f, out); // work on a copy — never mutate the source dirs
		const keep = keeps.get(name.replace(/\.js$/, ""));
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
				format: "esm",
				outfile: out,
				allowOverwrite: true,
			});
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

run("pebble", ["build"]);
