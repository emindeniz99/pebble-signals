// TTF SUBSETTING — ship the glyphs an app DRAWS, not the 2,602 a face happens
// to carry (competitive gap #11: react-pebble has `characterRegex`; we shipped
// whole 370KB TTFs into a device whose whole mod archive lives in flash).
// Opt-in, per face, via a `fonts.json` beside the TTFs:
//
//   src/tsx/examples/<app>/fonts/fonts.json
//   { "LiberationSerif-Bold": { "characters": "0123456789:" } }
//   { "LiberationSerif-Bold": { "characterRegex": "[0-9:]" } }   // the other form
//
// WHERE this sits in the pipeline matters: the manifest's `"*-alpha"` entry
// names a TTF and the toolchain's fontbm rasterizes THAT file into
// `<Family>-<Suffix>-<size>.fnt` + `.png` at build time. So the trim has to
// happen BEFORE the manifest is written — gen-manifest writes the subset into
// the build dir and repoints `source` at it, and fontbm never sees the fat
// original. A face with no fonts.json line passes through untouched (the
// full-ASCII default is unchanged).
//
// Zero dependencies, on purpose. The subsetter is ~200 lines of sfnt table
// arithmetic and this package has no npm RUNTIME deps — a devDep would not be
// installed in a CONSUMER's tree (devDeps of a dependency never are), and
// tools/ ships in the tarball and RUNS there, so a lib import would fail the
// build for exactly the people the feature is for.
//
// Scope, stated loud: glyf-outline TrueType with a format-4 (BMP) unicode
// cmap. CFF/OTTO and non-BMP codepoints are rejected with a message, never
// silently mangled.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { FontEntry } from "./gen-manifest.mts";

/** A per-face subset declaration from `fonts.json`. Exactly one field. */
export interface SubsetDecl {
	/** Literal character set to keep, e.g. `"0123456789:"`. */
	characters?: string;
	/** Regex SOURCE (no delimiters/flags); keeps every covered char it matches. */
	characterRegex?: string;
}

// Tables copied through UNTOUCHED — not one of them is indexed by glyph id, so
// a remap cannot invalidate them, and the hinting ones (cvt/fpgm/prep) are what
// keeps a 32px face legible on a 1-bit-ish watch panel. Everything NOT listed
// here and not rebuilt below is DROPPED: GSUB/GPOS/GDEF/kern/FFTM all address
// glyphs by id and would point at glyphs that no longer exist.
const KEEP = ["OS/2", "cvt ", "fpgm", "gasp", "name", "prep"];

interface Table {
	off: number;
	len: number;
}

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
/** Copy a byte range OUT of the source — `Buffer.slice` aliases, and the
 * composite-id rewrite below mutates what it gets. */
const grab = (b: Uint8Array, off: number, len: number): Uint8Array =>
	new Uint8Array(b.subarray(off, off + len));
const named = (c: number): string =>
	`${JSON.stringify(String.fromCodePoint(c))} (U+${c.toString(16).toUpperCase().padStart(4, "0")})`;

/** The sfnt table directory, keyed by 4-char tag. */
function tableDir(f: DataView, b: Uint8Array): Map<string, Table> {
	const ver = f.getUint32(0);
	// 0x00010000 and "true" are the glyf-outline sfnt versions. "OTTO" is CFF
	// (PostScript outlines) — a different outline table entirely, and every
	// rewrite below is glyf/loca arithmetic that does not apply to it.
	if (ver !== 0x00010000 && ver !== 0x74727565)
		throw new Error(
			`fontsubset: not a TrueType (glyf) font — sfnt version 0x${ver.toString(16)}; CFF/OTTO is not supported`,
		);
	const out = new Map<string, Table>();
	for (let i = 0, o = 12, n = f.getUint16(4); i < n; i++, o += 16)
		out.set(String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]), {
			off: f.getUint32(o + 8),
			len: f.getUint32(o + 12),
		});
	return out;
}

/** A table the subset arithmetic cannot proceed without. Fail loud, not with a
 * `TypeError: undefined` fifty lines later. */
function req(t: Map<string, Table>, tag: string): Table {
	const x = t.get(tag);
	if (!x) throw new Error(`fontsubset: TTF has no \`${tag}\` table`);
	return x;
}

/**
 * Absolute offset of the face's format-4 unicode cmap subtable. A (3,1)
 * Windows-BMP subtable is THE canonical one; any other format-4 subtable is a
 * fallback. The sort is stable, so document order breaks a tie and the pick —
 * and therefore every output byte — is deterministic.
 */
function cmap4(f: DataView, cmapOff: number): number {
	const cand: [number, number][] = [];
	for (let i = 0, n = f.getUint16(cmapOff + 2); i < n; i++) {
		const rec = cmapOff + 4 + i * 8;
		const sub = cmapOff + f.getUint32(rec + 4);
		if (f.getUint16(sub) === 4) cand.push([f.getUint16(rec) === 3 ? 0 : 1, sub]);
	}
	if (!cand.length)
		throw new Error(
			"fontsubset: face has no format-4 (BMP) unicode cmap subtable — subsetting is BMP-only",
		);
	cand.sort((a, b) => a[0] - b[0]);
	return cand[0][1];
}

/** Every codepoint -> glyph id the format-4 subtable at `sub` maps. */
function cmapPairs(f: DataView, sub: number): Map<number, number> {
	const m = new Map<number, number>();
	const segX2 = f.getUint16(sub + 6);
	const endO = sub + 14;
	const startO = endO + segX2 + 2; // +2 = the reservedPad between the arrays
	const deltaO = startO + segX2;
	const rangeO = deltaO + segX2;
	for (let i = 0; i < segX2; i += 2) {
		const end = f.getUint16(endO + i);
		const start = f.getUint16(startO + i);
		const delta = f.getInt16(deltaO + i);
		const ro = f.getUint16(rangeO + i);
		for (let c = start; c <= end; c++) {
			let g: number;
			if (ro === 0) g = (c + delta) & 0xffff;
			else {
				// idRangeOffset is measured from ITS OWN slot, not the array base —
				// the single most-fumbled number in the whole format
				g = f.getUint16(rangeO + i + ro + (c - start) * 2);
				if (g) g = (g + delta) & 0xffff;
			}
			// gid 0 is .notdef, i.e. "not mapped" — this is also what swallows the
			// mandatory 0xFFFF terminator segment
			if (g) m.set(c, g);
		}
	}
	return m;
}

/**
 * Glyph `i`'s byte offset into `glyf`. `long` is `head.indexToLocFormat === 1`;
 * the SHORT form stores offset/2, so reading it without the doubling walks into
 * the middle of another glyph and rasterizes garbage.
 */
export function locaAt(f: DataView, locaOff: number, long: boolean, i: number): number {
	return long ? f.getUint32(locaOff + i * 4) : f.getUint16(locaOff + i * 2) * 2;
}

/**
 * Glyph `g`'s `[advanceWidth, leftSideBearing]` from `hmtx`. Past `numH`
 * (`hhea.numberOfHMetrics`) the table stops storing advances: every remaining
 * glyph REUSES the last advance and carries only its own lsb. Reading those as
 * long metrics runs off the end of the table and hands the rasterizer noise.
 */
export function hMetric(f: DataView, off: number, numH: number, g: number): [number, number] {
	if (g < numH) return [f.getUint16(off + g * 4), f.getInt16(off + g * 4 + 2)];
	return [f.getUint16(off + (numH - 1) * 4), f.getInt16(off + numH * 4 + (g - numH) * 2)];
}

/**
 * Every component record of the COMPOSITE glyph body at `at`, as
 * `[byte offset of its glyphIndex field, glyph id]`. ONE walker serves both
 * passes — the closure (which glyphs must ship) and the rewrite (patch the id
 * in place) — so the record-size arithmetic can never desync between them.
 * Caller has already established `numberOfContours < 0`.
 */
export function components(f: DataView, at: number): [number, number][] {
	const out: [number, number][] = [];
	let o = at + 10; // past numberOfContours and the four bbox shorts
	let more = true;
	while (more) {
		const flags = f.getUint16(o);
		out.push([o + 2, f.getUint16(o + 2)]);
		o += flags & 0x0001 ? 8 : 6; // ARG_1_AND_2_ARE_WORDS: two words, else two bytes
		if (flags & 0x0008)
			o += 2; // WE_HAVE_A_SCALE
		else if (flags & 0x0040)
			o += 4; // WE_HAVE_AN_X_AND_Y_SCALE
		else if (flags & 0x0080) o += 8; // WE_HAVE_A_TWO_BY_TWO
		more = (flags & 0x0020) !== 0; // MORE_COMPONENTS
	}
	return out;
}

/** sfnt table checksum: the big-endian uint32 sum over the PADDED table. */
function sum(v: DataView, off: number, len: number): number {
	let s = 0;
	for (let i = 0; i < len; i += 4) s = (s + v.getUint32(off + i)) >>> 0;
	return s;
}

/** Assemble a tag->bytes map into an sfnt file (directory tag-sorted, tables
 * 4-byte aligned, checksums filled in). Deterministic: no timestamps, no
 * insertion-order dependence, zero padding. */
function sfnt(tables: Map<string, Uint8Array>): Uint8Array {
	const tags = [...tables.keys()].sort();
	const n = tags.length;
	const pad4 = (x: number): number => (x + 3) & ~3;
	const offs = new Map<string, number>();
	let size = 12 + n * 16;
	for (const tag of tags) {
		offs.set(tag, size);
		size += pad4((tables.get(tag) as Uint8Array).length);
	}
	const out = new Uint8Array(size);
	const v = view(out);
	v.setUint32(0, 0x00010000);
	v.setUint16(4, n);
	const sr = 2 ** (31 - Math.clz32(n)) * 16;
	v.setUint16(6, sr);
	v.setUint16(8, 31 - Math.clz32(n));
	v.setUint16(10, n * 16 - sr);
	tags.forEach((tag, i) => {
		const d = tables.get(tag) as Uint8Array;
		const o = offs.get(tag) as number;
		out.set(d, o);
		const rec = 12 + i * 16;
		for (let k = 0; k < 4; k++) v.setUint8(rec + k, tag.charCodeAt(k));
		v.setUint32(rec + 4, sum(v, o, pad4(d.length)));
		v.setUint32(rec + 8, o);
		v.setUint32(rec + 12, d.length); // the UNPADDED length, per spec
	});
	// head.checkSumAdjustment = magic - checksum(whole file), computed with the
	// field itself zeroed (subsetTTF already zeroed it)
	v.setUint32((offs.get("head") as number) + 8, (0xb1b0afba - sum(v, 0, size)) >>> 0);
	return out;
}

/** Build a one-subtable (3,1) format-4 cmap from SORTED [codepoint, gid] pairs. */
function cmapTable(pairs: [number, number][]): Uint8Array {
	// contiguous CODE runs become segments; the ids go in glyphIdArray (the
	// idRangeOffset form) so a run whose glyph ids are NOT contiguous is still
	// one segment and there is no idDelta arithmetic to get wrong
	const starts: number[] = [];
	const ends: number[] = [];
	const ids: number[] = [];
	for (const [c, g] of pairs) {
		if (!ends.length || c !== ends[ends.length - 1] + 1) {
			starts.push(c);
			ends.push(c);
		} else ends[ends.length - 1] = c;
		ids.push(g);
	}
	starts.push(0xffff); // the mandatory terminator segment
	ends.push(0xffff);
	const n = starts.length;
	const len = 16 + n * 8 + ids.length * 2;
	const out = new Uint8Array(12 + len);
	const v = view(out);
	v.setUint16(2, 1); // one encoding record (version at 0 stays 0)
	v.setUint16(4, 3); // platform 3 (Windows)
	v.setUint16(6, 1); // encoding 1 (BMP)
	v.setUint32(8, 12); // subtable follows the record
	v.setUint16(12, 4); // format 4
	v.setUint16(14, len);
	v.setUint16(18, n * 2); // segCountX2 (language at 16 stays 0)
	const sr = 2 ** (31 - Math.clz32(n)) * 2;
	v.setUint16(20, sr);
	v.setUint16(22, 31 - Math.clz32(n));
	v.setUint16(24, n * 2 - sr);
	const endO = 26;
	const startO = endO + n * 2 + 2;
	const deltaO = startO + n * 2;
	const rangeO = deltaO + n * 2;
	let idx = 0;
	for (let i = 0; i < n; i++) {
		v.setUint16(endO + i * 2, ends[i]);
		v.setUint16(startO + i * 2, starts[i]);
		if (i === n - 1) {
			v.setUint16(deltaO + i * 2, 1); // terminator: 0xFFFF + 1 -> gid 0
			continue;
		}
		v.setUint16(rangeO + i * 2, (n - i) * 2 + idx * 2);
		for (let c = starts[i]; c <= ends[i]; c++, idx++)
			v.setUint16(rangeO + n * 2 + idx * 2, ids[idx]);
	}
	return out;
}

/**
 * Subset `ttf` down to `chars`. Returns a complete, spec-valid TTF carrying
 * `.notdef` plus one glyph per requested character (plus the components any of
 * them composes from). Deterministic — the same input bytes and character set
 * always produce the same output bytes.
 *
 * THROWS, listing every one of them, if a requested character has no glyph in
 * the face. That is the fontcheck rule applied to subsetting: a face that
 * silently drops a character renders `.notdef` boxes on the watch and nothing
 * anywhere says why.
 */
export function subsetTTF(ttf: Uint8Array, chars: string): Uint8Array {
	const f = view(ttf);
	const t = tableDir(f, ttf);
	const head = req(t, "head");
	const maxp = req(t, "maxp");
	const hhea = req(t, "hhea");
	const hmtx = req(t, "hmtx");
	const loca = req(t, "loca");
	const glyf = req(t, "glyf");
	const post = req(t, "post");
	const long = f.getInt16(head.off + 50) === 1; // indexToLocFormat
	const numH = f.getUint16(hhea.off + 34); // numberOfHMetrics
	const uni = cmapPairs(f, cmap4(f, req(t, "cmap").off));

	// requested codepoints, deduped and ordered (determinism). A character the
	// face cannot draw is FATAL; a non-BMP one lands here too, since a format-4
	// cmap cannot carry it.
	const cps = [...new Set([...chars].map((c) => c.codePointAt(0) as number))].sort((a, b) => a - b);
	const missing = cps.filter((c) => !uni.has(c));
	if (missing.length)
		throw new Error(`fontsubset: the face has no glyph for ${missing.map(named).join(", ")}`);

	// glyph closure: the requested glyphs, .notdef, and — transitively — every
	// glyph a COMPOSITE draws itself out of. Drop one component and the composed
	// form rasterizes blank.
	const keep = new Set<number>([0, ...cps.map((c) => uni.get(c) as number)]);
	const stack = [...keep];
	while (stack.length) {
		const g = stack.pop() as number;
		const s = locaAt(f, loca.off, long, g);
		if (locaAt(f, loca.off, long, g + 1) <= s) continue; // empty glyph (space)
		if (f.getInt16(glyf.off + s) >= 0) continue; // simple glyph — no refs
		for (const [, c] of components(f, glyf.off + s))
			if (!keep.has(c)) {
				keep.add(c);
				stack.push(c);
			}
	}
	const gids = [...keep].sort((a, b) => a - b); // gid 0 stays gid 0
	const remap = new Map(gids.map((g, i) => [g, i]));

	// glyf: bodies copied VERBATIM (outlines, hinting and all); only a
	// composite's component ids are patched to the new numbering. Each body is
	// padded to 4 bytes so loca offsets stay aligned.
	const bodies = gids.map((g) => {
		const s = locaAt(f, loca.off, long, g);
		const body = grab(ttf, glyf.off + s, locaAt(f, loca.off, long, g + 1) - s);
		if (body.length && f.getInt16(glyf.off + s) < 0) {
			const bf = view(body);
			for (const [at, c] of components(bf, 0)) bf.setUint16(at, remap.get(c) as number);
		}
		const padded = new Uint8Array((body.length + 3) & ~3);
		padded.set(body);
		return padded;
	});
	// LONG loca unconditionally: 2 extra bytes per glyph, and no chance of the
	// short form's "offset must be even and under 128KB" gamble. head's
	// indexToLocFormat is rewritten to match — a mismatch halves every offset.
	const locaOut = new Uint8Array((gids.length + 1) * 4);
	const lv = view(locaOut);
	let at = 0;
	bodies.forEach((b, i) => {
		lv.setUint32(i * 4, at);
		at += b.length;
	});
	lv.setUint32(bodies.length * 4, at);
	const glyfOut = new Uint8Array(at);
	at = 0;
	for (const b of bodies) {
		glyfOut.set(b, at);
		at += b.length;
	}

	// hmtx: ALL long metrics (hhea.numberOfHMetrics = the new glyph count), so
	// the tail-compression rule never has to be re-derived on the way out.
	const hmtxOut = new Uint8Array(gids.length * 4);
	const hv = view(hmtxOut);
	gids.forEach((g, i) => {
		const [aw, lsb] = hMetric(f, hmtx.off, numH, g);
		hv.setUint16(i * 4, aw);
		hv.setInt16(i * 4 + 2, lsb);
	});

	const headOut = grab(ttf, head.off, head.len);
	view(headOut).setUint32(8, 0); // checkSumAdjustment — filled over the FINAL file
	view(headOut).setInt16(50, 1); // indexToLocFormat: long
	const hheaOut = grab(ttf, hhea.off, hhea.len);
	view(hheaOut).setUint16(34, gids.length);
	const maxpOut = grab(ttf, maxp.off, maxp.len);
	view(maxpOut).setUint16(4, gids.length);
	// post 3.0 = "no glyph names". v2.0 carries a name per glyph id (26KB in
	// Liberation Serif) and every one of those ids is stale after a remap; the
	// rasterizer needs none of them, so keep the 32-byte header — italic angle
	// and underline metrics DO matter — and drop the name array.
	const postOut = grab(ttf, post.off, 32);
	view(postOut).setUint32(0, 0x00030000);

	const out = new Map<string, Uint8Array>([
		["cmap", cmapTable(cps.map((c) => [c, remap.get(uni.get(c) as number) as number]))],
		["glyf", glyfOut],
		["head", headOut],
		["hhea", hheaOut],
		["hmtx", hmtxOut],
		["loca", locaOut],
		["maxp", maxpOut],
		["post", postOut],
	]);
	for (const tag of KEEP) {
		const k = t.get(tag);
		if (k) out.set(tag, grab(ttf, k.off, k.len));
	}
	return sfnt(out);
}

/**
 * Read `<fontsDir>/fonts.json`. Absent = no subsetting declared (empty map).
 * A malformed entry is a BUILD ERROR, not a silent skip — a typo'd
 * `"charcters"` that quietly shipped the whole face is exactly the kind of
 * "worked, but not the way you asked" this repo refuses.
 */
export function readFontSpec(fontsDir: string): Map<string, SubsetDecl> {
	const spec = new Map<string, SubsetDecl>();
	const p = join(fontsDir, "fonts.json");
	if (!existsSync(p)) return spec;
	const ok = (d: unknown): d is SubsetDecl => {
		if (!d || typeof d !== "object") return false;
		// exactly one of the two — both set is an ambiguous request, neither is a typo
		return (
			(typeof (d as SubsetDecl).characters === "string") !==
			(typeof (d as SubsetDecl).characterRegex === "string")
		);
	};
	for (const [face, d] of Object.entries(JSON.parse(readFileSync(p, "utf8")) as object)) {
		if (!ok(d))
			throw new Error(
				`${p}: "${face}" needs exactly one of "characters" / "characterRegex" (string)`,
			);
		spec.set(face, d);
	}
	return spec;
}

/**
 * The character set `decl` asks for. `characters` is taken literally;
 * `characterRegex` is applied to the face's OWN cmap coverage (react-pebble's
 * semantics), sorted by codepoint so the result is deterministic. A regex that
 * matches nothing throws rather than shipping a one-glyph font.
 */
export function resolveChars(ttf: Uint8Array, decl: SubsetDecl, face: string): string {
	if (decl.characters !== undefined) return decl.characters;
	const f = view(ttf);
	const cov = [...cmapPairs(f, cmap4(f, req(tableDir(f, ttf), "cmap").off)).keys()].sort(
		(a, b) => a - b,
	);
	const re = new RegExp(decl.characterRegex as string, "u");
	const hit = cov.filter((c) => re.test(String.fromCodePoint(c)));
	if (!hit.length)
		throw new Error(
			`fontsubset: characterRegex /${decl.characterRegex}/ matched nothing in ${face}'s ${cov.length}-character coverage`,
		);
	return hit.map((c) => String.fromCodePoint(c)).join("");
}

/**
 * Rewrite deriveFonts' `"*-alpha"` entries to point at SUBSET TTFs.
 * `fontDir` is the app's `fonts/` dir on disk (fonts.json + the source TTFs);
 * `outDir` is the build dir the subsets are written to and MUST be a direct
 * child of the MANIFEST's own directory — the rewritten `source` is
 * `./<outDir basename>/<face>`, which is how mcconfig resolves it.
 *
 * A face with no declaration passes through untouched, and a face requested at
 * two sizes is subsetted once (both entries share the file and the character
 * set). Logs the byte delta — that receipt is the whole point of the feature.
 */
export function subsetFonts(fonts: FontEntry[], fontDir: string, outDir: string): FontEntry[] {
	const spec = readFontSpec(fontDir);
	if (!spec.size) return fonts;
	const done = new Map<string, string>(); // face -> its resolved character set
	return fonts.map((e) => {
		const face = e.source.slice(e.source.lastIndexOf("/") + 1);
		const decl = spec.get(face);
		if (!decl) return e;
		let chars = done.get(face);
		if (chars === undefined) {
			const src = readFileSync(join(fontDir, `${face}.ttf`));
			chars = resolveChars(src, decl, face);
			const sub = subsetTTF(src, chars);
			mkdirSync(outDir, { recursive: true });
			writeFileSync(join(outDir, `${face}.ttf`), sub);
			console.log(
				`font: subset ${face} to ${new Set([...chars]).size} chars — ${src.length} -> ${sub.length} B (-${Math.round((1 - sub.length / src.length) * 100)}%)`,
			);
			done.set(face, chars);
		}
		return { source: `./${basename(outDir)}/${face}`, size: e.size, characters: chars };
	});
}
