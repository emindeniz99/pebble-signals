// Consumer smoke test (C11 packaging gate, docs/packaging.md) — proves
// signal-piu works as an INSTALLED library, not just via in-repo imports.
// Every step fails LOUD (nonzero exit, clear message) instead of limping on:
//   a. `npm pack` the real tarball (whatever `files`/`exports` ship today)
//   b. `npm install --no-save` it into examples/consumer, like an external
//      consumer would
//   c. typecheck examples/consumer/src/app.tsx against the installed package
//   d. run the PACKAGED lowering tool (signal-piu/tools/lower/cli.mts) from
//      node_modules against a throwaway useState snippet and assert it
//      rewrote the packed-signal calls
//
// Usage: npm run test:consumer   (from the signal-piu repo root)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXAMPLE = join(ROOT, "examples", "consumer");

function fail(step: string, detail: unknown): never {
	console.error(`test:consumer: FAILED at "${step}"`);
	console.error(detail instanceof Error ? detail.message : String(detail));
	process.exit(1);
}

// ---- a. npm pack the real tarball ------------------------------------------
console.log("test:consumer: npm pack...");
const packDir = mkdtempSync(join(tmpdir(), "signal-piu-pack-"));
let tarball: string;
try {
	const out = execFileSync("npm", ["pack", "--pack-destination", packDir], {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "inherit"],
	});
	const lines = out.trim().split("\n");
	tarball = lines[lines.length - 1]?.trim() ?? "";
	if (!tarball.endsWith(".tgz")) throw new Error(`unexpected npm pack output:\n${out}`);
} catch (e) {
	fail("npm pack", e);
}
const tarballPath = join(packDir, tarball);
if (!existsSync(tarballPath)) fail("npm pack", `tarball not found at ${tarballPath}`);

// ---- b. npm install --no-save the tarball into the example -----------------
console.log(`test:consumer: npm install ${tarball} into examples/consumer...`);
try {
	execFileSync("npm", ["install", "--no-save", tarballPath], {
		cwd: EXAMPLE,
		stdio: "inherit",
	});
} catch (e) {
	fail("npm install (example consumer)", e);
}

// ---- c. typecheck the example against the installed package ----------------
console.log("test:consumer: typecheck examples/consumer...");
try {
	const tsc = join(ROOT, "node_modules", ".bin", "tsc");
	execFileSync(tsc, ["-p", join(EXAMPLE, "tsconfig.json")], { stdio: "inherit" });
} catch (e) {
	fail("typecheck example", e);
}

// ---- d. prove the PACKAGED lowering tool runs from node_modules ------------
// Node refuses its own type-stripping for ANY file whose path contains
// `node_modules` (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — a deliberate
// safety default, not something this repo can opt out of globally: it applies
// to every dependency, not just this one). Running `node .../cli.mts` straight
// would hit that wall on the very first line. The fix is a tiny loader hook —
// registered only for this one subprocess — that strips `.mts` files under
// node_modules using the SAME public primitive Node's own default loader uses
// (`node:module`'s `stripTypeScriptTypes`), so the packaged tool still runs as
// real, unmodified TypeScript from node_modules; we're just supplying the
// opt-in Node withholds by default.
console.log("test:consumer: packaged lowering tool (from node_modules)...");
const scratchDir = mkdtempSync(join(tmpdir(), "signal-piu-lower-"));
const scratchFile = join(scratchDir, "lower-smoke.js");
try {
	writeFileSync(
		scratchFile,
		'import { useState } from "runtime/signals";\nconst [c, setC] = useState(0);\nsetC(c() + 1);\n',
	);
	const cli = join(EXAMPLE, "node_modules", "signal-piu", "tools", "lower", "cli.mts");
	const hooksSrc = `
		import { readFileSync } from "node:fs";
		import { fileURLToPath } from "node:url";
		import { stripTypeScriptTypes } from "node:module";
		export async function load(url, context, nextLoad) {
			if (url.endsWith(".mts") && url.includes("/node_modules/")) {
				const source = readFileSync(fileURLToPath(url), "utf8");
				return {
					format: "module",
					source: stripTypeScriptTypes(source, { mode: "strip", sourceUrl: url }),
					shortCircuit: true,
				};
			}
			return nextLoad(url, context);
		}
	`;
	const hooksUrl = `data:text/javascript,${encodeURIComponent(hooksSrc)}`;
	const preloadSrc = `
		import { register } from "node:module";
		register(${JSON.stringify(hooksUrl)}, import.meta.url);
	`;
	const preloadUrl = `data:text/javascript,${encodeURIComponent(preloadSrc)}`;
	execFileSync("node", ["--import", preloadUrl, cli, scratchFile], { stdio: "inherit" });
	const lowered = readFileSync(scratchFile, "utf8");
	if (!lowered.includes("__sp.get(c)") || !lowered.includes("__sp.set(c,"))
		throw new Error(
			`packaged lower did not rewrite the packed-signal calls as expected:\n${lowered}`,
		);
} catch (e) {
	fail("packaged lowering tool", e);
} finally {
	rmSync(scratchDir, { recursive: true, force: true });
}

rmSync(packDir, { recursive: true, force: true });

// ---- e. success --------------------------------------------------------------
console.log(
	"test:consumer: OK — packed tarball installs, typechecks, and its lowering tool runs from node_modules",
);
