// Typed config-page BUILDER — the AUTHORING half of the Clay round-trip. We
// already CONSUME settings well (`useConfig`, runtime/config: seeded from flash,
// merged on inbound, persisted, malformed-payload-safe) but an app author still
// had to hand-write the settings PAGE and keep its key/type map in sync with the
// watch-side interface BY EYE. That drift is silent and expensive: rename a key
// on the page and `{...current, ...inbound}` merges a NEW key in while the Label
// keeps reading the old one — no error, no crash, just a face that never
// updates. This generator makes the drift impossible: ONE typed schema emits
// BOTH the page and the watch-side type + defaults.
//
// THE PROTOCOL, verified end to end against our own bridge (do not "improve" it):
//   1. pkjs `showConfiguration` -> `Pebble.openURL(<page url>)` (src/pkjs/index.ts,
//      templates/app/src/pkjs/index.js). Append the CURRENT settings as the URL
//      FRAGMENT — `<page>#<encodeURIComponent(JSON.stringify(settings))>` — and
//      the generated page seeds its controls from them (see `seedRaw`). A
//      fragment, not a query: it never reaches a server, so a page hosted on a
//      static host cannot leak the wearer's settings into an access log.
//   2. Save -> the page navigates to `pebblejs://close#<encodeURIComponent(
//      JSON.stringify(payload))>`. This is the CLASSIC Clay close path: the
//      Pebble mobile app intercepts the `pebblejs://close` scheme, does NOT
//      navigate, and hands the fragment to pkjs as `e.response`.
//   3. pkjs `webviewclosed` -> `Pebble.sendAppMessage({ 10000: decodeURIComponent(
//      e.response) })` — our bridge, unchanged. 10000 is the code
//      `new Message({ keys: ["config"] })` assigns its FIRST key (host
//      pebble-appmessage.js:28), i.e. exactly what `useConfig` listens on.
//   4. `useConfig` JSON.parses that string and MERGES it over the current value.
// Cancel navigates to a BARE `pebblejs://close` (no fragment) — `e.response` is
// then empty and our bridge's `if (!e.response) return;` keeps the current
// settings. That is the only reason the Cancel button exists here.
//
// The headless driver tools/config-drive.py stands in for steps 1-2 with no
// browser: it answers the openURL broadcast with `quote(<json>)`, which is
// byte-for-byte what this page's Save produces after the scheme prefix is
// stripped. So a payload printed by `closeURL()` here can be replayed verbatim
// through config-drive.py — the emulator receipt for the whole path.
//
// OFFLINE / SELF-CONTAINED, deliberately: CSS and JS are INLINE and there is no
// CDN, no font, no image, no fetch. A settings page opens inside the Pebble
// mobile app's webview, frequently on a phone whose data is off (that is often
// WHY the wearer is fiddling with settings), and a page that renders blank there
// is indistinguishable from a broken app. The emitted JS is ES5-shaped (`var`,
// indexed loops, no arrow functions / template literals) for the same reason:
// the webview is the OS one, not a current browser.
//
// The generator's own logic lives in `serializeSource` — the PURE half of the
// page's script (defaults / toRaw / serialize / seedRaw / closeURL, DOM-free by
// construction). `buildConfigPage` embeds that exact string, so tests that eval
// it in Node are testing the SHIPPED code, not a copy of it
// (tests/configpage.test.mts).
//
// Usage (CLI):
//   node tools/config-page.mts <schema.mts> [name]
// where <schema.mts> default-exports the field array and [name] (default: the
// schema file's PARENT DIRECTORY name) names the emitted type. Writes
// config-page.html + config-types.ts NEXT TO the schema. Nothing here is wired
// into build.mts or the manifest: an app that never generates a page pays zero.
import { writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * One settings field. A DISCRIMINATED union, not a bag with optional
 * `options?`/`min?`/`max?`: it is what makes the schema typed at AUTHOR time —
 * a `select` without `options` or a `slider` without `min`/`max` is a compile
 * error in the schema file itself, not a runtime surprise in the generator.
 * `default` is typed per variant, so a `toggle` defaulting to `"yes"` is
 * likewise rejected where it is written.
 */
export type ConfigField =
	| { key: string; type: "text"; label: string; default: string }
	| { key: string; type: "color"; label: string; default: string }
	| { key: string; type: "toggle"; label: string; default: boolean }
	| { key: string; type: "select"; label: string; default: string; options: readonly string[] }
	| { key: string; type: "slider"; label: string; default: number; min: number; max: number };

/** What {@link buildConfigPage} emits: the page, and the watch-side TS module. */
export interface ConfigPage {
	/** the self-contained settings page — write it to `config-page.html` */
	html: string;
	/** the generated TS source — the interface + the defaults `useConfig` seeds with */
	types: string;
}

// Fail loud (Rule 12): a bad schema must die at GENERATION time with the key
// named, never emit a page that silently disagrees with the watch.
const bad = (msg: string): never => {
	throw new Error(`config-page: ${msg}`);
};

// A key must be a legal JS identifier because it is BOTH a JSON key on the wire
// and an interface property in the emitted type — `"my key"` would need quoting
// in one place and not the other, and `useConfig`'s spread merge would still
// work, so the mismatch would surface only as a dead binding on device.
const KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
// The page/type NAME seeds an identifier (`weather` -> `WeatherConfig`), so it
// is kebab-or-word only; anything else would emit un-parseable TypeScript.
const NAME = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;

/** `weather-face` -> `WeatherFace` (the emitted interface's prefix). */
const pascal = (name: string): string =>
	name
		.split("-")
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join("");

/** `weather-face` -> `WEATHER_FACE` (the emitted defaults const's prefix). */
const scream = (name: string): string => name.replace(/-/g, "_").toUpperCase();

// HTML text escape. Labels and option values are AUTHOR data, not attacker
// data, but an unescaped `&` or `<` in a label ("Temp & wind", "<none>")
// silently corrupts the markup, which is a bug report we would rather not read.
const esc = (s: string): string =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// JSON embedded in a <script> block: `</script>` inside a string literal ends
// the block in every HTML parser, so `<` is escaped to its JS unicode form.
// The result is still valid JSON *and* valid JS, so `serializeSource`'s output
// stays evaluable in Node (where there is no <script> to close) unchanged.
const jsJSON = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c");

/**
 * The PURE half of the generated page's script — DOM-free, so Node can eval it
 * verbatim. Five functions over the frozen `FIELDS` table:
 *
 * - `defaults()` — the schema's defaults as TYPED values (the same object the
 *   emitted `config-types.ts` exports for `useConfig`'s `initial`).
 * - `toRaw(values)` — typed values -> the STRING form a form control holds.
 * - `serialize(raw)` — form strings -> the TYPED payload the watch receives.
 *   The inverse of `toRaw`, and the whole contract with `useConfig`: a slider
 *   must land as a NUMBER and a toggle as a BOOLEAN, because the merge stores
 *   whatever arrives and `config().invert ? a : b` would read `"false"` as
 *   TRUTHY.
 * - `seedRaw(hash)` — the current settings from the URL fragment, merged over
 *   the defaults, as control strings. A malformed fragment falls back to the
 *   defaults instead of throwing — the same swallow `useConfig` makes for the
 *   same reason (untrusted external input must never leave a blank screen).
 * - `closeURL(raw)` — the protocol line: `pebblejs://close#<encoded payload>`.
 *
 * Exported so tests eval the SHIPPED source (`buildConfigPage().html` contains
 * this string verbatim), not a hand-copied twin that could drift.
 */
export function serializeSource(fields: readonly ConfigField[]): string {
	return `var FIELDS = ${jsJSON(fields)};

// the schema's defaults, as TYPED values
function defaults() {
	var v = {}, i;
	for (i = 0; i < FIELDS.length; i++) v[FIELDS[i].key] = FIELDS[i]["default"];
	return v;
}

// typed values -> the string form a form control holds (a checkbox reports
// "true"/"false"); the inverse of serialize()
function toRaw(values) {
	var raw = {}, i;
	for (i = 0; i < FIELDS.length; i++) raw[FIELDS[i].key] = String(values[FIELDS[i].key]);
	return raw;
}

// form strings -> the TYPED payload the watch merges. Types matter: useConfig
// stores what arrives, so "false" would read truthy and "21" would break maths.
function serialize(raw) {
	var out = {}, i, f, s, n;
	for (i = 0; i < FIELDS.length; i++) {
		f = FIELDS[i];
		s = String(raw[f.key]);
		if (f.type === "toggle") out[f.key] = s === "true";
		else if (f.type === "slider") {
			n = Math.round(Number(s));
			// NaN (a hand-edited fragment, a locale decimal) is not a number the
			// watch can draw — fall back to the default, then clamp to the range
			if (n !== n) n = f["default"];
			out[f.key] = n < f.min ? f.min : n > f.max ? f.max : n;
		} else out[f.key] = s;
	}
	return out;
}

// the CURRENT settings ride in the URL fragment (pkjs appends them to openURL);
// absent or malformed, the defaults stand — never a throw, never a blank page
function seedRaw(hash) {
	var v = defaults(), body = String(hash == null ? "" : hash).replace(/^#/, ""), p, i, k;
	if (body) {
		try {
			p = JSON.parse(decodeURIComponent(body));
			for (i = 0; i < FIELDS.length; i++) {
				k = FIELDS[i].key;
				if (p && Object.prototype.hasOwnProperty.call(p, k)) v[k] = p[k];
			}
		} catch (e) {
			v = defaults();
		}
	}
	return toRaw(v);
}

// THE protocol line — the Pebble app intercepts this scheme and hands the
// fragment to pkjs as e.response (which decodeURIComponent()s it)
function closeURL(raw) {
	return "pebblejs://close#" + encodeURIComponent(JSON.stringify(serialize(raw)));
}`;
}

// One field's markup. `c-<key>` is the control id every DOM helper below looks
// up; a slider also gets a `v-<key>` readout, because a range input with no
// number next to it is unusable on a phone.
const control = (f: ConfigField): string => {
	if (f.type === "toggle")
		return `<label class="row"><span>${esc(f.label)}</span><input id="c-${f.key}" type="checkbox"></label>`;
	if (f.type === "select")
		return `<label class="row"><span>${esc(f.label)}</span><select id="c-${f.key}">${f.options
			.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)
			.join("")}</select></label>`;
	if (f.type === "slider")
		return `<label class="row"><span>${esc(f.label)}</span><input id="c-${f.key}" type="range" min="${f.min}" max="${f.max}" step="1"><output id="v-${f.key}"></output></label>`;
	// text and color are both a single <input>; only the type attribute differs
	return `<label class="row"><span>${esc(f.label)}</span><input id="c-${f.key}" type="${f.type === "color" ? "color" : "text"}"></label>`;
};

/**
 * Generate a settings page + its watch-side type from ONE typed schema.
 *
 *   const schema = [
 *     { key: "city", type: "text", label: "City", default: "Berlin" },
 *   ] as const satisfies readonly ConfigField[];
 *   const { html, types } = buildConfigPage(schema, "weather");
 *
 * The schema is validated first and FAILS LOUD (throws, naming the key) on a
 * duplicate/illegal key, an empty schema, a `select` default outside its
 * options, or a `slider` whose range is inverted or excludes its default —
 * every one of which would otherwise ship a page that disagrees with the watch.
 *
 * @param fields the settings fields, in the order they should appear
 * @param name identifier seed for the emitted type (`weather` -> `WeatherConfig`)
 * @returns the self-contained page and the generated TS source
 */
export function buildConfigPage(fields: readonly ConfigField[], name: string): ConfigPage {
	if (!NAME.test(name)) bad(`name ${JSON.stringify(name)} is not a word/kebab identifier seed`);
	if (fields.length === 0) bad("schema is empty — a page with no fields cannot be saved");
	const seen = new Set<string>();
	for (const f of fields) {
		if (!KEY.test(f.key)) bad(`key ${JSON.stringify(f.key)} is not a legal JS identifier`);
		if (seen.has(f.key)) bad(`duplicate key ${JSON.stringify(f.key)}`);
		seen.add(f.key);
		if (f.type === "select") {
			if (f.options.length === 0) bad(`select ${f.key} has no options`);
			if (!f.options.includes(f.default))
				bad(`select ${f.key} default ${JSON.stringify(f.default)} is not one of its options`);
		}
		if (f.type === "slider") {
			if (!(f.min < f.max)) bad(`slider ${f.key} needs min < max`);
			if (f.default < f.min || f.default > f.max) bad(`slider ${f.key} default is out of range`);
		}
	}

	const Type = `${pascal(name)}Config`;
	const DEFAULTS = `${scream(name)}_CONFIG_DEFAULTS`;
	// text/color are free-form strings; a select is a UNION of its options, so a
	// typo'd `cfg().units === "farenheit"` is a compile error on the watch side.
	const tsType = (f: ConfigField): string =>
		f.type === "toggle"
			? "boolean"
			: f.type === "slider"
				? "number"
				: f.type === "select"
					? f.options.map((o) => JSON.stringify(o)).join(" | ")
					: "string";
	const note = (f: ConfigField): string =>
		f.type === "slider" ? `${f.type} ${f.min}..${f.max}` : f.type;

	const types = `// GENERATED by tools/config-page.mts — DO NOT EDIT.
// Regenerate with:  node tools/config-page.mts <this dir>/config-schema.mts
//
// The SAME schema emits config-page.html, so the page's keys/types and the
// watch-side type below cannot drift. Pass ${DEFAULTS} as useConfig's
// \`initial\` and a watch that has never been configured agrees, key for key,
// with a page the wearer has never opened.
//
//   import { useConfig } from "runtime/config";
//   import { type ${Type}, ${DEFAULTS} } from "./config-types";
//   const cfg = useConfig<${Type}>(${DEFAULTS});

/** Settings written by config-page.html and merged by \`useConfig\`. */
export interface ${Type} {
${fields.map((f) => `\t/** ${f.label} (${note(f)}) */\n\t${f.key}: ${tsType(f)};`).join("\n")}
}

/** The page's own defaults — the value \`useConfig\` seeds with before the first save. */
export const ${DEFAULTS}: ${Type} = {
${fields.map((f) => `\t${f.key}: ${JSON.stringify(f.default)},`).join("\n")}
};
`;

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pascal(name)} settings</title>
<style>
:root { color-scheme: dark; }
body { margin: 0; padding: 16px; background: #16161a; color: #e8e8ea;
       font: 16px/1.4 system-ui, -apple-system, sans-serif; }
h1 { margin: 0 0 16px; font-size: 20px; font-weight: 600; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0;
       border-bottom: 1px solid #2a2a30; }
.row span { flex: 1; }
input, select { font: inherit; min-height: 40px; color: inherit;
                background: #22222a; border: 1px solid #3a3a44; border-radius: 6px;
                padding: 6px 8px; }
input[type=checkbox] { width: 28px; height: 28px; min-height: 28px; }
input[type=color] { width: 56px; padding: 2px; }
input[type=range] { flex: 1; background: none; border: none; padding: 0; }
output { min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; }
.actions { display: flex; gap: 12px; margin-top: 20px; }
button { flex: 1; font: inherit; min-height: 48px; border: 0; border-radius: 8px;
         color: #16161a; background: #ff8800; font-weight: 600; }
button.alt { background: #3a3a44; color: #e8e8ea; }
</style>
</head>
<body>
<h1>${pascal(name)} settings</h1>
<form id="f" onsubmit="return false">
${fields.map(control).join("\n")}
<div class="actions">
<button type="button" id="cancel" class="alt">Cancel</button>
<button type="button" id="save">Save</button>
</div>
</form>
<script>
${serializeSource(fields)}

// ---- DOM glue (everything above is pure and Node-testable) ----------------
function ctl(key) { return document.getElementById("c-" + key); }

// controls -> raw strings. A checkbox has no .value worth reading, so its
// .checked is stringified into the SAME shape serialize() expects.
function readRaw() {
	var raw = {}, i, f;
	for (i = 0; i < FIELDS.length; i++) {
		f = FIELDS[i];
		raw[f.key] = f.type === "toggle" ? String(ctl(f.key).checked) : String(ctl(f.key).value);
	}
	return raw;
}

function writeRaw(raw) {
	var i, f;
	for (i = 0; i < FIELDS.length; i++) {
		f = FIELDS[i];
		if (f.type === "toggle") ctl(f.key).checked = raw[f.key] === "true";
		else ctl(f.key).value = raw[f.key];
		if (f.type === "slider") document.getElementById("v-" + f.key).textContent = raw[f.key];
	}
}

writeRaw(seedRaw(location.hash));
for (var i = 0; i < FIELDS.length; i++) (function (f) {
	if (f.type !== "slider") return;
	ctl(f.key).addEventListener("input", function () {
		document.getElementById("v-" + f.key).textContent = ctl(f.key).value;
	});
})(FIELDS[i]);

// Save: hand the TYPED payload to the Pebble app. Cancel: a BARE close, so
// pkjs sees an empty e.response and keeps the current settings.
document.getElementById("save").addEventListener("click", function () {
	location.href = closeURL(readRaw());
});
document.getElementById("cancel").addEventListener("click", function () {
	location.href = "pebblejs://close";
});
</script>
</body>
</html>
`;
	return { html, types };
}

/**
 * The CLI body, exported so it is exercised in-process by the tests rather than
 * only through a child process. Writes `config-page.html` and `config-types.ts`
 * beside the schema and returns their paths.
 *
 * @param argv `[<schema.mts>, <name>?]` — name defaults to the schema's parent
 *   directory (`src/tsx/examples/weather/config-schema.mts` -> `weather`)
 */
export async function main(argv: readonly string[]): Promise<string[]> {
	const [file, nameArg] = argv;
	if (!file) throw new Error("usage: node tools/config-page.mts <schema.mts> [name]");
	const abs = resolve(file);
	const dir = dirname(abs);
	// the schema is a REAL module, imported and run — that is what makes it
	// typed: the same file the editor checks is the file the generator reads
	const mod = (await import(pathToFileURL(abs).href)) as { default?: readonly ConfigField[] };
	if (!mod.default) throw new Error(`config-page: ${file} has no default export (the field array)`);
	const { html, types } = buildConfigPage(mod.default, nameArg ?? basename(dir));
	const htmlPath = join(dir, "config-page.html");
	const typesPath = join(dir, "config-types.ts");
	writeFileSync(htmlPath, html);
	writeFileSync(typesPath, types);
	return [htmlPath, typesPath];
}

/* node:coverage disable */
// CLI shim only: `import.meta.main` is false under the test runner, so this
// branch can never be taken in-process. main() above is covered directly, and
// tests/configpage.test.mts additionally SPAWNS this file to prove the shim.
if (import.meta.main)
	main(process.argv.slice(2)).then(
		(out) => console.log(`config-page: wrote ${out.join(" + ")}`),
		(e: Error) => {
			console.error(e.message);
			process.exit(1);
		},
	);
/* node:coverage enable */
