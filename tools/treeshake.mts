// Per-app runtime tree-shaking: prune the manifest to the transitive closure of
// the runtime modules the app actually imports, so an app that never imports
// runtime/flow doesn't preload OR map it (every preloaded module costs a few XS
// aliases at boot). Ported from build.sh's Python heredoc to a testable module.
//
// Usage (CLI): node tools/treeshake.mts <appSrc> <manifestPath>
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
		if (need.has(mod) || !(mod in DEPS)) continue;
		need.add(mod);
		stack.push(...DEPS[mod]);
	}
	return need;
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
	const [appSrc, manifestPath] = process.argv.slice(2);
	const src = readFileSync(appSrc, "utf8");
	const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	const { manifest, kept, dropped } = pruneManifest(m, neededModules(src));
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	console.log(
		`treeshake: kept ${kept.join(",")}${dropped.length ? `; dropped ${dropped.join(",")}` : "; nothing to drop"}`,
	);
}
