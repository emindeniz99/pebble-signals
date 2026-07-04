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
	// `new Texture("x.png")` or `new Texture('x')` — .png optional
	const tex = [...src.matchAll(/new\s+Texture\(\s*["']([^"']+?)(?:\.png)?["']/g)].map((x) => x[1]);
	if (tex.length) m.resources = { "*": uniq(tex).map((n) => `../../assets/${n}`) };
	// any referenced `*.pdc` file, plus any romTable("<name>") blob (the
	// packed string tables written by tools/pack-table.mts)
	const pdc = [...src.matchAll(/["']([^"']+?\.pdc)["']/g)].map((x) => x[1]);
	const tbl = [...src.matchAll(/romTable\(\s*["']([^"']+)["']/g)].map((x) => x[1]);
	const data = uniq([...pdc, ...tbl]);
	if (data.length) m.data = { "*": data.map((n) => `../../assets/${n}`) };
	return m;
}

if (import.meta.main) {
	const [appSrc, manifestPath] = process.argv.slice(2);
	const src = readFileSync(appSrc, "utf8");
	const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
	const out = deriveResources(src, m);
	// only rewrite when something changed (match the Python's `changed` guard)
	if (out.resources || out.data)
		writeFileSync(manifestPath, `${JSON.stringify(out, null, "\t")}\n`);
}
