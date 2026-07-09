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

/** The set of runtime modules reachable from the app's static imports. Pure. */
export function neededModules(src: string): Set<string> {
	const seed = [...src.matchAll(/from\s+["'](runtime\/[a-zA-Z0-9_-]+)["']/g)].map((x) => x[1]);
	const need = new Set<string>();
	const stack = [...seed];
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
		for (const m of src.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
			const spec = clean(dir + m[1]);
			// resolve like the bundler: exact, then +.tsx, then +.ts
			for (const cand of [spec, `${spec}.tsx`, `${spec}.ts`])
				if (read(cand) !== null) {
					visit(cand);
					break;
				}
		}
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
	const src = args.map((p) => readFileSync(p, "utf8")).join("\n");
	const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	const { manifest, kept, dropped } = pruneManifest(m, neededModules(src));
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	console.log(
		`treeshake: kept ${kept.join(",")}${dropped.length ? `; dropped ${dropped.join(",")}` : "; nothing to drop"}`,
	);
}
