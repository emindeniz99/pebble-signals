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
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APP = process.argv[2];
const ROOT = join(import.meta.dirname, "..");
const entry = join(ROOT, "src/tsx/examples", `${APP ?? ""}.tsx`);
if (!APP || !existsSync(entry)) {
	console.error("usage: node tools/preview.mts <app>   (an example in src/tsx/examples/)");
	process.exit(1);
}
const RUNTIME = join(ROOT, "src/embeddedjs/runtime-build");
if (!existsSync(join(RUNTIME, "signals.js"))) {
	console.error("preview: run `npm run build:runtime` first (runtime-build/ missing)");
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
for (const f of ["signals.js", "jsx-runtime.js", "flow.js"])
	cpSync(join(RUNTIME, f), join(out, "runtime", f));
cpSync(join(ROOT, "tools/preview/piu-dom.js"), join(out, "piu-dom.js"));

writeFileSync(
	join(out, "index.html"),
	`<!DOCTYPE html>
<meta charset="utf-8">
<title>signal-piu preview — ${APP}</title>
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
    "runtime/signals": "./runtime/signals.js",
    "runtime/jsx-runtime": "./runtime/jsx-runtime.js",
    "runtime/flow": "./runtime/flow.js"
} }
</script>
<script src="./piu-dom.js"></script>
<script type="module" src="./app.js"></script>
`,
);
console.log(`preview: ${join("build/preview", APP)}/ — serve it and open index.html`);
console.log(`  python3 -m http.server -d build/preview/${APP} 8080`);
