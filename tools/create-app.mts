#!/usr/bin/env node
// create-pebble-signals: scaffold a ready-to-build consumer watch app from
// templates/app/ in one command (docs/packaging.md, "create-pebble-signals
// scaffold CLI") — replaces "copy examples/consumer by hand".
//
// Usage: node tools/create-app.mts <dir> [--name <appName>]
//   <dir>            target directory (created if missing; must be empty)
//   --name <appName> app name + pebble.displayName (default: basename(<dir>))
//
// Runs from TWO layouts, like build.mts: the repo (tools/create-app.mts,
// templates/ beside its parent) and the packed tarball's compiled dist
// (dist/tools/create-app.mjs, templates/ beside dist/'s parent) — so the
// package root is found by walking UP (packageRoot), never a hard-coded
// "../..". Node refuses to type-strip .mts under node_modules, which is why
// this ships compiled as dist/tools/create-app.mjs (see docs/packaging.md).
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { packageRoot } from "./pkg-root.mts";

const err = (msg: string): void => {
	process.stderr.write(`${msg}\n`);
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG = packageRoot(SCRIPT_DIR);
const TEMPLATE_DIR = join(PKG, "templates", "app");
// The RUNNING package's version, stamped into the scaffold's pebble-signals
// dependency. A hardcoded template pin rotted once already: the shipped 0.1.0
// scaffold said "^1.0.0" (the internal-milestone number), so every fresh
// scaffold's npm install died with "no matching version" — caught dogfooding
// the first store face. Stamping from package.json cannot drift.
const PKG_VERSION: string = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version;

const { values: cli, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: { name: { type: "string" }, help: { type: "boolean" } },
	allowPositionals: true,
});

if (cli.help) {
	process.stdout.write("usage: create-pebble-signals <dir> [--name <appName>]\n");
	process.exit(0);
}

const targetArg = positionals[0];
if (!targetArg) {
	err("usage: create-pebble-signals <dir> [--name <appName>]");
	process.exit(1);
}
const targetDir = resolve(process.cwd(), targetArg);

// Refuse a non-empty target — this scaffolds a whole project; silently
// merging into existing files would be surprising and hard to undo.
if (existsSync(targetDir)) {
	if (!statSync(targetDir).isDirectory()) {
		err(`create-pebble-signals: ${targetDir} exists and is not a directory`);
		process.exit(1);
	}
	if (readdirSync(targetDir).length > 0) {
		err(`create-pebble-signals: refusing to scaffold into non-empty directory: ${targetDir}`);
		process.exit(1);
	}
}

// The DISPLAY name is what the user asked for (or the directory basename); the
// npm PACKAGE name has to be a legal npm name on top of that. Substituting one
// raw string into every placeholder broke the scaffold two ways: a normal
// target like `My Watch` produced an invalid `"name"` that npm install rejects,
// and a name carrying a quote or newline made package.json unparseable — so the
// advertised next step failed on a freshly scaffolded project (codex P1).
const displayName = cli.name ?? basename(targetDir);
// npm's rule set, reduced to what matters here: lowercase, no spaces, only
// URL-safe punctuation, no leading dot/underscore, <= 214 chars. Anything else
// is normalized rather than rejected — the user asked for a scaffold, not a
// lecture — and the result is echoed below so the rename is never a surprise.
const packageName = displayName
	.toLowerCase()
	.replace(/[^a-z0-9._-]+/g, "-")
	.replace(/^[._-]+/, "")
	.replace(/-+$/, "")
	.slice(0, 214);
if (!packageName) {
	err(`create-pebble-signals: --name "${displayName}" has no characters npm allows in a package`);
	err('            name. Pass a --name with letters or digits (e.g. --name "my-watch").');
	process.exit(1);
}
// The display name still lands inside a JSON string literal, so it must be
// escaped — JSON.stringify quotes it, and the placeholder sits between quotes
// in the template, so drop the outer pair.
const displayJson = JSON.stringify(displayName).slice(1, -1);
const uuid = randomUUID();

// Filenames the packed template renames on the way out: npm pack renames a
// literal ".gitignore" in the tarball's source tree, so it ships dotless as
// "gitignore"; the ".tmpl" files hold placeholders and take their real name
// only once substituted.
const RENAME: Record<string, string> = {
	"package.json.tmpl": "package.json",
	"README.md.tmpl": "README.md",
	gitignore: ".gitignore",
};

function copyTemplate(srcDir: string, destDir: string): void {
	mkdirSync(destDir, { recursive: true });
	for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
		const srcPath = join(srcDir, entry.name);
		const destPath = join(destDir, RENAME[entry.name] ?? entry.name);
		if (entry.isDirectory()) {
			copyTemplate(srcPath, destPath);
			continue;
		}
		// JSON files get the ESCAPED display name (it lands inside a string
		// literal); everything else — the README heading — gets it verbatim.
		const content = readFileSync(srcPath, "utf8")
			.replaceAll("__PKG_NAME__", packageName)
			.replaceAll("__APP_NAME__", destPath.endsWith(".json") ? displayJson : displayName)
			.replaceAll("__UUID__", uuid)
			.replaceAll("__PKG_VERSION__", PKG_VERSION);
		writeFileSync(destPath, content);
	}
}

copyTemplate(TEMPLATE_DIR, targetDir);

console.log(`create-pebble-signals: scaffolded ${displayName} in ${targetDir}\n`);
if (packageName !== displayName)
	console.log(`  (npm package name normalized to "${packageName}"; displayName kept verbatim)\n`);
console.log("Next steps:");
console.log(`  cd ${targetArg}`);
// One package: typescript + esbuild are peerDependencies (npm 7+ installs them
// at the TESTED versions) and @moddable/pebbleproxy is a regular dependency.
// Listing them explicitly made `npm install typescript` grab a MAJOR the build
// tools aren't verified against (TS 7 broke the lowering tool's API use).
console.log("  npm install pebble-signals");
// `npm run build` — NOT `pnpm run build`: the advertised entry point is
// `npx create-pebble-signals`, and printing a pnpm command on a machine that only
// has npm failed with "pnpm: command not found" one step after a successful
// install. The generated README and the root quickstart both use npm, and the
// script is identical either way (codex P2).
console.log("  npm run build");
console.log("  pebble install --emulator gabbro");
