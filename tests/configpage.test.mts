// Unit tests for tools/config-page.mts — the typed config-page BUILDER.
//
// The interesting half of this tool is CODE IT EMITS, so testing the generator's
// return value alone would prove nothing about the page a wearer actually opens.
// Instead the page's PURE core (`serializeSource`) is eval'd here in Node with no
// DOM at all, and every assertion about the html additionally checks that the
// html EMBEDS that exact string — so the functions exercised below are the
// functions that ship, not a hand-copied twin that could drift.
//
// The protocol assertions are pinned against our own bridge, not against a
// memory of Clay: `closeURL` must produce what `src/pkjs/index.ts`'s
// `webviewclosed` handler turns into the AppMessage-10000 string that
// `runtime/config`'s `useConfig` JSON.parses — so the round-trip test literally
// runs `decodeURIComponent` + `JSON.parse` over the emitted URL's fragment.
//
// Run: node --test tests/configpage.test.mts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildConfigPage, type ConfigField, main, serializeSource } from "../tools/config-page.mts";

const ROOT = join(import.meta.dirname, "..");
const TOOL = join(ROOT, "tools/config-page.mts");
const WEATHER = join(ROOT, "src/tsx/examples/weather");

// One field of EVERY type — the fixture behind most assertions, so a new field
// type cannot be added without a failing test here.
const ALL: readonly ConfigField[] = [
	{ key: "city", type: "text", label: "City", default: "Berlin" },
	{ key: "accent", type: "color", label: "Accent", default: "#ffaa55" },
	{ key: "invert", type: "toggle", label: "Invert", default: false },
	{ key: "units", type: "select", label: "Units", default: "metric", options: ["metric", "us"] },
	{ key: "bright", type: "slider", label: "Brightness", default: 50, min: 0, max: 100 },
];

// The emitted page's pure core, evaluated DOM-less. `new Function` gives it a
// scope of its own; the returned handles are the page's own function objects.
interface Pure {
	defaults(): Record<string, unknown>;
	toRaw(values: Record<string, unknown>): Record<string, string>;
	serialize(raw: Record<string, string>): Record<string, unknown>;
	seedRaw(hash: string | null): Record<string, string>;
	closeURL(raw: Record<string, string>): string;
}
const pure = (fields: readonly ConfigField[]): Pure =>
	new Function(
		`${serializeSource(fields)}\nreturn { defaults: defaults, toRaw: toRaw, serialize: serialize, seedRaw: seedRaw, closeURL: closeURL };`,
	)() as Pure;

const tmp = (): string => mkdtempSync(join(tmpdir(), "sp-cfgpage-"));

test("config-page: the html carries EVERY field — label, control, and options", () => {
	const { html } = buildConfigPage(ALL, "demo");
	for (const f of ALL) {
		assert.match(html, new RegExp(`id="c-${f.key}"`), `${f.key} has no control`);
		assert.ok(html.includes(`<span>${f.label}</span>`), `${f.key} has no label`);
	}
	// the control TYPE is what makes each field usable — a select rendered as a
	// text box would still "contain the field" and be useless
	assert.match(html, /id="c-city" type="text"/);
	assert.match(html, /id="c-accent" type="color"/);
	assert.match(html, /id="c-invert" type="checkbox"/);
	assert.match(html, /<option value="metric">metric<\/option><option value="us">us<\/option>/);
	assert.match(html, /id="c-bright" type="range" min="0" max="100" step="1"/);
	// a range with no number beside it is unreadable on a phone
	assert.match(html, /<output id="v-bright">/);
	// SELF-CONTAINED: no network of any kind may appear in a page that opens on
	// a phone with data off (the whole reason it is generated offline)
	assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/);
	assert.doesNotMatch(html, /<script[^>]+src=/);
	assert.doesNotMatch(html, /<link/);
	// the tested pure core IS the shipped one
	assert.ok(html.includes(serializeSource(ALL)));
});

test("config-page: the page seeds from defaults when there is no hash", () => {
	const p = pure(ALL);
	assert.deepEqual(p.defaults(), {
		city: "Berlin",
		accent: "#ffaa55",
		invert: false,
		units: "metric",
		bright: 50,
	});
	// controls hold STRINGS — a checkbox's "false" is what writeRaw compares
	const raw = { city: "Berlin", accent: "#ffaa55", invert: "false", units: "metric", bright: "50" };
	assert.deepEqual(p.seedRaw(""), raw);
	assert.deepEqual(p.seedRaw(null), raw);
});

test("config-page: the page seeds from the URL fragment, PARTIALLY, ignoring junk", () => {
	const p = pure(ALL);
	// pkjs appends the current settings to openURL as an encoded fragment
	const hash = `#${encodeURIComponent(JSON.stringify({ city: "Oslo", invert: true, nope: 1 }))}`;
	const seeded = p.seedRaw(hash);
	assert.equal(seeded.city, "Oslo");
	assert.equal(seeded.invert, "true");
	// a key the schema does not declare is DROPPED (it has no control to seed)
	assert.equal(seeded.nope, undefined);
	// unmentioned keys keep their defaults — the same partial-merge property
	// useConfig has on the way back
	assert.equal(seeded.units, "metric");
	assert.equal(seeded.bright, "50");
	// a malformed fragment must fall back to the defaults, never throw: the page
	// is the only way back out of a bad settings state
	assert.deepEqual(p.seedRaw("#not%20json"), p.seedRaw(""));
	// a half-applied merge would be worse than none — the fallback is a fresh
	// defaults(), so a fragment that dies mid-loop leaves nothing applied
	assert.deepEqual(p.seedRaw("#%7B%22city%22%3A%22Oslo%22"), p.seedRaw(""));
});

test("config-page: serialize/toRaw round-trip, and the TYPES survive it", () => {
	const p = pure(ALL);
	// values -> controls -> values is the identity: this is what makes "open the
	// page, press Save, change nothing" a no-op on the watch
	assert.deepEqual(p.serialize(p.toRaw(p.defaults())), p.defaults());
	// and controls -> values -> controls likewise
	assert.deepEqual(p.toRaw(p.serialize(p.seedRaw(""))), p.seedRaw(""));
	// the payload TYPES are the contract with useConfig: it stores what arrives,
	// so a toggle sent as "false" would read TRUTHY on the watch
	const out = p.serialize({
		city: "Oslo",
		accent: "#000000",
		invert: "true",
		units: "us",
		bright: "70",
	});
	assert.deepEqual(out, {
		city: "Oslo",
		accent: "#000000",
		invert: true,
		units: "us",
		bright: 70,
	});
	assert.equal(typeof out.invert, "boolean");
	assert.equal(typeof out.bright, "number");
});

test("config-page: a slider is clamped and NaN-proofed, never sent as null", () => {
	const p = pure(ALL);
	const b = (v: string): unknown => p.serialize({ ...p.seedRaw(""), bright: v }).bright;
	assert.equal(b("-40"), 0);
	assert.equal(b("400"), 100);
	assert.equal(b("50.6"), 51); // an integer reaches the watch, not a float string
	// JSON.stringify(NaN) is `null`, which would land in the config object and
	// break every read of it — the default stands instead
	assert.equal(b("oops"), 50);
});

test("config-page: closeURL is the pebblejs://close path our pkjs bridge decodes", () => {
	const p = pure(ALL);
	const url = p.closeURL(p.seedRaw("#" + encodeURIComponent(JSON.stringify({ city: "Oslo" }))));
	assert.ok(url.startsWith("pebblejs://close#"), url);
	// replay the bridge: webviewclosed hands the fragment to pkjs, which
	// decodeURIComponent()s it and sends the STRING on AppMessage code 10000;
	// useConfig JSON.parses that string and merges it
	const response = url.slice("pebblejs://close#".length);
	const merged = JSON.parse(decodeURIComponent(response)) as Record<string, unknown>;
	assert.deepEqual(merged, { ...p.defaults(), city: "Oslo" });
	// the encoded form must survive a shell round-trip too — this is exactly the
	// string tools/config-drive.py replays into the emulator
	assert.doesNotMatch(response, /[ "{}]/);
});

test("config-page: the type emit mirrors the schema key for key", () => {
	const { types } = buildConfigPage(ALL, "demo-face");
	// kebab -> Pascal for the interface, SCREAMING for the defaults const
	assert.match(types, /export interface DemoFaceConfig \{/);
	assert.match(types, /export const DEMO_FACE_CONFIG_DEFAULTS: DemoFaceConfig = \{/);
	assert.match(types, /\tcity: string;/);
	assert.match(types, /\taccent: string;/);
	assert.match(types, /\tinvert: boolean;/);
	// a select is a UNION of its options, so a typo'd compare fails to COMPILE
	// on the watch instead of silently never matching
	assert.match(types, /\tunits: "metric" \| "us";/);
	assert.match(types, /\tbright: number;/);
	// the doc comment carries the range a number alone would not explain
	assert.match(types, /\/\*\* Brightness \(slider 0\.\.100\) \*\//);
	assert.match(types, /\/\*\* City \(text\) \*\//);
	// the defaults are the SAME values the page seeds with — that is the whole
	// anti-drift claim, so assert it against the page's own defaults()
	for (const [k, v] of Object.entries(pure(ALL).defaults()))
		assert.match(types, new RegExp(`\\t${k}: ${JSON.stringify(v).replace(/[.*+?^$|]/g, "\\$&")},`));
});

test("config-page: author text is escaped — a label can never break the markup", () => {
	const { html } = buildConfigPage(
		[
			{ key: "a", type: "text", label: 'Temp & wind <b>"x"</b>', default: "" },
			{ key: "b", type: "select", label: "Mode", default: "<none>", options: ["<none>", "on"] },
		],
		"esc",
	);
	assert.ok(html.includes("<span>Temp &amp; wind &lt;b&gt;&quot;x&quot;&lt;/b&gt;</span>"));
	assert.ok(html.includes('<option value="&lt;none&gt;">&lt;none&gt;</option>'));
	// the JSON table lives inside <script>, where a literal `</script>` in a
	// string ends the block in EVERY html parser — `<` is escaped to \u003c,
	// which is still valid JS *and* still parses as the same string
	const { html: h2 } = buildConfigPage(
		[{ key: "a", type: "text", label: "</script>", default: "" }],
		"esc",
	);
	assert.equal(h2.match(/<\/script>/g)?.length, 1);
	assert.ok(h2.includes("\\u003c/script>"));
});

test("config-page: a bad schema FAILS LOUD at generation, naming the offender", () => {
	const throws = (fields: readonly ConfigField[], name: string, re: RegExp): void =>
		assert.throws(() => buildConfigPage(fields, name), re);
	const ok: ConfigField = { key: "a", type: "text", label: "A", default: "" };
	throws([ok], "not a name", /not a word\/kebab identifier seed/);
	throws([], "demo", /schema is empty/);
	throws([{ ...ok, key: "my key" }], "demo", /"my key" is not a legal JS identifier/);
	throws([ok, ok], "demo", /duplicate key "a"/);
	throws(
		[{ key: "s", type: "select", label: "S", default: "x", options: [] }],
		"demo",
		/select s has no options/,
	);
	throws(
		[{ key: "s", type: "select", label: "S", default: "x", options: ["y"] }],
		"demo",
		/select s default "x" is not one of its options/,
	);
	throws(
		[{ key: "n", type: "slider", label: "N", default: 1, min: 5, max: 5 }],
		"demo",
		/slider n needs min < max/,
	);
	throws(
		[{ key: "n", type: "slider", label: "N", default: 9, min: 0, max: 5 }],
		"demo",
		/slider n default is out of range/,
	);
	throws(
		[{ key: "n", type: "slider", label: "N", default: -1, min: 0, max: 5 }],
		"demo",
		/slider n default is out of range/,
	);
});

test("config-page: main() writes both files beside the schema, naming from its folder", async () => {
	const dir = tmp();
	try {
		const schema = join(dir, "config-schema.mts");
		writeFileSync(
			schema,
			'export default [{ key: "city", type: "text", label: "City", default: "Berlin" }];\n',
		);
		const [htmlPath, typesPath] = await main([schema]);
		assert.equal(htmlPath, join(dir, "config-page.html"));
		assert.equal(typesPath, join(dir, "config-types.ts"));
		assert.match(readFileSync(htmlPath, "utf8"), /id="c-city"/);
		// no [name] argument -> the schema's PARENT DIRECTORY names the type
		// (the tmpdir is `sp-cfgpage-<rand>`, so the interface is Sp…Config)
		assert.match(readFileSync(typesPath, "utf8"), /export interface Sp\w*Config \{/);
		// an explicit [name] overrides it
		await main([schema, "weather"]);
		assert.match(readFileSync(typesPath, "utf8"), /export interface WeatherConfig \{/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("config-page: main() fails loud on no schema and on a schema with no default export", async () => {
	await assert.rejects(() => main([]), /usage: node tools\/config-page\.mts/);
	const dir = tmp();
	try {
		const schema = join(dir, "config-schema.mts");
		writeFileSync(schema, "export const fields = [];\n");
		await assert.rejects(() => main([schema]), /has no default export/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("config-page: the CLI shim runs the tool and exits 1 with a message on misuse", () => {
	const dir = tmp();
	try {
		const schema = join(dir, "config-schema.mts");
		writeFileSync(
			schema,
			'export default [{ key: "city", type: "text", label: "City", default: "Berlin" }];\n',
		);
		const out = execFileSync(process.execPath, [TOOL, schema, "demo"], { encoding: "utf8" });
		assert.match(out, /config-page: wrote .*config-page\.html \+ .*config-types\.ts/);
		assert.match(readFileSync(join(dir, "config-types.ts"), "utf8"), /interface DemoConfig/);
		// misuse must be a NON-ZERO exit (a build step that "succeeds" silently
		// after writing nothing is the failure mode this guards)
		assert.throws(
			() => execFileSync(process.execPath, [TOOL], { encoding: "utf8", stdio: "pipe" }),
			(e: { status?: number; stderr?: string }) =>
				e.status === 1 && /usage: node tools\/config-page\.mts/.test(e.stderr ?? ""),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("config-page: the weather example's generated files are IN SYNC with its schema", async () => {
	// The anti-drift claim has to hold for the shipped example too, or the
	// example teaches the opposite of what it documents. Regenerate with:
	//   node tools/config-page.mts src/tsx/examples/weather/config-schema.mts
	const schema = (await import(join(WEATHER, "config-schema.mts"))) as {
		default: readonly ConfigField[];
	};
	const { html, types } = buildConfigPage(schema.default, "weather");
	assert.equal(readFileSync(join(WEATHER, "config-page.html"), "utf8"), html);
	assert.equal(readFileSync(join(WEATHER, "config-types.ts"), "utf8"), types);
	// the example's own three fields, spelled out once so a silent schema edit
	// has to be deliberate
	assert.deepEqual(pure(schema.default).defaults(), {
		city: "Berlin",
		units: "metric",
		accent: "#ffaa55",
	});
});
