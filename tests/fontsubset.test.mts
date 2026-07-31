// Unit tests for tools/fontsubset.mts — TTF subsetting (competitive gap #11).
// Node's BUILT-IN runner + assert, zero dependencies, .mts read natively.
// Run: node --test tests/fontsubset.test.mts
//
// The fixture is a REAL face already in the repo — the fontface example's
// Liberation Serif Bold (SIL OFL, 370KB, 2,602 glyphs). Subsetting is byte
// arithmetic over someone else's binary format, so a synthetic 3-glyph toy
// would prove nothing about the paths that actually bite: idRangeOffset cmap
// segments, composite (accented) glyphs, hinting tables. Hand-built fixtures
// appear only where the real face CANNOT reach a branch (the component
// transform encodings it never uses, the short loca format it does not use).
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	components,
	hMetric,
	locaAt,
	readFontSpec,
	resolveChars,
	subsetFonts,
	subsetTTF,
} from "../tools/fontsubset.mts";

const TTF = "src/tsx/examples/fontface/fonts/LiberationSerif-Bold.ttf";
const FACE = "LiberationSerif-Bold";
const CLOCK = "0123456789:"; // what a clock face actually draws
const src = readFileSync(TTF);
const tmp = (): string => mkdtempSync(join(tmpdir(), "fontsubset-"));

// ---- a minimal sfnt reader, INDEPENDENT of the subsetter's own writer ----
// (a bug shared between writer and reader would cancel out and prove nothing)
const dv = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
function dir(b: Uint8Array): Map<string, { off: number; len: number }> {
	const f = dv(b);
	const t = new Map<string, { off: number; len: number }>();
	for (let i = 0, o = 12, n = f.getUint16(4); i < n; i++, o += 16)
		t.set(String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]), {
			off: f.getUint32(o + 8),
			len: f.getUint32(o + 12),
		});
	return t;
}
/** codepoint -> gid, read out of a format-4 (3,1) cmap. */
function unicodes(b: Uint8Array): Map<number, number> {
	const f = dv(b);
	const c = (dir(b).get("cmap") as { off: number }).off;
	let sub = 0;
	for (let i = 0, n = f.getUint16(c + 2); i < n; i++) {
		const rec = c + 4 + i * 8;
		if (f.getUint16(rec) === 3 && f.getUint16(rec + 2) === 1) sub = c + f.getUint32(rec + 4);
	}
	const segX2 = f.getUint16(sub + 6);
	const endO = sub + 14;
	const startO = endO + segX2 + 2;
	const deltaO = startO + segX2;
	const rangeO = deltaO + segX2;
	const m = new Map<number, number>();
	for (let i = 0; i < segX2; i += 2) {
		const end = f.getUint16(endO + i);
		const start = f.getUint16(startO + i);
		const delta = f.getInt16(deltaO + i);
		const ro = f.getUint16(rangeO + i);
		for (let cp = start; cp <= end; cp++) {
			let g = ro === 0 ? (cp + delta) & 0xffff : f.getUint16(rangeO + i + ro + (cp - start) * 2);
			if (ro !== 0 && g) g = (g + delta) & 0xffff;
			if (g) m.set(cp, g);
		}
	}
	return m;
}
/** Copy `src` with the 4-char tag `from` renamed to `to` in the directory —
 * how the tests reach "this required table is absent" without shipping a
 * second broken TTF into the repo. */
function retag(b: Uint8Array, from: string, to: string): Uint8Array {
	const out = new Uint8Array(b);
	const t = dv(out);
	for (let i = 0, o = 12, n = t.getUint16(4); i < n; i++, o += 16)
		if (String.fromCharCode(out[o], out[o + 1], out[o + 2], out[o + 3]) === from)
			for (let k = 0; k < 4; k++) out[o + k] = to.charCodeAt(k);
	return out;
}

// ---- the headline: a real subset ----

test("subsetTTF: the clock subset is a VALID ttf, far smaller, with the asked-for glyphs", () => {
	const out = subsetTTF(src, CLOCK);
	// valid sfnt: glyf-outline version, a sane directory, every required table
	assert.equal(dv(out).getUint32(0), 0x00010000);
	const t = dir(out);
	for (const tag of ["cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "post"])
		assert.ok(t.has(tag), `subset is missing \`${tag}\``);
	// every table lies inside the file and the directory is tag-sorted (spec)
	const tags = [...t.keys()];
	assert.deepEqual(tags, [...tags].sort());
	for (const [tag, x] of t) assert.ok(x.off + x.len <= out.length, `\`${tag}\` runs off the end`);

	// SMALLER — the entire point. 370,196 -> ~9KB on a flash-budgeted device.
	assert.ok(
		out.length < src.length / 20,
		`${out.length} B is not a real shrink from ${src.length}`,
	);

	// the requested glyphs are REACHABLE (cmap maps each one to a real outline),
	// not merely present in some table
	const cmap = unicodes(out);
	const loca = t.get("loca") as { off: number };
	const f = dv(out);
	for (const ch of CLOCK) {
		const g = cmap.get(ch.codePointAt(0) as number);
		assert.ok(g, `subset cannot address ${JSON.stringify(ch)}`);
		const s = f.getUint32(loca.off + (g as number) * 4);
		assert.ok(f.getUint32(loca.off + ((g as number) + 1) * 4) > s, `${ch} has an EMPTY outline`);
	}
	// ...and nothing else came along: .notdef + 11 requested glyphs
	assert.equal(f.getUint16((t.get("maxp") as { off: number }).off + 4), 1 + CLOCK.length);
	// glyph-id-indexed tables that a remap invalidates must be GONE
	for (const tag of ["GSUB", "GPOS", "GDEF", "kern"]) assert.ok(!t.has(tag));
	// hinting survives — it is what keeps a 32px face legible on the panel
	for (const tag of ["cvt ", "fpgm", "prep", "name"]) assert.ok(t.has(tag), `lost \`${tag}\``);
});

test("subsetTTF: head/hhea/hmtx/post are rewritten CONSISTENTLY with the new glyph count", () => {
	const out = subsetTTF(src, CLOCK);
	const t = dir(out);
	const f = dv(out);
	const n = 1 + CLOCK.length;
	// indexToLocFormat must say "long" — the writer emits long loca, and a stale
	// short flag halves every offset and shreds the outlines
	assert.equal(f.getInt16((t.get("head") as { off: number }).off + 50), 1);
	assert.equal((t.get("loca") as { len: number }).len, (n + 1) * 4);
	// all-long metrics, so hhea.numberOfHMetrics == numGlyphs and hmtx is 4n
	assert.equal(f.getUint16((t.get("hhea") as { off: number }).off + 34), n);
	assert.equal((t.get("hmtx") as { len: number }).len, n * 4);
	// post 3.0 = no glyph-name array (v2.0's names are all stale after a remap)
	assert.equal(f.getUint32((t.get("post") as { off: number }).off), 0x00030000);
	assert.equal((t.get("post") as { len: number }).len, 32);
	// checkSumAdjustment: the file's own checksum must satisfy the sfnt identity
	let s = 0;
	for (let i = 0; i < out.length; i += 4) s = (s + f.getUint32(i)) >>> 0;
	assert.equal(s, 0xb1b0afba);
});

test("subsetTTF: advance widths and outlines are the ORIGINAL bytes, not re-derived", () => {
	// the subset must rasterize identically to the full face — same outline,
	// same advance. Anything else is a silent layout change on the watch.
	const out = subsetTTF(src, CLOCK);
	const inT = dir(src);
	const outT = dir(out);
	const inF = dv(src);
	const outF = dv(out);
	const inMap = unicodes(src);
	const outMap = unicodes(out);
	const inLoca = (inT.get("loca") as { off: number }).off;
	const outLoca = (outT.get("loca") as { off: number }).off;
	for (const ch of CLOCK) {
		const og = inMap.get(ch.codePointAt(0) as number) as number;
		const ng = outMap.get(ch.codePointAt(0) as number) as number;
		const a = src.subarray(
			(inT.get("glyf") as { off: number }).off + inF.getUint32(inLoca + og * 4),
			(inT.get("glyf") as { off: number }).off + inF.getUint32(inLoca + (og + 1) * 4),
		);
		const b = out.subarray(
			(outT.get("glyf") as { off: number }).off + outF.getUint32(outLoca + ng * 4),
			(outT.get("glyf") as { off: number }).off + outF.getUint32(outLoca + ng * 4) + a.length,
		);
		assert.deepEqual(Buffer.from(b), Buffer.from(a), `${ch}'s outline changed`);
		assert.equal(
			outF.getUint16((outT.get("hmtx") as { off: number }).off + ng * 4),
			inF.getUint16((inT.get("hmtx") as { off: number }).off + og * 4),
			`${ch}'s advance width changed`,
		);
	}
});

test("subsetTTF: output is deterministic and order-independent", () => {
	// the manifest points a device build at these bytes; a subset that differs
	// run to run makes every rebuild a diff and every receipt unreproducible
	assert.deepEqual(Buffer.from(subsetTTF(src, CLOCK)), Buffer.from(subsetTTF(src, CLOCK)));
	assert.deepEqual(Buffer.from(subsetTTF(src, CLOCK)), Buffer.from(subsetTTF(src, ":9876543210")));
	assert.deepEqual(Buffer.from(subsetTTF(src, CLOCK)), Buffer.from(subsetTTF(src, `${CLOCK}00::`)));
});

test("subsetTTF: composites drag their components along; empty glyphs survive", () => {
	// "é" is a COMPOSITE (e + acute). Ship it without its parts and the watch
	// draws a blank where the letter should be. "e" is requested too, so the
	// closure must also handle "component already kept".
	const out = subsetTTF(src, "éèe ");
	const t = dir(out);
	const f = dv(out);
	const n = f.getUint16((t.get("maxp") as { off: number }).off + 4);
	// .notdef + space + e + è + é = 5 requested, PLUS the acute/grave components
	assert.ok(n > 5, `composite components were dropped (only ${n} glyphs)`);
	const cmap = unicodes(out);
	const loca = (t.get("loca") as { off: number }).off;
	const eacute = cmap.get(0xe9) as number;
	const s = f.getUint32(loca + eacute * 4);
	assert.ok(f.getUint32(loca + (eacute + 1) * 4) > s);
	// still composite, and its component ids point INSIDE the new numbering
	const glyf = (t.get("glyf") as { off: number }).off;
	assert.ok(f.getInt16(glyf + s) < 0, "é stopped being a composite");
	for (const [, c] of components(f, glyf + s)) assert.ok(c < n, `component ${c} is out of range`);
	// the space is mapped but has no outline — an empty glyph must not break loca
	const sp = cmap.get(0x20) as number;
	assert.equal(f.getUint32(loca + sp * 4), f.getUint32(loca + (sp + 1) * 4));
});

test("subsetTTF: a NON-contiguous character set still maps every character", () => {
	// "0123456789:" is one contiguous codepoint run — the single-segment case.
	// A real app's set is full of holes, and a cmap builder that only ever
	// emitted one segment would map the first run and silently blank the rest.
	const out = subsetTTF(src, "0:aZ~");
	const cmap = unicodes(out);
	for (const ch of "0:aZ~") assert.ok(cmap.get(ch.codePointAt(0) as number), `lost ${ch}`);
	assert.equal(cmap.size, 5);
});

test("subsetTTF: a subset of a subset is still valid (round trip)", () => {
	const out = subsetTTF(subsetTTF(src, CLOCK), "0:");
	const cmap = unicodes(out);
	assert.ok(cmap.get(0x30) && cmap.get(0x3a));
	assert.equal(cmap.size, 2);
});

// ---- fail loud (the fontcheck contract) ----

test("subsetTTF: a character the face cannot draw is a BUILD ERROR listing them all", () => {
	// silently substituting .notdef ships boxes to the watch with nothing in the
	// build log — the exact silent-blank class gotcha 20 exists to kill
	assert.throws(
		() => subsetTTF(src, "0☃1★"),
		(e: Error) =>
			/no glyph for/.test(e.message) && /U\+2603/.test(e.message) && /U\+2605/.test(e.message),
	);
	// non-BMP is reported the same way — a format-4 cmap cannot carry it
	assert.throws(() => subsetTTF(src, "\u{1F600}"), /U\+1F600/);
});

test("subsetTTF: rejects a CFF/OTTO font and a face with no format-4 cmap", () => {
	const otto = new Uint8Array(src);
	dv(otto).setUint32(0, 0x4f54544f); // "OTTO"
	assert.throws(() => subsetTTF(otto, "0"), /not a TrueType \(glyf\) font/);

	// blind every cmap subtable's format word — nothing left to read
	const blind = new Uint8Array(src);
	const f = dv(blind);
	const c = (dir(blind).get("cmap") as { off: number }).off;
	for (let i = 0, n = f.getUint16(c + 2); i < n; i++)
		f.setUint16(c + f.getUint32(c + 4 + i * 8 + 4), 6);
	assert.throws(() => subsetTTF(blind, "0"), /no format-4 \(BMP\) unicode cmap/);
});

test("subsetTTF: a missing required table names the table", () => {
	assert.throws(() => subsetTTF(retag(src, "glyf", "zzzz"), "0"), /no `glyf` table/);
});

test("subsetTTF: optional tables the face does not have are simply absent", () => {
	// KEEP is a wishlist, not a requirement — a face with no `gasp` must subset
	assert.ok(!dir(subsetTTF(retag(src, "gasp", "zzzz"), CLOCK)).has("gasp"));
});

// ---- spec arithmetic the real face cannot exercise ----

test("components: every arg/transform encoding advances by the right record size", () => {
	// Liberation Serif's 1,069 composites use NO scale flags, so the three
	// transform encodings below are unreachable from any real subset — and a
	// wrong size here silently reads the NEXT record's bytes as a glyph id,
	// dragging a random glyph into the subset (or throwing on a bad remap).
	const g = new Uint8Array(64);
	const v = new DataView(g.buffer);
	v.setInt16(0, -1); // composite
	// [0] byte args + MORE            -> record is 6 bytes
	v.setUint16(10, 0x0020);
	v.setUint16(12, 11);
	// [1] word args + scale + MORE    -> 8 + 2
	v.setUint16(16, 0x0001 | 0x0008 | 0x0020);
	v.setUint16(18, 22);
	// [2] byte args + x&y scale + MORE-> 6 + 4
	v.setUint16(26, 0x0040 | 0x0020);
	v.setUint16(28, 33);
	// [3] byte args + 2x2, LAST       -> 6 + 8
	v.setUint16(36, 0x0080);
	v.setUint16(38, 44);
	assert.deepEqual(components(v, 0), [
		[12, 11],
		[18, 22],
		[28, 33],
		[38, 44],
	]);
});

test("locaAt: the SHORT loca format stores offset/2", () => {
	// Liberation Serif is long-format; a short-format face read without the
	// doubling lands mid-glyph and rasterizes shredded outlines
	const b = new Uint8Array(8);
	const v = new DataView(b.buffer);
	v.setUint16(2, 0x1234);
	assert.equal(locaAt(v, 0, false, 1), 0x2468);
	v.setUint32(4, 0x9abc);
	assert.equal(locaAt(v, 0, true, 1), 0x9abc);
});

test("hMetric: glyphs past numberOfHMetrics reuse the LAST advance", () => {
	// the monospace-tail compression. Liberation Serif stores a long metric for
	// every glyph, so only a hand-built table reaches the compressed branch —
	// and reading it as a long metric walks off the end of hmtx.
	const b = new Uint8Array(16);
	const v = new DataView(b.buffer);
	v.setUint16(0, 500);
	v.setInt16(2, 10);
	v.setUint16(4, 700);
	v.setInt16(6, 20); // last long metric (numH = 2)
	v.setInt16(8, -30); // lsb-only entry for glyph 2
	assert.deepEqual(hMetric(v, 0, 2, 1), [700, 20]);
	assert.deepEqual(hMetric(v, 0, 2, 2), [700, -30]);
});

// ---- the fonts.json declaration ----

test("readFontSpec: no fonts.json means no subsetting", () => {
	assert.equal(readFontSpec(tmp()).size, 0);
});

test("readFontSpec: reads both declaration forms", () => {
	const d = tmp();
	writeFileSync(
		join(d, "fonts.json"),
		JSON.stringify({ A: { characters: "01" }, B: { characterRegex: "[0-9]" } }),
	);
	const spec = readFontSpec(d);
	assert.equal(spec.get("A")?.characters, "01");
	assert.equal(spec.get("B")?.characterRegex, "[0-9]");
});

test("readFontSpec: a malformed declaration fails the build", () => {
	// a typo'd key that quietly shipped the whole 370KB face is a 40x silent
	// regression — the declaration is the contract, so validate it
	for (const bad of [null, "0123456789:", {}, { characters: "0", characterRegex: "[0-9]" }]) {
		const d = tmp();
		writeFileSync(join(d, "fonts.json"), JSON.stringify({ [FACE]: bad }));
		assert.throws(() => readFontSpec(d), /exactly one of "characters" \/ "characterRegex"/);
	}
});

test("resolveChars: characters is literal; characterRegex filters the face's COVERAGE", () => {
	assert.equal(resolveChars(src, { characters: CLOCK }, FACE), CLOCK);
	// react-pebble's semantics: the regex selects from what the face can draw
	assert.equal(resolveChars(src, { characterRegex: "[0-9:]" }, FACE), CLOCK);
	// ...so it can reach glyphs no ASCII default would ever include
	assert.ok(resolveChars(src, { characterRegex: "\\p{Script=Greek}" }, FACE).includes("Ω"));
});

test("resolveChars: a regex that matches nothing fails loud", () => {
	assert.throws(
		() => resolveChars(src, { characterRegex: "\\p{Script=Han}" }, FACE),
		/matched nothing in LiberationSerif-Bold's \d+-character coverage/,
	);
});

// ---- the manifest wiring ----

test("subsetFonts: rewrites a declared face's entry and writes the subset ttf", () => {
	const root = tmp();
	const fontDir = join(root, "fonts");
	const outDir = join(root, "build", "fonts");
	mkdirSync(fontDir, { recursive: true });
	writeFileSync(join(fontDir, `${FACE}.ttf`), src);
	writeFileSync(join(fontDir, "fonts.json"), JSON.stringify({ [FACE]: { characters: CLOCK } }));

	const out = subsetFonts(
		[
			{ source: `../tsx/examples/fontface/fonts/${FACE}`, size: 32, characters: "  ASCII  " },
			{ source: `../tsx/examples/fontface/fonts/${FACE}`, size: 18, characters: "  ASCII  " },
			{ source: "../tsx/examples/fontface/fonts/Other-Regular", size: 20, characters: "ab" },
		],
		fontDir,
		outDir,
	);
	// the declared face repoints at the build dir — RELATIVE to the manifest,
	// which lives in outDir's parent — and carries the subset's own character set
	assert.deepEqual(out[0], { source: `./fonts/${FACE}`, size: 32, characters: CLOCK });
	// a second size of the same face shares the one subset file
	assert.deepEqual(out[1], { source: `./fonts/${FACE}`, size: 18, characters: CLOCK });
	// an UNDECLARED face is untouched — opt-in, so nothing regresses by default
	assert.deepEqual(out[2], {
		source: "../tsx/examples/fontface/fonts/Other-Regular",
		size: 20,
		characters: "ab",
	});
	const written = readFileSync(join(outDir, `${FACE}.ttf`));
	assert.ok(written.length < src.length / 20);
	assert.deepEqual(written, Buffer.from(subsetTTF(src, CLOCK)));
});

test("subsetFonts: no fonts.json -> the entries pass through untouched", () => {
	const d = tmp();
	const entries = [{ source: `f/${FACE}`, size: 32, characters: "abc" }];
	assert.equal(subsetFonts(entries, d, join(d, "out")), entries);
	assert.ok(!existsSync(join(d, "out")));
});

// ---- the wired-up example ----

test("fontface's shipped fonts.json subsets the face it actually declares", () => {
	// the example is the receipt: its declaration must name a face that exists
	// and every character it asks for must be drawable, or the build breaks
	const spec = readFontSpec("src/tsx/examples/fontface/fonts");
	assert.equal(spec.get(FACE)?.characters, CLOCK);
	const out = subsetTTF(src, resolveChars(src, spec.get(FACE) as { characters: string }, FACE));
	assert.ok(out.length < 10_000, `${out.length} B — the CHANGELOG receipt is stale`);
});
