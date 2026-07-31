// Link integrity for the two front-of-house pages. The 63KB README was split on
// 2026-07-31: README.md became the ~200-line pitch page and its whole measured
// ledger moved to docs/handbook.md — which re-based every relative link by one
// directory level. A hand-rebased link that lands on nothing is silent rot (a
// dead .md link renders as normal text on GitHub, and a dead screenshot as a
// broken-image icon), so the move is pinned here: every relative target in
// either page must resolve to a file that exists on disk.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");

// Inline links + images `[t](target)` / `![alt](target)`, plus reference-style
// definitions `[label]: target` — the two link forms these pages actually use.
const INLINE = /!?\[[^\]]*\]\(\s*([^)\s]+)/g;
const REFDEF = /^\[[^\]]+\]:\s*(\S+)/gm;

const relativeTargets = (md: string) =>
	[...md.matchAll(INLINE), ...md.matchAll(REFDEF)]
		.map((m) => m[1])
		// absolute URLs and same-page anchors have no file to resolve; a fragment
		// on a relative target names a heading, so resolve the path part only.
		.filter((t) => !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(t))
		.map((t) => t.split("#")[0])
		.filter((t) => t.length > 0);

for (const page of ["README.md", "docs/handbook.md"]) {
	test(`links: every relative target in ${page} exists`, async () => {
		const file = join(ROOT, page);
		const targets = relativeTargets(await readFile(file, "utf8"));
		// Report EVERY miss in one run — one assert per link would hide the rest
		// behind the first failure, which is the slowest possible way to fix a move.
		const dead = targets.filter((t) => !existsSync(resolve(dirname(file), t)));
		assert.deepEqual(dead, [], `${page} links to ${dead.length} missing path(s)`);
		// A page that matched nothing means the regexes stopped matching, not that
		// the page is clean — pin that both pages really do carry links.
		assert.ok(targets.length > 0, `${page} produced no relative links — extraction broke`);
	});
}
