// Font sanity check (gotcha 20): an invalid font string renders NOTHING — blank
// text, no error, hours lost. Validate every `font:` literal in the app source
// against the Pebble system-font table at COMPILE time and fail loud. Ported
// from build.mts's Python heredoc to a testable module. SKIP_FONTCHECK=1 (in
// build.mts) bypasses it for custom/new fonts.
//
// Usage (CLI): node tools/fontcheck.mts <fontsDir> <src...>  (exit 1 on a bad
// font). Scans EVERY app-closure source, not just the entry — a `font:` literal
// in a bundled helper or lazy screen ships to the device and renders blank the
// same way (build.mts passes the full closure, matching gen-manifest/lint-reads).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { stripComments } from "./gen-manifest.mts";

// Pebble system fonts reachable via piu "['bold '][N]px Family" strings, keyed
// "family|size|bold" — the full firmware table README §"gotchas" item 7
// documents (Gothic-Regular 9-36, Gothic-Bold 14-36, Bitham Black/Bold/
// Light/Medium, Roboto, DroidSerif, Leco), mapped through the shorthand's
// face rule: `bold` -> the -Bold face, no weight -> the
// Regular/Light/Medium face at that size. Seeding only the four Gothic
// sizes rejected documented built-ins like "36px Gothic" (codex P2).
const VALID = new Set<string>();
for (const n of [14, 18, 24, 28, 36]) {
	VALID.add(`gothic|${n}|false`);
	VALID.add(`gothic|${n}|true`);
}
for (const k of [
	"gothic|9|false", // Gothic-Regular 9 has no Bold twin
	// NB: "bold 30px Bitham" is NOT valid — MEASURED on gabbro (2026-07): the
	// runtime requests `Bitham-Bold-30.fnt`, which does NOT exist (the 30px
	// Bitham face is Black-only, and the shorthand cannot address it — there is
	// no Bitham-Bold-30 the way 42px has Bitham-Bold-42). It threw
	// `URIError: font not found: Bitham-Bold-30.fnt` at render() → crash screen.
	// So neither weight of 30px Bitham is accepted; use a Gothic size instead.
	"bitham|42|true",
	"bitham|18|false", // Bitham-Light
	"bitham|34|false", // Bitham-Light/Medium
	"bitham|42|false",
	"roboto|21|false",
	"roboto|49|true",
	"droid|28|true",
	"leco|42|false", // Leco-Regular
	"leco|20|true", // Leco-Bold 20/26/32/36/38
	"leco|26|true",
	"leco|32|true",
	"leco|36|true",
	"leco|38|true",
])
	VALID.add(k);

/**
 * Return the list of invalid `font:` literals in `src` (empty = all valid).
 * `customFaces` = the FACES actually backed by a shipped TTF, keyed
 * "Family|Suffix" EXACT-case (Suffix = Regular/Bold/Italic/BoldItalic,
 * deriveFonts' mapping — built from the fonts/ dir TTF basenames). Face
 * matching matters: family-only acceptance let `font: "italic 20px Fam"`
 * pass with only Fam-Regular.ttf shipped, while deriveFonts emits nothing
 * for the missing face — the text rendered BLANK (the audit's deferred gap,
 * re-raised by codex). Pure.
 */
export function badFonts(src: string, customFaces?: Set<string>): string[] {
	// comments off first — a commented-out example (`// font: "99px Fake"`)
	// must not fail the build (deriveFonts strips the same way; codex P2).
	// SHARED string-aware stripper: the old regex pair truncated a line at the
	// `//` inside a URL, so `{ endpoint: "https://host", font: "99px Fake" }`
	// lost its font literal and the invalid face escaped the gate entirely
	// (codex P2 — same defect class the manifest scan already fixed).
	src = stripComments(src);
	const bad: string[] = [];
	// style tokens in ANY order — "bold italic 42px X" and "italic bold 42px X"
	// are the same face request; a fixed italic-then-bold pattern let the
	// reversed order escape the scan entirely (audit TOOLS-1). Family =
	// letter-first word chars, so a digit-bearing custom family ("20px B612")
	// is SEEN and rejected when no TTF backs it — the old [A-Za-z]+ grammar
	// skipped the literal entirely and shipped a blank render (codex P2;
	// matches deriveFonts' family grammar). HYPHENS count: a face shipped as
	// `fonts/Source-Sans-Regular.ttf` is requested as `font: "20px Source-Sans"`,
	// and a `\w`-only capture matched neither here nor in deriveFonts — the TTF
	// was omitted AND the literal escaped validation (codex P2).
	// all three quote styles — a backtick literal reaches the runtime as the
	// same plain string (deriveFonts scans the same grammar). Key grammar
	// matches deriveFonts too: `"font":` / `font :` are the same dictionary
	// key at runtime, and a scan keyed to the exact `font:` text let those
	// spellings ship unvalidated (codex P2); lookbehind excludes `myfont:`.
	for (const m of src.matchAll(
		/(?<![\w$])["']?font["']?\s*:\s*["'`]((?:(?:italic|bold)\s+)*)(\d+)px\s+([A-Za-z][\w-]*)["'`]/g,
	)) {
		const italic = /\bitalic\b/.test(m[1]);
		const bold = /\bbold\b/.test(m[1]);
		const size = Number(m[2]);
		const famRaw = m[3];
		const fam = famRaw.toLowerCase();
		// the literal's face, by deriveFonts' suffix mapping — the TTF that
		// must exist for mcrun to rasterize this exact request. Matching is
		// CASE-SENSITIVE like deriveFonts' `<Family>-<Suffix>.ttf` lookup: a
		// lower-cased allowlist accepted `font: "20px fam"` against
		// Fam-Regular.ttf while deriveFonts shipped nothing for it — the
		// silent-blank class again (codex P2).
		const suffix = bold && italic ? "BoldItalic" : bold ? "Bold" : italic ? "Italic" : "Regular";
		if (customFaces?.has(`${famRaw}|${suffix}`)) continue; // face TTF ships — any size is legal
		// KNOWN custom family (compared case-insensitively) with a MISSING or
		// case-mismatched face: deriveFonts ships nothing for this literal —
		// the exact silent-blank class. Flag it.
		let famKnown = false;
		if (customFaces)
			for (const f of customFaces)
				if (f.slice(0, f.indexOf("|")).toLowerCase() === fam) {
					famKnown = true;
					break;
				}
		if (famKnown) {
			bad.push(m[0]);
			continue;
		}
		// system fonts are regular/bold ONLY — an `italic` on one renders blank
		if (italic || !VALID.has(`${fam}|${size}|${bold}`)) bad.push(m[0]);
	}
	return bad;
}

if (import.meta.main) {
	// arg 1: the app's fonts/ dir — its TTF basenames become the custom-family
	// allowlist (family = the part before the -Suffix); may not exist (no custom
	// fonts). args 2+: every app-closure source to scan.
	const fontsDir = process.argv[2];
	const srcFiles = process.argv.slice(3);
	// FACE allowlist "Family|Suffix" from <Family>-<Suffix>.ttf basenames,
	// EXACT case (deriveFonts matches the TTF path case-sensitively) —
	// a suffixless TTF is ignored (deriveFonts can never reference it either)
	const custom = new Set<string>();
	if (fontsDir && existsSync(fontsDir))
		for (const f of readdirSync(fontsDir)) {
			const mm = /^(.+)-(\w+)\.ttf$/.exec(f);
			if (mm) custom.add(`${mm[1]}|${mm[2]}`);
		}
	const bad: string[] = [];
	for (const f of srcFiles)
		if (existsSync(f))
			for (const b of badFonts(readFileSync(f, "utf8"), custom)) bad.push(`${f}: ${b}`);
	if (bad.length) {
		console.error("FONTCHECK FAIL (gotcha 20 — invalid font renders BLANK, no error):");
		for (const b of bad) console.error(`  ${b}  <- not a Pebble system font key`);
		console.error("  valid: [bold] 14|18|24|28px Gothic, [bold] 42px Bitham,");
		console.error(
			"         21px Roboto, bold 49px Roboto, bold 28px Droid  (SKIP_FONTCHECK=1 to override,",
		);
		console.error("         or ship a TTF at src/tsx/examples/<app>/fonts/<Family>-<Suffix>.ttf)");
		process.exit(1);
	}
}
