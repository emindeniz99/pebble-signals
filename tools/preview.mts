// Browser layout preview builder — CloudPebble tier 2 (roadmap "Web IDE").
// Bundles ONE example against the real compiled runtime and emits a static
// page that runs it in a browser: signals/bindings/flow are the SHIPPED
// code (runtime-build/*.js via an import map); only Piu is stubbed with
// DOM-rendering classes (tools/preview/piu-dom.js). Layout is approximate
// and lazy modules are unavailable — QEMU stays the truth; this is the
// instant-feedback tier.
//
// NOTE: the preview bundles the raw .tsx — the lower/auto-thunk pass does
// NOT run, so bare reactive props (`string={"c" + count()}`) stay static
// here. Write thunks (`string={() => ...}`) for anything the preview
// should animate; on-device builds lower both forms identically.
//
// Usage:
//   node tools/preview.mts <app>          # emits build/preview/<app>/
//   python3 -m http.server -d build/preview/<app> 8080
//   open http://localhost:8080/?shape=round|emery   (default round 260x260)
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveDeps, neededModules, relativeClosure } from "./treeshake.mts";

const APP = process.argv[2];
const ROOT = join(import.meta.dirname, "..");
const entry = join(ROOT, "src/tsx/examples", `${APP ?? ""}.tsx`);
if (!APP || !existsSync(entry)) {
	console.error("usage: node tools/preview.mts <app>   (an example in src/tsx/examples/)");
	process.exit(1);
}
const RUNTIME = join(ROOT, "src/embeddedjs/runtime-build");
if (!existsSync(join(RUNTIME, "signals.js"))) {
	console.error("preview: run `pnpm run build:runtime` first (runtime-build/ missing)");
	process.exit(1);
}

const out = join(ROOT, "build/preview", APP);
mkdirSync(join(out, "runtime"), { recursive: true });

esbuild.buildSync({
	entryPoints: [entry],
	bundle: true,
	external: ["runtime/*", "app/*"],
	format: "esm",
	jsx: "automatic",
	jsxImportSource: "runtime",
	outfile: join(out, "app.js"),
	logLevel: "error",
});
// Copy the SELECTED APP'S runtime closure, not a hard-coded core three. Any
// catalog example that imports an opt-in module (button.tsx -> runtime/button)
// left esbuild with an external specifier the page's import map never mapped,
// so the browser failed module resolution before rendering anything — while
// `pnpm run preview -- <app>` is advertised for arbitrary examples and only
// LAZY modules are documented as unavailable (codex P2). Same derivation the
// device build uses: the entry's relative closure seeds neededModules over the
// runtime's own import graph.
const readFile = (p: string): string | null => (existsSync(p) ? readFileSync(p, "utf8") : null);
const modPath = (m: string): string => join(RUNTIME, `${m.slice("runtime/".length)}.js`);
const deps = deriveDeps(
	readdirSync(RUNTIME)
		.filter((f) => f.endsWith(".js"))
		.map((f) => `runtime/${f.slice(0, -3)}`),
	(m) => readFile(modPath(m)),
);
const closureSrc = relativeClosure(entry, readFile)
	.map((p) => readFile(p) ?? "")
	.join("\n");
// jsx-runtime is seeded explicitly: tsc's automatic JSX transform injects that
// import AFTER this source-level scan (the same seed build.mts passes).
const runtimeMods = [...neededModules(closureSrc, ["runtime/jsx-runtime"], deps)]
	.filter((m) => existsSync(modPath(m)))
	.sort();
for (const m of runtimeMods) cpSync(modPath(m), join(out, "runtime", `${m.slice(8)}.js`));
cpSync(join(ROOT, "tools/preview/piu-dom.js"), join(out, "piu-dom.js"));

writeFileSync(
	join(out, "index.html"),
	`<!DOCTYPE html>
<meta charset="utf-8">
<title>pebble-signals preview — ${APP}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: #1a1a2e; font-family: system-ui, sans-serif; }
  #watch { box-shadow: 0 0 0 10px #333, 0 12px 40px rgba(0,0,0,.6); }
  #hint { position: fixed; bottom: 10px; width: 100%; text-align: center;
          color: #667; font-size: 12px; }
</style>
<div id="hint">${APP} — keys: &uarr; up &middot; &darr; down &middot; Enter select &middot;
Backspace back &middot; ?shape=round|emery &middot; layout approximate (QEMU is truth)</div>
<script type="importmap">
{ "imports": {
${runtimeMods.map((m) => `    "${m}": "./runtime/${m.slice(8)}.js"`).join(",\n")}
} }
</script>
<script src="./piu-dom.js"></script>
<script type="module" src="./app.js"></script>
`,
);
console.log(`preview: ${join("build/preview", APP)}/ — serve it and open index.html`);
console.log(`  runtime modules: ${runtimeMods.join(", ")}`);
console.log(`  python3 -m http.server -d build/preview/${APP} 8080`);
