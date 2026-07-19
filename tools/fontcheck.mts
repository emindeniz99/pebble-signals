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

/**
 * Return the list of invalid `font:` literals in `src` (empty = all valid).
 * `customFamilies` = families backed by a shipped TTF (the fonts/ convention,
 * see gen-manifest's deriveFonts) — any size/weight of those is legal, the
 * rasterizer builds exactly what the literal asks for. Pure.
 */
export function badFonts(src: string, customFamilies?: Set<string>): string[] {
	const bad: string[] = [];
	// style tokens in ANY order — "bold italic 42px X" and "italic bold 42px X"
	// are the same face request; a fixed italic-then-bold pattern let the
	// reversed order escape the scan entirely (audit TOOLS-1). Family =
	// letter-first word chars, so a digit-bearing custom family ("20px B612")
	// is SEEN and rejected when no TTF backs it — the old [A-Za-z]+ grammar
	// skipped the literal entirely and shipped a blank render (codex P2;
	// matches deriveFonts' \w+ family grammar).
	for (const m of src.matchAll(
		/font:\s*["']((?:(?:italic|bold)\s+)*)(\d+)px\s+([A-Za-z]\w*)["']/g,
	)) {
		const italic = /\bitalic\b/.test(m[1]);
		const bold = /\bbold\b/.test(m[1]);
		const size = Number(m[2]);
		const fam = m[3].toLowerCase();
		// a TTF-backed custom family may carry any face (the italic/bold face
		// resolution is the rasterizer's job); system fonts are regular/bold
		// ONLY, so an `italic` on one is invalid and renders blank.
		if (customFamilies?.has(fam)) continue;
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
	const custom = new Set<string>();
	if (fontsDir && existsSync(fontsDir))
		for (const f of readdirSync(fontsDir))
			if (f.endsWith(".ttf")) custom.add(f.replace(/-\w+\.ttf$/, "").toLowerCase());
	const bad: string[] = [];
	for (const f of srcFiles)
		if (existsSync(f))
			for (const b of badFonts(readFileSync(f, "utf8"), custom)) bad.push(`${f}: ${b}`);
	if (bad.length) {
		console.error("FONTCHECK FAIL (gotcha 20 — invalid font renders BLANK, no error):");
		for (const b of bad) console.error(`  ${b}  <- not a Pebble system font key`);
		console.error("  valid: [bold] 14|18|24|28px Gothic, bold 30px Bitham, [bold] 42px Bitham,");
		console.error(
			"         21px Roboto, bold 49px Roboto, bold 28px Droid  (SKIP_FONTCHECK=1 to override,",
		);
		console.error("         or ship a TTF at src/tsx/examples/<app>/fonts/<Family>-<Suffix>.ttf)");
		process.exit(1);
	}
}
