// Derive the mod manifest's image/vector resources from the app source, so an
// app bundles exactly the assets it names and nothing else. Ported from the
// Python heredoc in build.mts to a testable TypeScript module (Node runs .mts
// natively via type-stripping — no compile step).
//
//  - bitmaps: every `new Texture("x.png")` -> resources["*"] += ../../assets/x
//    (the png2bmp pipeline; the .png extension is optional in the source).
//  - vectors: every referenced `*.pdc` -> data["*"] += ../../assets/x.pdc
//    (read on the watch via `new Resource("x.pdc")`, the SVGImage route).
//  - CUSTOM FONTS: every `font:` literal whose family is NOT a system font,
//    with a matching TTF at src/tsx/examples/<app>/fonts/<Family>-<Suffix>.ttf
//    -> resources["*-alpha"] += { source, size, characters } — mcrun
//    rasterizes the TTF into <Family>-<Suffix>-<size>.fnt + .png at build,
//    exactly what the port's PiuStyleLookupFont falls back to when
//    modFindPebbleFont misses (the `words` example's mechanism). <Suffix>
//    mirrors that lookup: bold -> Bold, italic -> Italic, both ->
//    BoldItalic, neither -> Regular.
//
// Usage (CLI): node tools/gen-manifest.mts <appSrc> <manifestPath>
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

/** A "*-alpha" font resource entry (mcrun's TTF -> .fnt/.png rasterizer). */
export interface FontEntry {
	source: string;
	size: number;
	characters: string;
}

interface Manifest {
	modules?: Record<string, string>;
	preload?: string[];
	resources?: { "*"?: string[]; "*-alpha"?: (string | FontEntry)[] };
	// beyond "*", a hand-written base may carry platform-qualified keys — the
	// derive step must union into "*" and leave the siblings alone
	data?: { "*"?: string[]; [k: string]: unknown };
	[k: string]: unknown;
}

// Full printable ASCII — generic default. Each glyph costs atlas pixels in
// FLASH (not arena), so a tighter `characters` set is a size optimization,
// not a correctness one; revisit if a face ever needs the flash back.
const ASCII =
	" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

/**
 * Derive "*-alpha" font entries from the app source's `font:` literals.
 * `ttfs` = available TTF paths (as the manifest should reference them, WITH
 * the .ttf extension); only literals whose <Family>-<Suffix> matches one are
 * emitted — everything else is presumed a system font (fontcheck's job).
 * Pure.
 */
export function deriveFonts(src: string, ttfs: string[]): FontEntry[] {
	src = stripComments(src);
	const out: FontEntry[] = [];
	// style tokens in ANY order (same tolerance as fontcheck's badFonts —
	// "bold italic" and "italic bold" name the same BoldItalic face); all
	// three quote styles — a backtick `font: \`20px Fam\`` hands the runtime
	// a plain string and must ship its face like the quoted forms (codex P2).
	// The KEY grammar covers equivalent JS spellings — `"font":` / `'font':`
	// and `font :` reach the runtime as the same dictionary key, and missing
	// them shipped no TTF while fontcheck (same grammar) never rejected the
	// literal: silent blank render (codex P2). The lookbehind keeps `myfont:`
	// from matching — that key is not a Piu Style font.
	for (const m of src.matchAll(
		/(?<![\w$])["']?font["']?\s*:\s*["'`]((?:(?:italic|bold)\s+)*)(\d+)px\s+(\w+)["'`]/g,
	)) {
		const italic = /\bitalic\b/.test(m[1]);
		const bold = /\bbold\b/.test(m[1]);
		const suffix = bold && italic ? "BoldItalic" : bold ? "Bold" : italic ? "Italic" : "Regular";
		const ttf = ttfs.find((t) => t.endsWith(`/${m[3]}-${suffix}.ttf`));
		if (!ttf) continue;
		const source = ttf.slice(0, -4); // manifest wants the path sans .ttf
		const size = Number(m[2]);
		if (!out.some((e) => e.source === source && e.size === size))
			out.push({ source, size, characters: ASCII });
	}
	return out;
}

const uniq = (xs: string[]): string[] => [...new Set(xs)];

/**
 * Strip `//` and block comments, but NOT sequences that live INSIDE a string or
 * template literal. A naive line-comment regex ate the `//` in
 * `const u = "https://api"; new Texture("ball0.png")` and dropped everything
 * after it on the line — so the texture never reached the manifest and the
 * device failed to resolve it (codex P2). Quote-state walk with escape handling;
 * a backtick literal is treated whole (a `//` inside `${…}` is preserved, the
 * safe direction — worst case we keep code, never drop a resource). Pure.
 */
export function stripComments(src: string): string {
	let out = "";
	let quote = ""; // "" = code; else the closing char of the open string
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (quote) {
			out += c;
			if (c === "\\") {
				if (i + 1 < src.length) out += src[++i]; // copy the escaped char verbatim
			} else if (c === quote) quote = "";
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			quote = c;
			out += c;
		} else if (c === "/" && src[i + 1] === "/") {
			while (i < src.length && src[i] !== "\n") i++;
			if (i < src.length) out += "\n"; // keep the newline the loop consumed
		} else if (c === "/" && src[i + 1] === "*") {
			i += 2;
			while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
			i++; // land on the trailing '/'
		} else out += c;
	}
	return out;
}

/**
 * Every `new Texture("…")` STRING-arg literal whose path does NOT end in
 * `.png` (empty = all valid). The Pebble Texture constructor only resolves the
 * `.bm4` pair when the path ends in `.png` — `new Texture("ball0")` throws
 * `Texture ball0 not found!` ON DEVICE (README gotcha 19, measured), yet
 * deriveResources tolerantly ships `../../assets/ball0` either way: the
 * mismatch is silent at build and fatal at runtime. Fail loud at build like
 * fontcheck (gotcha 20). Comments stripped; substitution templates (`$`)
 * excluded — the runtime string is computed, not this literal. Pure.
 */
export function badTextures(src: string): string[] {
	src = stripComments(src);
	const bad: string[] = [];
	for (const m of src.matchAll(/new\s+Texture\(\s*["'`]([^"'`$]+?)["'`]/g))
		if (!m[1].endsWith(".png")) bad.push(m[0]);
	return bad;
}

/** Return the manifest with resources/data derived from `src`. Pure. */
export function deriveResources(src: string, manifest: Manifest): Manifest {
	const m: Manifest = { ...manifest };
	// comments off first — a commented-out `new Texture(...)` must not ship a
	// phantom resource (same strip build.mts's lazy-import scan uses)
	src = stripComments(src);
	// `new Texture("x.png")` / `new Texture('x')` / a no-substitution backtick
	// literal — .png optional. `$` is excluded so a substitution template never
	// ships a phantom `${name}` resource (the runtime receives a plain string
	// for the no-substitution form; codex P2).
	const tex = [...src.matchAll(/new\s+Texture\(\s*["'`]([^"'`$]+?)(?:\.png)?["'`]/g)].map(
		(x) => x[1],
	);
	// Bare-name `"x.png"` STRING literals — the ergonomic media components
	// (`<Image src="logo.png"/>`, `<ImageBackground src="bg.png"/>`) build their
	// Texture from a variable INSIDE runtime/image, so the app never writes a
	// scannable `new Texture(...)` literal; the only literal is the `.png` prop.
	// Scan those like the `.pdc` rule below (any such literal ships the asset) so
	// the bitmap reaches the mod. Exclude `/` and `:` — a bare asset filename
	// never carries either, but a path or `http://…/x.png` URL would, and must
	// not ship a phantom `../../assets/http:/…` entry. `.png` stripped for the
	// png2bmp `<name>-color.bm4` resource name (same as the Texture path, so
	// `new Texture("ball0.png")` dedupes against its bare-scan twin below).
	const png = [...src.matchAll(/["'`]([^"'`$:/]+?)\.png["'`]/g)].map((x) => x[1]);
	// UNION with anything a custom manifest.base already carries — assigning
	// wholesale clobbered a consumer's hand-added entries (review finding P8)
	const prevRes = (m.resources && m.resources["*"]) || [];
	if (tex.length || png.length || prevRes.length)
		// spread keeps sibling keys ("*-alpha" font entries) intact
		m.resources = {
			...m.resources,
			"*": uniq([
				...prevRes,
				...tex.map((n) => `../../assets/${n}`),
				...png.map((n) => `../../assets/${n}`),
			]),
		};
	// any referenced `*.pdc` file, plus any romTable("<name>") blob (the
	// packed string tables written by tools/pack-table.mts) — all three quote
	// styles, substitution templates excluded (same rule as Texture above)
	const pdc = [...src.matchAll(/["'`]([^"'`$]+?\.pdc)["'`]/g)].map((x) => x[1]);
	const tbl = [...src.matchAll(/romTable\(\s*["'`]([^"'`$]+)["'`]/g)].map((x) => x[1]);
	// literal `new Resource("strings.dat")` data files — the documented
	// static-data path. Only `.pdc` strings were scanned, so a non-.pdc
	// Resource file was omitted from the manifest and the device lookup failed
	// (codex P2). Any extension counts (`.dat`, `.bin`, …); a `.pdc` here is
	// deduped against the scan above. Substitution templates excluded ($-rule).
	const res = [...src.matchAll(/new\s+Resource\(\s*["'`]([^"'`$]+?)["'`]/g)].map((x) => x[1]);
	const data = uniq([...pdc, ...tbl, ...res]);
	const prevData = (m.data && m.data["*"]) || [];
	if (data.length || prevData.length)
		// spread keeps sibling keys a hand-written manifest.base may carry
		// (platform-qualified data entries) — same union rule as resources
		m.data = { ...m.data, "*": uniq([...prevData, ...data.map((n) => `../../assets/${n}`)]) };
	return m;
}

if (import.meta.main) {
	// extra args = MORE source files (the entry's bundled ./helpers + lazy
	// screens) — their Texture/pdc/romTable refs must ship too (finding P2)
	const [appSrc, manifestPath, ...moreSrcs] = process.argv.slice(2);
	const src = [appSrc, ...moreSrcs].map((p) => readFileSync(p, "utf8")).join("\n");
	// Texture footgun-catch (gotcha 19 — a suffixless `new Texture("x")` ships
	// the asset but throws "Texture x not found!" on device). Fail loud before
	// writing the manifest, exactly like fontcheck's blank-render catch.
	const badTex = badTextures(src);
	if (badTex.length) {
		console.error('TEXTURE FAIL (gotcha 19 — `new Texture("x")` throws "not found!" on device):');
		for (const b of badTex)
			console.error(`  ${b}  <- name needs the .png suffix (new Texture("x.png"))`);
		process.exit(1);
	}
	const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	let out = deriveResources(src, m);
	// custom fonts: TTFs under src/tsx/examples/<app>/fonts/, referenced
	// relative to the manifest's directory (src/embeddedjs/)
	const app = appSrc.replace(/^.*\/([\w-]+)\.tsx$/, "$1");
	const fontDir = `src/tsx/examples/${app}/fonts`;
	const ttfs = existsSync(fontDir)
		? readdirSync(fontDir)
				.filter((f) => f.endsWith(".ttf"))
				.map((f) => `../tsx/examples/${app}/fonts/${f}`)
		: [];
	const fonts = deriveFonts(src, ttfs);
	if (fonts.length) {
		const prev = out.resources?.["*-alpha"] || [];
		out = { ...out, resources: { ...out.resources, "*-alpha": [...prev, ...fonts] } };
		for (const f of fonts) console.log(`font: ${f.source}.ttf @${f.size}px -> .fnt/.png (flash)`);
	}
	// only rewrite when something changed (match the Python's `changed` guard)
	if (out.resources || out.data)
		writeFileSync(manifestPath, `${JSON.stringify(out, null, "\t")}\n`);
}
