// Integrity of the COMMITTED static preview site (site/, built by
// tools/build-site.mts). GitHub Pages serves those bytes as-is — there is no
// build step between this repo and the URL — so the generated tree is the
// deploy artifact and rots silently: a page that lost its bundle, an import
// map pointing at a runtime module that was never copied, or a CDN reference
// that a reader behind a firewall (or an offline `file://` open) can't fetch
// all render as a BLANK watch, not an error. Nothing else guards it: the
// coverage gate only sees src/embeddedjs/runtime-build/**, and the preview
// builder's own output lives in gitignored build/.
//
// Three properties, each a real failure we can ship without noticing:
//   1. STRUCTURE  — every gallery entry has its page, bundle, Piu stubs and
//                   every runtime module its import map promises.
//   2. SELF-CONTAINED — no page loads anything over http(s) or a
//                   protocol-relative //; Pages has no origin we control and
//                   an external script is a third party in our shop window.
//   3. MARKERS    — each bundle really is the example it claims (a stale or
//                   empty app.js still parses, serves 200, and shows nothing).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const SITE = join(ROOT, "site");
const APPS_DIR = join(SITE, "apps");

// The curated gallery, mirrored from tools/build-site.mts. Kept as literal test
// DATA rather than imported: build-site.mts runs the preview builder at module
// scope, and the markers below are the point — two strings per example that
// only its own source produces, so a bundle swapped, emptied or left stale is
// a failure and not a silent blank frame.
const MARKERS: Record<string, string[]> = {
	pulse: ["pulse-theme", "app/boot"],
	counter: ["Count: ", "onPressUp"],
	menu: ["Stopwatch", "runtime/menu"],
	sectionlist: ["Cherry", "runtime/sectionlist"],
	card: ["Sunny skies", "runtime/card"],
};
const APPS = Object.keys(MARKERS);

const read = (...p: string[]) => readFileSync(join(...p), "utf8");
// Every subresource/link reference a browser would follow. `src`/`href` covers
// <script src>, <link href>, <iframe src> and <a href> — the only ref forms
// these generated pages use.
const REFS = /\b(?:src|href)\s*=\s*"([^"]*)"/g;
const refsOf = (html: string) => [...html.matchAll(REFS)].map((m) => m[1]);

// ---- 1. structure ----------------------------------------------------------
test("site: the gallery page and every curated app are present", () => {
	assert.ok(existsSync(join(SITE, "index.html")), "site/index.html missing — run build-site");
	const missing = APPS.filter((a) => !existsSync(join(APPS_DIR, a, "index.html")));
	assert.deepEqual(missing, [], "curated apps with no generated page");
});

test("site: the gallery and site/apps/ agree on the app list", () => {
	// A regen with a changed APPS list rewrites index.html but never removes an
	// old directory, and a hand-edited index.html can reference one that was
	// never built. Both directions are dead links on Pages.
	const gallery = read(SITE, "index.html");
	const framed = [...gallery.matchAll(/<iframe data-app="([^"]+)"/g)].map((m) => m[1]).sort();
	const onDisk = readdirSync(APPS_DIR, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();
	assert.deepEqual(framed, [...APPS].sort(), "gallery iframes do not match the curated list");
	assert.deepEqual(onDisk, framed, "site/apps/ does not match the gallery's iframes");
});

for (const app of APPS) {
	test(`site: ${app} ships its bundle, Piu stubs and its whole import map`, () => {
		const dir = join(APPS_DIR, app);
		for (const f of ["index.html", "app.js", "piu-dom.js"])
			assert.ok(existsSync(join(dir, f)), `site/apps/${app}/${f} missing`);
		// The stubs must be the REAL ones — a divergent copy means the site is
		// previewing something the `pnpm run preview` loop never exercises.
		assert.equal(
			read(dir, "piu-dom.js"),
			read(ROOT, "tools/preview/piu-dom.js"),
			`site/apps/${app}/piu-dom.js has drifted from tools/preview/piu-dom.js`,
		);
		const html = read(dir, "index.html");
		const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
		assert.ok(map, `site/apps/${app}/index.html has no import map`);
		const imports = (JSON.parse(map[1]) as { imports: Record<string, string> }).imports;
		// signals + jsx-runtime are the floor: the page runs the SHIPPED runtime,
		// so an import map without them is not previewing this library at all.
		for (const core of ["runtime/signals", "runtime/jsx-runtime"])
			assert.ok(imports[core], `${app}'s import map is missing ${core}`);
		const unresolved = Object.values(imports).filter((t) => !existsSync(join(dir, t)));
		assert.deepEqual(unresolved, [], `${app} maps runtime modules that were never copied`);
	});

	test(`site: ${app}'s bundle is really the ${app} example`, () => {
		const bundle = read(APPS_DIR, app, "app.js");
		const absent = MARKERS[app].filter((m) => !bundle.includes(m));
		assert.deepEqual(absent, [], `site/apps/${app}/app.js lost its markers — stale bundle?`);
	});
}

// ---- 2. self-contained -----------------------------------------------------
const pages = [join(SITE, "index.html"), ...APPS.map((a) => join(APPS_DIR, a, "index.html"))];

test("site: no page loads anything off-origin", () => {
	const external: string[] = [];
	for (const page of pages)
		for (const ref of refsOf(read(page)))
			if (/^(?:https?:)?\/\//i.test(ref)) external.push(`${page}: ${ref}`);
	assert.deepEqual(external, [], "off-origin references in the generated site");
});

test("site: every reference resolves to a file that ships", () => {
	// A relative ref that lands on nothing is the same blank frame as a CDN we
	// can't reach — report every miss in one run so a bad regen is one fix.
	const dead: string[] = [];
	for (const page of pages)
		for (const ref of refsOf(read(page))) {
			if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(ref)) continue; // data:/mailto:/anchors
			const target = resolve(dirname(page), ref.split(/[?#]/)[0]);
			if (!existsSync(target)) dead.push(`${page}: ${ref}`);
		}
	assert.deepEqual(dead, [], "references to paths the site does not contain");
	// A clean run on ZERO extracted refs would prove nothing — pin that the
	// pages really do reference their bundles (i.e. REFS still matches).
	const total = pages.reduce((n, p) => n + refsOf(read(p)).length, 0);
	assert.ok(total >= pages.length, "no references extracted — the ref regex stopped matching");
});

// ---- 3. the gallery's own contract -----------------------------------------
test("site: the gallery offers both watch shapes and wires the toggle", () => {
	// The round/rect toggle is the one gallery-only feature. Its three parts
	// fail differently: a frame with no `?shape=` boots the preview page's own
	// default (right by luck, wrong the day that default moves); a missing
	// control makes a shape unreachable; a toggle querying the wrong selector
	// leaves both buttons inert while every frame still renders — which looks
	// perfectly fine in a screenshot. Assert the WIRING, not the built URL:
	// emery's href is concatenated at click time and is never in the markup.
	const gallery = read(SITE, "index.html");
	const framed = [...gallery.matchAll(/<iframe data-app="([^"]+)" src="([^"]+)"/g)];
	assert.equal(framed.length, APPS.length, "not every gallery frame carries a src");
	for (const [, app, src] of framed)
		assert.equal(src, `apps/${app}/index.html?shape=round`, `${app}'s frame src is wrong`);
	assert.match(gallery, /data-shape="round"/, "gallery has no round (gabbro) toggle control");
	assert.match(gallery, /data-shape="emery"/, "gallery has no rect (emery) toggle control");
	// the toggle must reach BOTH sides it re-points: the frames and the buttons
	assert.match(gallery, /querySelectorAll\("iframe\[data-app\]"\)/, "toggle finds no frames");
	assert.match(gallery, /querySelectorAll\("button\[data-shape\]"\)/, "toggle finds no controls");
});
