// Flags-off smoke — the owner asked "do we test that the OFF path works?"
// Every heavy transform (LOWER/PRUNE/SQUASH/SYMDIET/MINIFY) is a build flag
// that defaults ON; each is meant to be individually reversible for debugging
// (bisect a transform bug with one flag off). This smoke rebuilds a small app
// with EACH flag off in turn and asserts the build succeeds and produces a
// non-empty mod archive — so a regression in an un-optimized code path can't
// hide behind the default-on builds.
//
// NOTE (measured, docs/field-notes.md §4): each flag off INDIVIDUALLY still
// fits the 32KB arena, but ALL off at once can exhaust it (`fxAbort memory
// full`). So this smoke tests each flag off on its own, NOT all-off — the
// latter is a legitimate over-budget build, not a bug.
//
// Requires the Pebble SDK (invokes build.mts → `pebble build`), so it is a
// device-adjacent smoke, not part of the SDK-free `pnpm run verify`. Run:
//   pnpm run smoke:flags-off
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = "counter"; // small, shipped, deterministic
const XSA = "build/mods/gabbro/mc.xsa";
const FLAGS = ["--no-lower", "--no-prune", "--no-squash", "--no-symdiet", "--no-minify"];

const build = (extra: string[]): { ok: boolean; size: number } => {
	try {
		execFileSync(
			process.execPath,
			[join(import.meta.dirname, "..", "build.mts"), "--app", APP, ...extra],
			{
				stdio: "ignore",
			},
		);
	} catch {
		return { ok: false, size: 0 };
	}
	const size = existsSync(XSA) ? statSync(XSA).size : 0;
	return { ok: size > 0, size };
};

let failed = 0;
// baseline: default flags must build
for (const flag of ["(default)", ...FLAGS]) {
	const extra = flag === "(default)" ? [] : [flag];
	const { ok, size } = build(extra);
	console.log(`flags-off-smoke: ${flag.padEnd(14)} -> ${ok ? `OK (${size}B)` : "BUILD FAILED"}`);
	if (!ok) failed++;
}

if (failed) {
	console.error(`flags-off-smoke: ${failed} build(s) FAILED`);
	process.exit(1);
}
console.log("flags-off-smoke: all per-flag-off builds produced a valid mod archive");
