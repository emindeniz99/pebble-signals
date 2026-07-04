#!/usr/bin/env node
// create-signal-piu: scaffold a ready-to-build consumer watch app from
// templates/app/ in one command (docs/packaging.md, "create-signal-piu
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

const { values: cli, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: { name: { type: "string" } },
	allowPositionals: true,
});

const targetArg = positionals[0];
if (!targetArg) {
	err("usage: create-signal-piu <dir> [--name <appName>]");
	process.exit(1);
}
const targetDir = resolve(process.cwd(), targetArg);

// Refuse a non-empty target — this scaffolds a whole project; silently
// merging into existing files would be surprising and hard to undo.
if (existsSync(targetDir)) {
	if (!statSync(targetDir).isDirectory()) {
		err(`create-signal-piu: ${targetDir} exists and is not a directory`);
		process.exit(1);
	}
	if (readdirSync(targetDir).length > 0) {
		err(`create-signal-piu: refusing to scaffold into non-empty directory: ${targetDir}`);
		process.exit(1);
	}
}

const appName = cli.name ?? basename(targetDir);
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
		const content = readFileSync(srcPath, "utf8")
			.replaceAll("__APP_NAME__", appName)
			.replaceAll("__UUID__", uuid);
		writeFileSync(destPath, content);
	}
}

copyTemplate(TEMPLATE_DIR, targetDir);

console.log(`create-signal-piu: scaffolded ${appName} in ${targetDir}\n`);
console.log("Next steps:");
console.log(`  cd ${targetArg}`);
console.log("  npm install signal-piu typescript esbuild @moddable/pebbleproxy");
console.log("  npm run build");
console.log("  pebble install --emulator gabbro");
