// Run the pure-signal conformance laws on the REAL XS engine (xst) — the
// high-fidelity gate behind the fast node:test suite (see tests/xs/laws.js for
// why only the pure subset runs here). Locates the engine binary, runs the laws
// module, and forwards its exit code.
//
// Binary resolution order:
//   1. $XS_BIN                      — explicit override
//   2. ~/.jsvu/engines/xs/xs        — jsvu install (the documented path)
//   3. `xst` / `xs` on PATH         — source build or manual install
//
// Install (see docs/xst-setup.md):  npx jsvu --engines=xs --os=<platform>
// where <platform> is mac64arm/mac64 on macOS and linux64 on Linux.
//
// Usage: pnpm run test:xs   (builds the runtime first, then runs this)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function findXs(): string | null {
	const explicit = process.env.XS_BIN;
	if (explicit && existsSync(explicit)) return explicit;
	const jsvu = join(homedir(), ".jsvu", "engines", "xs", "xs");
	if (existsSync(jsvu)) return jsvu;
	for (const name of ["xst", "xs"]) {
		try {
			execFileSync(name, ["-v"], { stdio: "ignore" });
			return name;
		} catch {
			/* not on PATH — try the next candidate */
		}
	}
	return null;
}

const xs = findXs();
if (!xs) {
	// Explicit invocation of the XS gate with no engine present is an error, not
	// a silent skip (rule 12) — the caller asked for XS fidelity and isn't
	// getting it.
	const os =
		process.platform === "darwin" ? (process.arch === "arm64" ? "mac64arm" : "mac64") : "linux64";
	console.error("test:xs: no XS engine found. Install it (one-liner):");
	console.error(`  npx jsvu --engines=xs --os=${os}`);
	console.error("then re-run, or point XS_BIN at an xst binary. See docs/xst-setup.md.");
	process.exit(1);
}

const laws = fileURLToPath(new URL("../tests/xs/laws.js", import.meta.url));
console.log(`test:xs: ${execFileSync(xs, ["-v"], { encoding: "utf8" }).trim()} (${xs})`);
try {
	// -m: run as an ES module (laws.js imports the built runtime relatively)
	execFileSync(xs, ["-m", laws], { stdio: "inherit" });
} catch {
	process.exit(1); // xst printed the failure; just propagate nonzero
}
