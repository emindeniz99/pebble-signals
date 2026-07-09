// Derive the mod manifest's image/vector resources from the app source, so an
// app bundles exactly the assets it names and nothing else. Ported from the
// Python heredoc in build.mts to a testable TypeScript module (Node runs .mts
// natively via type-stripping — no compile step).
//
//  - bitmaps: every `new Texture("x.png")` -> resources["*"] += ../../assets/x
//    (the png2bmp pipeline; the .png extension is optional in the source).
//  - vectors: every referenced `*.pdc` -> data["*"] += ../../assets/x.pdc
//    (read on the watch via `new Resource("x.pdc")`, the SVGImage route).
//
// Usage (CLI): node tools/gen-manifest.mts <appSrc> <manifestPath>
import { readFileSync, writeFileSync } from "node:fs";

interface Manifest {
	modules?: Record<string, string>;
	preload?: string[];
	resources?: { "*": string[] };
	data?: { "*": string[] };
	[k: string]: unknown;
}

const uniq = (xs: string[]): string[] => [...new Set(xs)];

/** Return the manifest with resources/data derived from `src`. Pure. */
export function deriveResources(src: string, manifest: Manifest): Manifest {
	const m: Manifest = { ...manifest };
	// comments off first — a commented-out `new Texture(...)` must not ship a
	// phantom resource (same strip build.mts's lazy-import scan uses)
	src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
	// `new Texture("x.png")` or `new Texture('x')` — .png optional
	const tex = [...src.matchAll(/new\s+Texture\(\s*["']([^"']+?)(?:\.png)?["']/g)].map((x) => x[1]);
	// UNION with anything a custom manifest.base already carries — assigning
	// wholesale clobbered a consumer's hand-added entries (review finding P8)
	const prevRes = (m.resources && m.resources["*"]) || [];
	if (tex.length || prevRes.length)
		m.resources = { "*": uniq([...prevRes, ...tex.map((n) => `../../assets/${n}`)]) };
	// any referenced `*.pdc` file, plus any romTable("<name>") blob (the
	// packed string tables written by tools/pack-table.mts)
	const pdc = [...src.matchAll(/["']([^"']+?\.pdc)["']/g)].map((x) => x[1]);
	const tbl = [...src.matchAll(/romTable\(\s*["']([^"']+)["']/g)].map((x) => x[1]);
	const data = uniq([...pdc, ...tbl]);
	const prevData = (m.data && m.data["*"]) || [];
	if (data.length || prevData.length)
		m.data = { "*": uniq([...prevData, ...data.map((n) => `../../assets/${n}`)]) };
	return m;
}

if (import.meta.main) {
	// extra args = MORE source files (the entry's bundled ./helpers + lazy
	// screens) — their Texture/pdc/romTable refs must ship too (finding P2)
	const [appSrc, manifestPath, ...moreSrcs] = process.argv.slice(2);
	const src = [appSrc, ...moreSrcs].map((p) => readFileSync(p, "utf8")).join("\n");
	const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	const out = deriveResources(src, m);
	// only rewrite when something changed (match the Python's `changed` guard)
	if (out.resources || out.data)
		writeFileSync(manifestPath, `${JSON.stringify(out, null, "\t")}\n`);
}
