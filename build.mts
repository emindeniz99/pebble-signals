// Build orchestrator (ported from build.sh — C14). Transpile JSX
// (src/tsx -> src/embeddedjs/app), minify the runtime into
// src/embeddedjs/runtime-min (the manifest ships THAT copy — the mod archive
// has a hard ~15.9KB startup ceiling, README gotcha 15, and minifying
// module-scope identifiers buys back ~370B of it), then run the Pebble build.
// No npm RUNTIME dependencies; tsc + esbuild come from devDeps. esbuild is a
// hard requirement (static import — a missing install fails loud at load);
// the tryEsbuild fallback below only covers esbuild ERRORING on a file, in
// which case that file ships unminified (correctness identical).
//
// Run: node build.mts [flags]   (pnpm run build [-- flags]). Flags come as CLI
// args (discoverable, typo-checked by parseArgs) with env vars as equivalents —
// env stays supported because `APP=anim pnpm run build` composes better with pnpm
// scripts than `pnpm run build -- --app anim`. CLI wins over env when both given.
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
//   --no-lint-reads     LINT_READS=0      skip the reactive-read lint (".value
//                                         footgun" — Signal stringify/call/bare-prop)
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
import { relativeClosure } from "./tools/treeshake.mts";
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
		"lint-reads": { type: "boolean" },
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
// The entry's transitive ./-import closure: the bundle inlines all of it into
// main.js, so EVERY app-source scan below (dynamic-import safety, treeshake
// seeds, gen-manifest resources, lint-reads) must read the same set — the
// entry alone silently missed helpers' runtime imports (P1: pruned module ->
// boot death) and their assets (P2).
// closure reader: FILES only — existsSync alone is true for a DIRECTORY
// (`import "./setup"` beside setup/index.tsx), and readFileSync on it dies
// with EISDIR before relativeClosure ever tries the index candidates
// (codex P2). Missing paths and directories both read as null.
const readSrc = (p: string): string | null => {
	try {
		return statSync(p).isFile() ? readFileSync(p, "utf8") : null;
	} catch {
		return null;
	}
};
const appClosure = existsSync(appSrc) ? relativeClosure(appSrc, readSrc) : [appSrc];

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
// module ids a hand-written manifest.base.json already maps — the one legit
// way to satisfy an importNow("app/…") target the static scans can't resolve
const baseManifestModules = new Set<string>(
	Object.keys(
		(
			JSON.parse(
				readFileSync(
					existsSync("src/embeddedjs/manifest.base.json")
						? "src/embeddedjs/manifest.base.json"
						: join(PKG, "src/embeddedjs/manifest.base.json"),
					"utf8",
				),
			) as { modules?: Record<string, string> }
		).modules ?? {},
	),
);
let unresolvedDynamicImport = false;
for (const closureFile of appClosure.filter(existsSync)) {
	// comments off first — the scan must see CODE only (a mention of
	// importNow() in a doc comment is not a dynamic import). The WHOLE
	// closure is scanned: a helper's importNow()/import() was invisible
	// before (P1b) — its lazy target went unshipped with the guard silent.
	const src = readFileSync(closureFile, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/[^\n]*/g, "");
	for (const m of src.matchAll(/import(?:Now)?\s*\(\s*([^)]*)\)/g)) {
		// any string form — 'x', "x", or a no-substitution `x` template — is a
		// valid, statically resolvable specifier and must join the manifest,
		// else the lazy module dies on first navigation (build passes, device
		// fails).
		const lit = /^[`'"]app\/((?:screens\/)?[\w-]+)[`'"]\s*$/.exec(m[1]);
		const base = lit?.[1];
		if (base && existsSync(join("src/tsx/examples", APP, `${base}.tsx`))) lazySet.add(base);
		else if (base && existsSync(join("src/tsx/examples", APP, `${base}.ts`))) lazySet.add(base);
		// a COMPUTED name under the screens/ folder convention is still
		// resolvable: EVERY screens/* file ships (enumerated below), so the
		// dynamic import can only reach shipped-and-scanned modules
		else if (
			/^['"]app\/screens\/['"]\s*\+/.test(m[1]) &&
			existsSync(join("src/tsx/examples", APP, "screens"))
		) {
			/* covered by the folder convention */
		} else if (/^[`'"](?:pebble\/|embedded:)[\w/:-]+[`'"]\s*$/.test(m[1])) {
			/* HOST-preloaded module (pebble/message, embedded:storage/files, …):
			   the mod compartment's loadNowHook maps these through to the host
			   archive, so nothing in OUR manifest can be pruned out from under
			   them — they don't defeat the scans */
		} else if (!m[0].startsWith("importNow") && /^["'`]\.\.?\/[^"'`$]+["'`]\s*$/.test(m[1])) {
			/* literal RELATIVE dynamic import (`import("./art")`, backtick
			   included): esbuild inlines it into main.js (no splitting) and
			   relativeClosure follows the SAME grammar, so every scan
			   (treeshake seeds, gen-manifest assets, fontcheck, lint) sees the
			   module — it does not defeat pruning. `$` is excluded so a
			   SUBSTITUTION template (`import(\`./scr/${n}\`)`) falls through
			   to unresolved below — esbuild may glob-bundle it, but the scans
			   can't follow it, so treeshake must self-disable (codex P2).
			   importNow with a relative spec stays UNRESOLVED too (that is a
			   device module-map lookup, not a bundler inline). */
		} else if (/^["'`]app\//.test(m[1].trim())) {
			// an app/ target the branches above could NOT resolve: a computed
			// non-screens/ name (`importNow("app/" + n)`), a missing file, or a
			// nested path outside the conventions. importNow resolves through
			// the mod manifest at runtime and nothing here SHIPS the target —
			// merely disabling treeshake still dies on the first navigation
			// (build passes, device fails; codex P2). A hand-written
			// manifest.base.json that maps the id itself is the one legit
			// escape — honor it.
			const litId = /^[`'"](app\/[\w/-]+)[`'"]\s*$/.exec(m[1].trim())?.[1];
			if (!litId || !baseManifestModules.has(litId)) {
				err(`lazy: ${closureFile} calls import(Now)(${m[1].trim()}) — an app/ target the`);
				err("      build cannot resolve to a shipped module. Use a LITERAL specifier with a");
				err(`      matching src/tsx/examples/${APP}/<name>.tsx file, the screens/ folder`);
				err("      convention for computed names, or map the id in manifest.base.json.");
				err("      Failing loud (the navigation would die on device).");
				process.exit(1);
			}
		} else unresolvedDynamicImport = true;
	}
}
// Folder convention: every src/tsx/examples/<APP>/screens/*.tsx|ts ships as
// a lazy module `app/screens/<name>` — no per-screen importNow literal
// needed, and the imported name may be computed at runtime (see above).
const screensDir = join("src/tsx/examples", APP, "screens");
if (existsSync(screensDir))
	for (const f of readdirSync(screensDir))
		// `.d.ts` matches `.tsx?$` but emits no JS — a screens/types.d.ts would
		// register a lazy module with no compiled output and fail staging.
		if (/\.tsx?$/.test(f) && !f.endsWith(".d.ts"))
			lazySet.add(`screens/${f.replace(/\.tsx?$/, "")}`);
const lazyBases = [...lazySet];
let treeshake = flag(cli.treeshake, "TREESHAKE", "1", true);
if (treeshake && !flag(cli["treeshake-force"], "TREESHAKE_FORCE", "1", false)) {
	if (unresolvedDynamicImport) {
		err(`treeshake: SKIPPED — ${APP}.tsx uses a dynamic import() the static scan can't follow;`);
		err("           pruning could drop a runtime module reached at runtime. TREESHAKE_FORCE=1 to override.");
		treeshake = false;
	}
}
// lazy modules' own runtime imports count toward the treeshake keep-set.
// Each lazy root expands to its RELATIVE closure — the bundle inlines its
// ./helpers into the shipped lazy module, so a helper's runtime imports
// (keep-set) and Texture/pdc/romTable refs (gen-manifest) must be scanned
// too; scanning only the root shipped the helper's code without its asset
// (codex P2). Set-dedupe: closures may share files with the entry's.
const shakeSources = [
	...new Set([
		...appClosure,
		...lazyBases.flatMap((b) => {
			const tsx = join("src/tsx/examples", APP, `${b}.tsx`);
			const entry = existsSync(tsx) ? tsx : join("src/tsx/examples", APP, `${b}.ts`);
			return relativeClosure(entry, readSrc);
		}),
	]),
];

// Root-component entry (#63), DECIDED here — the file is generated after tsc.
// An app that `export default`s a COMPONENT and never calls render() gets a
// generated shim entry mounting it (README "root component entry"). Detection
// is deliberately NARROW: a function declaration, an arrow, or an identifier
// bound in-file to a function/arrow. Any other default (an Application
// instance, an object) is a BARE app and gets NO shim — shimming one handed
// render() a non-component AND, with no explicit runtime import for the
// scans to see, treeshake pruned runtime/jsx-runtime out from under the
// generated shim (fetchtest shipped boot-dead; audit receipt). The decision
// lives BEFORE the treeshake run so the shim's `runtime/jsx-runtime` import
// can seed the keep-set (--need below).
const rootShim = (() => {
	if (!existsSync(appSrc)) return false;
	const strip = (s: string): string =>
		s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
	const bare = strip(readFileSync(appSrc, "utf8"));
	// self-rendering = the RUNTIME render is IMPORTED and CALLED — named
	// (`render(`), aliased (`import { render as mount }` + `mount(`), or
	// namespaced (`R.render(`). Resolving the import matters in BOTH
	// directions: a raw `render(` text test missed the alias (double mount)
	// AND false-positived on unrelated code — a `view.render()` method or a
	// local helper named render suppressed the shim, shipping a component
	// app that never mounts (codex P2 x2). An app with NO runtime render
	// import cannot be calling the runtime render.
	//
	// Scan the whole entry CLOSURE, not just appSrc: an entry may `export
	// default App` (looks shim-able) yet delegate mounting to a relative
	// helper (`boot(App)` where `./boot` imports+calls render). The helper's
	// render runs when the shim imports the entry, then the shim calls
	// render() again → double mount. Per-file so an alias only matches a call
	// in its OWN module (codex P2).
	let selfRenders = false;
	for (const f of appClosure) {
		const t = strip(readSrc(f) ?? "");
		for (const im of t.matchAll(/import\s*{([^}]*)}\s*from\s*["']runtime\/jsx-runtime["']/g)) {
			const named = /\brender\b(?:\s+as\s+([A-Za-z_$][\w$]*))?/.exec(im[1]);
			if (named && new RegExp(`\\b${named[1] ?? "render"}\\s*\\(`).test(t)) selfRenders = true;
		}
		for (const im of t.matchAll(
			/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*["']runtime\/jsx-runtime["']/g,
		))
			if (new RegExp(`\\b${im[1]}\\s*\\.\\s*render\\s*\\(`).test(t)) selfRenders = true;
	}
	if (selfRenders) return false; // app mounts itself — a shim would mount TWICE
	const rhs = /^export default\s+(.+)$/m.exec(bare)?.[1].trim();
	if (!rhs) return false;
	const id = /^([A-Za-z_$][\w$]*)\s*;?$/.exec(rhs)?.[1];
	// an ASYNC default is NOT renderable: render() is synchronous, so the
	// shim would hand appendChild a Promise (boot death) — and silently
	// treating it as a bare app would just render nothing. Fail at BUILD.
	if (
		/^async\b/.test(rhs) ||
		(id &&
			new RegExp(
				`\\basync\\s+function\\s+${id}\\s*\\(|\\b(?:const|let|var)\\s+${id}\\b[^=\\n]*=\\s*async\\b`,
			).test(bare))
	) {
		err(`root-entry: ${APP}'s default export is ASYNC — render() is synchronous and the`);
		err("            shim would mount a Promise (boot death). Export a sync component,");
		err("            or call render() yourself after awaiting.");
		process.exit(1);
	}
	if (/^function\b/.test(rhs)) return true; // export default function App…
	if (/^\([^)]*\)[^=\n]*=>/.test(rhs) || /^[A-Za-z_$][\w$]*\s*=>/.test(rhs)) return true; // arrow
	if (!id) return false; // `new X(…)`, a literal, a call — not a component
	return new RegExp(
		`\\bfunction\\s+${id}\\s*\\(|\\b(?:const|let|var)\\s+${id}\\b[^=\\n]*=\\s*(?:\\([^)]*\\)[^=\\n]*=>|[A-Za-z_$][\\w$]*\\s*=>|function\\b)`,
	).test(bare);
})();

// Generate the mod manifest from the base; image/vector resources are DERIVED
// from the sources that actually SHIP — the entry, its bundled ./closure AND
// the lazy modules (a lazy screen's Texture/pdc/romTable refs must ship too;
// running this before the lazy scan silently dropped them — audit D8).
// manifest.json is gitignored.
const manifestBase = existsSync("src/embeddedjs/manifest.base.json")
	? "src/embeddedjs/manifest.base.json" // the project's own
	: join(PKG, "src/embeddedjs/manifest.base.json"); // package default
copyFileSync(manifestBase, "src/embeddedjs/manifest.json");
run(
	process.execPath,
	[join(TOOLS, `gen-manifest${EXT}`), appSrc, "src/embeddedjs/manifest.json"].concat(
		shakeSources.slice(1).filter(existsSync),
	),
);

// tsc's AUTOMATIC JSX transform injects `import { jsx } from
// "runtime/jsx-runtime"` into compiled .tsx AFTER this source-level scan — a
// shipped .tsx that never names the runtime in SOURCE (a JSX lazy screen
// under a hand-Piu entry, components arriving via params) would prune
// jsx-runtime and fail the unmapped-import tripwire on a valid build
// (codex P2). Seed it whenever a shipped .tsx looks JSX-bearing;
// over-keeping is the safe direction (a few boot aliases), under-keeping
// is a failed build.
const jsxTsx = shakeSources.some(
	(f) =>
		f.endsWith(".tsx") &&
		existsSync(f) &&
		/<[A-Za-z]/.test(
			readFileSync(f, "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/\/\/[^\n]*/g, ""),
		),
);
if (treeshake)
	run(process.execPath, [
		join(TOOLS, `treeshake${EXT}`),
		...shakeSources,
		// the generated shim imports render — its module must survive the prune
		// even though no scanned source mentions it (the file exists only post-tsc)
		...(rootShim || jsxTsx ? ["--need=runtime/jsx-runtime"] : []),
		"src/embeddedjs/manifest.json",
	]);

// Font sanity check (gotcha 20): an invalid font string renders NOTHING — blank
// text, no error, hours lost. Validate every `font:` literal against the Pebble
// system-font table at COMPILE time and fail loud. SKIP_FONTCHECK=1 to escape.
// Families backed by a TTF under the app's fonts/ dir are custom fonts (the
// gen-manifest deriveFonts convention) and pass.
if (!flag(cli["skip-fontcheck"], "SKIP_FONTCHECK", "1", false))
	run(process.execPath, [
		join(TOOLS, `fontcheck${EXT}`),
		join("src/tsx/examples", APP, "fonts"),
		...shakeSources.filter(existsSync),
	]);

// Reactive-read lint (the ".value footgun"): the app tsconfig is noCheck, so
// tsc never catches calling/stringifying a Signal object or stringifying a
// useState getter — all of which render garbage or crash ON DEVICE only
// (the watchface `greeting()` incident). Type-check exactly those shapes on
// the app entry + shipped sibling modules and fail loud. --no-lint-reads /
// LINT_READS=0 to bypass.
if (flag(cli["lint-reads"], "LINT_READS", "1", true))
	run(process.execPath, [join(TOOLS, `lint-reads${EXT}`), ...shakeSources.filter(existsSync)]);

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
		// bare side-effect imports (`import "./setup"`) count too — esbuild
		// would inline them into the preloaded module, moving their load-time
		// work into the build compartment despite v1's no-nested-import
		// contract (codex P2)
		if (/\b(?:from|import)\s*"\.\.?\//.test(sub)) {
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
		// retarget IMPORT SPECIFIERS only (`from "./x"` covers import AND
		// export-from in tsc's emit) — a bare replaceAll of the quoted literal
		// also rewrote same-text DATA strings in the entry (a "./data" label or
		// path became "app/data"; codex P2)
		entrySrc = entrySrc.replaceAll(`from "${spec}"`, `from "${id}"`);
		pureIds.push(id);
		pureFiles.push(file);
		// ALWAYS bundle (like the main and lazy paths — only the mangling
		// follows the minify flag): a promoted module's PACKAGE import stays a
		// bare specifier the watch manifest can never resolve, so a MINIFY=0
		// build used to pass locally and die when the preloaded module was
		// instantiated (codex P2). Bundling must succeed — fail loud.
		if (
			!tryEsbuild({
				entryPoints: [file],
				bundle: true,
				external: ["runtime/*", "app/*"],
				treeShaking: true,
				minify,
				format: "esm",
				outfile: file,
				allowOverwrite: true,
			})
		) {
			err(`preload-pure: bundling ${spec} FAILED (unresolved import?) — the unbundled`);
			err("      module keeps specifiers the manifest never maps (dead at preload).");
			process.exit(1);
		}
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
// Root-component entry shim (decided above, pre-treeshake): plain JS written
// NEXT to the compiled entry so every downstream pass (lower, prune keep-sets
// off the final main.js) sees a normal bundle; the source scans
// (closure/lint/manifest) still read the real .tsx.
let bundleEntry = `src/embeddedjs/app/examples/${APP}.js`;
if (rootShim) {
	bundleEntry = `src/embeddedjs/app/examples/${APP}__root.js`;
	writeFileSync(
		bundleEntry,
		`import * as M from "./${APP}";\nimport { render } from "runtime/jsx-runtime";\nrender(M.default, M.app, M.opts);\n`,
	);
	console.log(`root-entry: ${APP} exports a default component — generated render() shim`);
}
// treeShaking:true is explicit (DCE unreferenced app exports/branches during the
// bundle) even without minify, so BUNDLE stays lean when MINIFY=0. This one must
// succeed — buildSync throws on error, aborting the build (no verbatim fallback).
esbuild.buildSync({
	entryPoints: [bundleEntry],
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
	// SPLIT-BRAIN ownership (codex P2): a stateful helper only diverges when it
	// is bundled into TWO shipped modules. A helper PRIVATE to ONE lazy module
	// is a single copy — live reactive state there is LEGAL (docs), so it must
	// NOT fail the build. Precompute, per compiled helper .js, how many lazy
	// modules pull it in; the guard below fails only when that count is ≥2 OR
	// the helper is also in the entry's main.js bundle.
	const lazyHelpersOf = (rootJs: string): Set<string> => {
		const out = new Set<string>();
		const seen = new Set<string>([rootJs]);
		const queue = [rootJs];
		while (queue.length) {
			const cur = queue.pop() as string;
			const s = readFileSync(cur, "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/\/\/[^\n]*/g, "");
			// static + bare `from`/`import "./x"` AND literal relative DYNAMIC
			// imports (`import("./x")`) — relativeClosure follows the latter too,
			// so esbuild inlines the helper into the lazy artifact and a stateful
			// copy split-brains just the same (codex P2).
			for (const rm of [
				...s.matchAll(/\b(?:from|import)\s*["'](\.\.?\/[^"']+)["']/g),
				...s.matchAll(/\bimport\s*\(\s*["'`](\.\.?\/[^"'`$]+)["'`]\s*\)/g),
			]) {
				const spec = rm[1].replace(/\.js$/, "");
				const helper = [
					join(dirname(cur), `${spec}.js`),
					join(dirname(cur), spec, "index.js"),
				].find((p) => existsSync(p));
				if (!helper || seen.has(helper)) continue;
				seen.add(helper);
				out.add(helper);
				queue.push(helper);
			}
		}
		return out;
	};
	const helperOwners = new Map<string, number>();
	for (const b of lazyBases) {
		const rootJs = `src/embeddedjs/app/examples/${APP}/${b}.js`;
		if (existsSync(rootJs))
			for (const h of lazyHelpersOf(rootJs)) helperOwners.set(h, (helperOwners.get(h) ?? 0) + 1);
	}
	// a compiled helper .js maps back to its .tsx/.ts SOURCE — appClosure holds
	// source paths (what main.js bundles), the walk holds compiled paths
	const inEntryBundle = (js: string): boolean => {
		const rel = js.replace(/^src\/embeddedjs\/app\/examples\//, "").replace(/\.js$/, "");
		return (
			appClosure.includes(`src/tsx/examples/${rel}.tsx`) ||
			appClosure.includes(`src/tsx/examples/${rel}.ts`)
		);
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
		// the lazy ROOT itself may ALSO sit in the entry's static closure (a
		// value import of the same file the entry later importNow()s): esbuild
		// inlines one copy into main.js while this loop ships a second as a
		// module. The walk below only classifies HELPERS, so module-scope
		// state in the ROOT split-brained undetected (codex P2). Same policy:
		// pure duplication warns, state fails loud.
		const rootSrc = [
			join("src/tsx/examples", APP, `${base}.tsx`),
			join("src/tsx/examples", APP, `${base}.ts`),
		].find((p) => appClosure.includes(p));
		if (rootSrc) {
			const verdict = classify(readFileSync(file, "utf8"));
			if (!verdict.pure) {
				err(`lazy: app/${base} is ALSO statically imported by the entry (bundled into`);
				err("      main.js) AND ships as a lazy module — and it has MODULE-SCOPE STATE");
				err(`      (${verdict.reasons[0] ?? "runs code at load"}): the two copies' state`);
				err("      silently diverges (split-brain). Import it lazily ONLY, or move the");
				err("      shared state into the entry / a preloaded module. Failing loud.");
				process.exit(1);
			}
			err(
				`lazy: WARNING app/${base} is also statically imported by the entry — its code ` +
					"ships twice (pure — harmless, costs flash)",
			);
		}
		// split-brain guard (review P6 -> classify-gated -> TRANSITIVE per
		// codex): the bundle inlines the lazy module's WHOLE ./-closure as a
		// second copy — a stateful helper anywhere in it (./view -> ./state
		// holding a module-scope signal) split-brains: the lazy copy's state
		// is disconnected from main's, updates silently diverge. Walk the
		// compiled closure and classify every helper; PURE duplication is
		// harmless (wasted flash — one summary warning), STATE fails LOUD.
		{
			const dup: string[] = [];
			const seenHelpers = new Set<string>();
			const queue = [file];
			while (queue.length) {
				const cur = queue.pop() as string;
				// comments off — a doc-comment `from "./x"` / importNow() mention
				// must not be followed or flagged (same strip as the source scans)
				const curSrc = readFileSync(cur, "utf8")
					.replace(/\/\*[\s\S]*?\*\//g, "")
					.replace(/\/\/[^\n]*/g, "");
				// NESTED lazy imports: discovery only walks the ENTRY closure, so
				// an importNow("app/x") issued from inside a lazy module names a
				// module the manifest never shipped — dead on the first
				// navigation (build passes, device fails). Fail LOUD at build.
				// Scans the WHOLE call (not just a literal-prefix): a COMPUTED
				// app/ target (`importNow("app/" + n)`) is equally unresolvable
				// and must fail too, mirroring the entry-side guard (codex P2).
				for (const im of curSrc.matchAll(/import(?:Now)?\s*\(\s*([^)]*)\)/g)) {
					const arg = im[1].trim();
					const lit = /^[`'"]app\/((?:screens\/)?[\w-]+)[`'"]$/.exec(arg)?.[1];
					if (lit !== undefined) {
						if (!lazySet.has(lit) && !manifest.modules[`app/${lit}`]) {
							err(`lazy: app/${base} calls importNow("app/${lit}"), but lazy-target discovery`);
							err("      only scans the ENTRY's closure (#27 v1) — the nested target never ships");
							err(`      and dies on first navigation. Add a literal importNow("app/${lit}")`);
							err("      in the entry (or move the screen under screens/) so it ships. Failing loud.");
							process.exit(1);
						}
					} else if (/^[`'"]app\/screens\/[`'"]\s*\+/.test(arg) && existsSync(screensDir)) {
						/* COMPUTED app/screens/ target (`importNow("app/screens/" + n)`):
						   the folder convention ships EVERY screens/* file (all already
						   in lazySet), so a computed screens name resolves to a shipped
						   module. Allowed, mirroring the entry-side scan (codex P2) —
						   the fail branch below even points users here. */
					} else if (/^[`'"]app\//.test(arg)) {
						// COMPUTED non-screens app/ target — unresolvable, ships no
						// module, dies on the first nested navigation (build passes,
						// device fails).
						err(`lazy: app/${base} issues a COMPUTED importNow(${arg}) for an app/ target the`);
						err("      build cannot resolve — no module ships and the nested navigation dies on");
						err('      device. Use a LITERAL importNow("app/<name>") or the screens/ convention.');
						process.exit(1);
					}
				}
				// bare side-effect imports (`import "./state"`) AND literal
				// relative DYNAMIC imports (`import("./state")`) bundle exactly
				// like `from` imports — relativeClosure follows both, so esbuild
				// inlines the helper and a stateful copy shared with another
				// bundle split-brains just the same (codex P2)
				for (const rm of [
					...curSrc.matchAll(/\b(?:from|import)\s*["'](\.\.?\/[^"']+)["']/g),
					...curSrc.matchAll(/\bimport\s*\(\s*["'`](\.\.?\/[^"'`$]+)["'`]\s*\)/g),
				]) {
					const spec = rm[1].replace(/\.js$/, "");
					const helper = [join(dirname(cur), `${spec}.js`), join(dirname(cur), spec, "index.js")].find(
						(p) => existsSync(p),
					);
					if (!helper) {
						err(
							`lazy: WARNING app/${base} has an unresolved relative import ${rm[1]} — ` +
								"cannot check it for split-brain state",
						);
						continue;
					}
					if (seenHelpers.has(helper)) continue;
					seenHelpers.add(helper);
					queue.push(helper);
					const verdict = classify(readFileSync(helper, "utf8"));
					if (!verdict.pure) {
						// only a SHARED copy split-brains: the helper is ALSO in the
						// entry's main.js bundle, or ≥2 lazy modules each bundle their
						// own copy. A helper PRIVATE to this one lazy module is a single
						// copy — its live reactive state is legal (docs; codex P2).
						if (inEntryBundle(helper) || (helperOwners.get(helper) ?? 0) >= 2) {
							err(`lazy: app/${base} shares ${rm[1]} with another shipped bundle, and it has`);
							err(`      MODULE-SCOPE STATE (${verdict.reasons[0] ?? "runs code at load"}) — the`);
							err("      copies' state is DISCONNECTED (split-brain). Keep shared state in the");
							err("      entry, a preloaded module, or runtime/*. Failing loud.");
							process.exit(1);
						}
						// private single copy — no divergence; nothing to warn about
						continue;
					}
					dup.push(rm[1]);
				}
			}
			if (dup.length)
				err(
					`lazy: WARNING app/${base} duplicates ${dup.join(", ")} into this module ` +
						"(pure helpers — harmless, costs flash)",
				);
		}
		manifest.modules[id] = `./app/${rel}`;
		// SQUASH pass (default ON): array-of-arrows -> ONE dispatch fn — the
		// device-proven lazymany->lazypack fix, applied mechanically. Narrow
		// and bail-safe; whatever it can't prove stays for the advisory below.
		if (flag(cli.squash, "SQUASH", "1", true))
			run(process.execPath, [join(TOOLS, `squash${EXT}`), file]);
		// ALWAYS bundle (MINIFY=0 used to ship the module UNBUNDLED — its
		// `./x` relative specifiers have no manifest mapping on device, dead
		// on first importNow); only the mangling follows the flag. Bundling
		// must SUCCEED: a swallowed esbuild error (unresolved import) would
		// ship the unbundled file with the same dead specifiers (codex P2) —
		// fail loud like the main bundle path does.
		if (
			!tryEsbuild({
				entryPoints: [file],
				bundle: true,
				external: ["runtime/*", "app/*"],
				treeShaking: true,
				minify,
				format: "esm",
				outfile: file,
				allowOverwrite: true,
			})
		) {
			err(`lazy: bundling app/${base} FAILED (unresolved import?) — the unbundled file`);
			err("      keeps ./relative specifiers the manifest never maps (dead at importNow).");
			process.exit(1);
		}
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
	// both quote styles: TS preserves the source quote in --no-minify builds, so
	// a lazy/pure module's `import { X } from 'runtime/flow'` must be seen here
	// or prune-exports could demote X while the shipped module still imports it.
	for (const m of src.matchAll(
		// `export { For } from "runtime/flow"` in a shipped module is a
		// link-time demand on that export exactly like an import — missing it
		// let prune-exports demote a re-exported name out from under the
		// module (codex P2). `export * from` (like `import * as`) keeps all.
		/(?:import|export)\s*(\*\s*as\s+\w+|\*|{[^}]*})\s*from\s*['"]runtime\/([\w-]+)['"]/g,
	)) {
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
// P3 (review): LOWER orphans the original `useState`/`computed` import
// specifiers (rewritten to packed S.*), and esbuild keeps dead EXTERNAL
// specifiers in minified lazy/pure files — the keep-set scan then counted
// them as demand and shipped dead runtime exports (+9 symbols/+540B class,
// on-disk receipt in docs/review-findings.md). Drop dead runtime imports
// from every scanned app artifact BEFORE the first keep-set read.
if (prune)
	for (const f of ["src/embeddedjs/app/main.js", ...lazyFiles, ...pureFiles])
		run(process.execPath, [join(TOOLS, `import-prune-min${EXT}`), f]);
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
// loud (CHECK_C=0 to override). Fix with `pnpm run format:c`.
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
			err("build: native C is misformatted — run 'pnpm run format:c' (CHECK_C=0 to skip)");
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

// FAIL-LOUD tripwire (the fetchtest class): every runtime/* module a SHIPPED
// artifact still imports must be mapped in the manifest — an unmapped import
// is a guaranteed mod-load death on device while the build exits 0. Catches
// any scan blind spot (a tsc-injected JSX import, a new generated file) at
// build time instead of on the watch.
{
	const mapped =
		(
			JSON.parse(readFileSync("src/embeddedjs/manifest.json", "utf8")) as {
				modules?: Record<string, string>;
			}
		).modules ?? {};
	const missing = new Set<string>();
	for (const f of ["src/embeddedjs/app/main.js", ...lazyFiles, ...pureFiles])
		if (existsSync(f))
			for (const m of readFileSync(f, "utf8").matchAll(
				/\bfrom\s*["'](runtime\/[\w-]+)["']|\bimport\s*["'](runtime\/[\w-]+)["']/g,
			)) {
				const mod = m[1] ?? m[2];
				if (mapped[mod] === undefined) missing.add(mod);
			}
	if (missing.size) {
		err(`build: shipped code imports unmapped module(s): ${[...missing].join(", ")} — the`);
		err("       manifest does not carry them (mod-load death on device). A scan missed this");
		err("       import; TREESHAKE=0 ships the full runtime as a workaround. Failing loud.");
		process.exit(1);
	}
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
