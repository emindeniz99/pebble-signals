// Locate the pebble-signals package root from a script's own directory by walking
// up to the nearest package.json. Needed because the same scripts run from TWO
// layouts: the repo (tools/x.mts, one level below the root) and the packed
// tarball's compiled dist (dist/tools/x.mjs, two levels below) — a hard-coded
// "../.." would be wrong in one of them. Node refuses to type-strip .mts under
// node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), which is why the
// tarball ships compiled .mjs in dist/ at all — see docs/packaging.md.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function packageRoot(fromDir: string): string {
	let dir = fromDir;
	for (;;) {
		if (existsSync(join(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) throw new Error(`packageRoot: no package.json above ${fromDir}`);
		dir = parent;
	}
}
