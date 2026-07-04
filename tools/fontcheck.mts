// Font sanity check (gotcha 20): an invalid font string renders NOTHING — blank
// text, no error, hours lost. Validate every `font:` literal in the app source
// against the Pebble system-font table at COMPILE time and fail loud. Ported
// from build.mts's Python heredoc to a testable module. SKIP_FONTCHECK=1 (in
// build.mts) bypasses it for custom/new fonts.
//
// Usage (CLI): node tools/fontcheck.mts <appSrc>   (exit 1 on a bad font)
import { readFileSync } from "node:fs";

// Pebble system fonts reachable via piu "['bold '][N]px Family" strings, keyed
// "family|size|bold" — from the official FONT_KEY_* table.
const VALID = new Set<string>();
for (const n of [14, 18, 24, 28]) {
	VALID.add(`gothic|${n}|false`);
	VALID.add(`gothic|${n}|true`);
}
for (const k of [
	"bitham|30|true",
	"bitham|42|true",
	"bitham|42|false",
	"roboto|21|false",
	"roboto|49|true",
	"droid|28|true",
])
	VALID.add(k);

/** Return the list of invalid `font:` literals in `src` (empty = all valid). Pure. */
export function badFonts(src: string): string[] {
	const bad: string[] = [];
	for (const m of src.matchAll(/font:\s*["'](?:(bold)\s+)?(\d+)px\s+([A-Za-z]+)["']/g)) {
		const bold = m[1] != null;
		const size = Number(m[2]);
		const fam = m[3].toLowerCase();
		if (!VALID.has(`${fam}|${size}|${bold}`)) bad.push(m[0]);
	}
	return bad;
}

if (import.meta.main) {
	const src = readFileSync(process.argv[2], "utf8");
	const bad = badFonts(src);
	if (bad.length) {
		console.error("FONTCHECK FAIL (gotcha 20 — invalid font renders BLANK, no error):");
		for (const b of bad) console.error(`  ${b}  <- not a Pebble system font key`);
		console.error("  valid: [bold] 14|18|24|28px Gothic, bold 30px Bitham, [bold] 42px Bitham,");
		console.error(
			"         21px Roboto, bold 49px Roboto, bold 28px Droid  (SKIP_FONTCHECK=1 to override)",
		);
		process.exit(1);
	}
}
