// Per-app runtime tree-shaking: prune the manifest to the transitive closure of
// the runtime modules the app actually imports, so an app that never imports
// runtime/flow doesn't preload OR map it (every preloaded module costs a few XS
// aliases at boot). Ported from build.mts's Python heredoc to a testable module.
//
// Usage (CLI): node tools/treeshake.mts <appSrc> [moreSrc...] <manifestPath>
// (extra sources: lazy `importNow("app/*")` modules — their runtime imports
// must survive the prune even though the entry never imports them statically)
import { readFileSync, writeFileSync } from "node:fs";

interface Manifest {
	modules?: Record<string, string>;
	preload?: string[];
	[k: string]: unknown;
}

// intra-runtime import graph (which runtime module imports which)
const DEPS: Record<string, string[]> = {
	"runtime/signals": [],
	"runtime/jsx-runtime": ["runtime/signals"],
	"runtime/flow": ["runtime/signals", "runtime/jsx-runtime"],
};

/**
 * The set of runtime modules reachable from the app's static imports. Pure.
 * `extraSeeds` = modules needed by GENERATED code the sources can't show
 * (the root-component render() shim imports runtime/jsx-runtime, but the
 * shim file only exists after tsc — pruning it away shipped a mod whose
 * import had no manifest mapping: boot death).
 */
export function neededModules(src: string, extraSeeds: string[] = []): Set<string> {
	// comments off (a commented example must not seed), and TYPE-ONLY clauses
	// (`import type …` / `export type …`) skipped: they erase at emit, so
	// seeding them preloads dead modules straight against the boot floor
	// (codex P2 — one `import type { ForProps } from "runtime/flow"` kept the
	// whole flow/jsx/signals stack). An inline mix (`{ type X, y }`) still
	// seeds — `y` is a value import. A form this scan misses fails LOUD at
	// build time via the unmapped-import tripwire, not on device.
	const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
	const seed: string[] = [];
	for (const m of code.matchAll(
		/\b(?:import|export)\s+([^;]*?)from\s+["'](runtime\/[a-zA-Z0-9_-]+)["']/g,
	))
		if (!/^type\b/.test(m[1].trim())) seed.push(m[2]);
	// bare side-effect imports (`import "runtime/flow";`) carry no `from`
	// clause but survive emit and bundling all the same — missing them pruned
	// the module and turned a valid build into a tripwire failure (codex P2).
	for (const m of code.matchAll(/\bimport\s+["'](runtime\/[a-zA-Z0-9_-]+)["']/g)) seed.push(m[1]);
	const need = new Set<string>();
	const stack = [...seed, ...extraSeeds];
	while (stack.length) {
		const mod = stack.pop() as string;
		if (need.has(mod)) continue;
		// FAIL-SAFE for a runtime module the DEPS map doesn't know: KEEP it
		// (it just can't contribute edges). The old `continue` silently
		// PRUNED it from the manifest — a boot death if a 4th runtime module
		// ever ships without updating DEPS (review finding P9).
		need.add(mod);
		if (mod in DEPS) stack.push(...DEPS[mod]);
	}
	return need;
}

// The transitive RELATIVE-import closure of an app entry (entry first). The
// bundle step inlines the entry's whole ./-import graph into main.js, so
// every scan that reads "what does the app use" (treeshake seeds, the
// dynamic-import safety scan, gen-manifest resources, lint-reads) must see
// the SAME set — scanning only the entry silently missed a helper's
// `import "runtime/flow"` (pruned -> boot death) or its Texture refs
// (review findings P1/P2). Comments are stripped before matching.
/** Transitive relative-import closure of `entry` (existing files only). Pure-ish (fs reads). */
export function relativeClosure(entry: string, read: (p: string) => string | null): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	// collapse `./` and `x/../` so paths dedupe and read() sees canonical keys
	const clean = (p: string): string => {
		let n = p.replace(/\\/g, "/").replace(/\/\.\//g, "/");
		while (/[^/.]+\/\.\.\//.test(n)) n = n.replace(/[^/.]+\/\.\.\//, "");
		return n;
	};
	const visit = (file: string): void => {
		const norm = clean(file);
		if (seen.has(norm)) return;
		seen.add(norm);
		const raw = read(norm);
		if (raw === null) return;
		out.push(norm);
		const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
		const dir = norm.slice(0, norm.lastIndexOf("/") + 1);
		const follow = (rel: string): void => {
			const spec = clean(dir + rel);
			// resolve like the bundler: exact, then +.tsx/.ts, then a directory
			// index (`./setup` -> `setup/index.tsx`) — esbuild resolves all of
			// these, so the closure scan must too. ESM-style `./art.js`
			// specifiers resolve to their TS twins exactly as tsc/esbuild do
			// (the emitted art.js ships in the bundle while the literal file
			// never exists pre-build; codex P2).
			const cands = [spec, `${spec}.tsx`, `${spec}.ts`, `${spec}/index.tsx`, `${spec}/index.ts`];
			if (/\.jsx?$/.test(spec))
				cands.push(spec.replace(/\.jsx?$/, ".tsx"), spec.replace(/\.jsx?$/, ".ts"));
			for (const cand of cands)
				if (read(cand) !== null) {
					visit(cand);
					break;
				}
		};
		// `from "./x"` covers static imports AND `export … from "./x"`
		// re-exports — but TYPE-ONLY clauses are erased at emit and never
		// bundle: following them fed phantom literals (a types-only helper's
		// `font:` shape failed fontcheck, its Texture strings shipped
		// resources) into every scan for code that never ships (codex P2).
		for (const m of src.matchAll(/\b(?:import|export)\s+([^;]*?)from\s+["'](\.\.?\/[^"']+)["']/g))
			if (!/^type\b/.test(m[1].trim())) follow(m[2]);
		// bare side-effect imports carry NO `from` clause (`import "./setup"`) —
		// esbuild still bundles them, so their runtime imports / assets / reads
		// must join the closure too. `\bimport\s+["']` won't match `importNow(`.
		for (const m of src.matchAll(/\bimport\s+["'](\.\.?\/[^"']+)["']/g)) follow(m[1]);
		// literal relative DYNAMIC imports (`import("./art")`, backtick form
		// included): esbuild inlines them into the bundle when splitting is
		// off, so the module's assets (Texture/pdc/romTable) and runtime
		// imports ship — the closure must see them or the manifest misses the
		// assets (codex P2). `$` is excluded so a substitution template
		// (`import(\`./scr/${n}\`)`) is never mistaken for a literal — those
		// stay a treeshake self-disable in the build's guard.
		for (const m of src.matchAll(/\bimport\s*\(\s*["'`](\.\.?\/[^"'`$]+)["'`]\s*\)/g)) follow(m[1]);
	};
	visit(entry);
	return out;
}

/** Prune the manifest to `main` + the needed runtime modules. Pure. */
export function pruneManifest(
	manifest: Manifest,
	need: Set<string>,
): { manifest: Manifest; kept: string[]; dropped: string[] } {
	const keep = new Set<string>(["main", ...need]);
	const before = Object.keys(manifest.modules ?? {});
	const modules: Record<string, string> = {};
	for (const [k, v] of Object.entries(manifest.modules ?? {})) if (keep.has(k)) modules[k] = v;
	const preload = (manifest.preload ?? []).filter((x) => need.has(x));
	const dropped = before.filter((k) => !keep.has(k)).sort();
	return { manifest: { ...manifest, modules, preload }, kept: [...need].sort(), dropped };
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const manifestPath = args.pop() as string;
	// --need=runtime/<mod>: seed a module on behalf of generated code (the
	// root shim) — see neededModules. Everything else is a source path.
	const seeds = args.filter((a) => a.startsWith("--need=")).map((a) => a.slice("--need=".length));
	const files = args.filter((a) => !a.startsWith("--need="));
	const src = files.map((p) => readFileSync(p, "utf8")).join("\n");
	const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	const { manifest, kept, dropped } = pruneManifest(m, neededModules(src, seeds));
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	console.log(
		`treeshake: kept ${kept.join(",")}${dropped.length ? `; dropped ${dropped.join(",")}` : "; nothing to drop"}`,
	);
}
