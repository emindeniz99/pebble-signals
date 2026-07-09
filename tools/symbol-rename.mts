// Symbol diet — the export-rename pass (roadmap "data-to-Resource
// productize (b)"). Every symbol name in a mod archive that the FIRMWARE
// HOST does not already intern costs one boot slot: `fxMapArchive` walks the
// archive's SYMB atom at map time and adds each new-to-host name to the id
// table (playbook "The boot floor" — at a saturated app one extra symbol
// flips boot→silent death). A runtime module's EXPORT wire name (`jsx`,
// `useState`, `S`, …) is such a symbol: minification mangles the LOCAL name
// but the export/import boundary keeps the public spelling, which the host
// has never heard of.
//
// This pass rewrites those wire names — the `X` in `export{local as X}` and
// every matching `import{X as local}from"runtime/…"` — to a HOST-KNOWN name
// the firmware already interns, so no new id is added. It touches ONLY
// import/export specifier clauses; local identifiers and all executable code
// stay byte-identical, which is what makes it safe.
//
// Monotonic by construction: a wire name renamed to a host-known target frees
// its slot; if a target somehow were NOT host-known the symbol still resolves
// (same id on both sides) and merely keeps costing a slot as before — a
// no-op, never a break. The one real hazard, a target colliding with a real
// identifier, is ruled out per build: a candidate is skipped if its name
// appears as a token anywhere in the shipped bundle.
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

// Host-interned names (verified in the gabbro/emery 4.17 host key table via
// tools/host-symbols.py) that no UI app references — obscure Pico/Commodetto
// pixel-format + Math constants. Order is the assignment order; the pool is
// far larger than the ~15-20 runtime exports any app keeps.
export const SAFE_TARGETS = [
	"BGRA32",
	"CLUT16",
	"CLUT32",
	"Gray16",
	"Gray4",
	"RGB24",
	"RGB332",
	"RGB444",
	"RGBA32",
	"LOG10E",
	"LOG2E",
	"SQRT2",
	"QRCode",
	"SCHEME",
	"QUERY",
	"ORIGIN",
	"CLOSED",
	"Gray256",
	"SQRT1_2",
	"LN10",
	"LN2",
	"RLE",
] as const;

const RUNTIME = /^runtime\//;

export interface RenameResult {
	/** wire name -> host-known target actually applied */
	map: Record<string, string>;
	/** path -> rewritten source (only changed files included) */
	outputs: Record<string, string>;
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

// files: every shipped .js (path -> source). runtimePaths: the subset that ARE
// our runtime modules (whose named exports may be renamed). Only imports from
// a "runtime/…" specifier are rewritten, so app-owned exports are untouched.
export function renameRuntimeExports(
	files: Record<string, string>,
	runtimePaths: ReadonlySet<string>,
	targets: readonly string[] = SAFE_TARGETS,
): RenameResult {
	const parse = (src: string) =>
		ts.createSourceFile("m.js", src, ts.ScriptTarget.ES2025, true, ts.ScriptKind.JS);

	// 1. collect renameable export wire names from the runtime modules.
	//    A name exported by more than one runtime module is ambiguous for a
	//    global rewrite, so drop it (belt-and-braces; ours are unique).
	const owner = new Map<string, string | null>(); // wire -> single owner path | null(=ambiguous)
	for (const path of runtimePaths) {
		const sf = parse(files[path]);
		for (const st of sf.statements) {
			if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause))
				for (const el of st.exportClause.elements) {
					const wire = el.name.text;
					owner.set(wire, owner.has(wire) ? null : path);
				}
		}
	}

	// 1b. a module consumed ANYWHERE via `import * as X from "runtime/<mod>"`
	//     (or re-exported with `export * from`) is read by PROPERTY NAME at
	//     runtime — renaming its exports breaks `X.effect` silently on device
	//     (review finding P5). Drop every wire owned by such a module,
	//     mirroring the prune pass's namespace-import "all" rule.
	const nsModules = new Set<string>();
	for (const src of Object.values(files))
		for (const m of src.matchAll(
			/(?:import\s*\*\s*as\s+\w+\s*from|export\s*\*\s*from)\s*["']runtime\/([\w-]+)["']/g,
		))
			nsModules.add(m[1]);
	if (nsModules.size)
		for (const [wire, path] of owner)
			if (path !== null && [...nsModules].some((mod) => path.includes(`${mod}.js`)))
				owner.set(wire, null); // treat as ambiguous -> never renamed

	// 2. assign each renameable wire a fresh, collision-free host-known target.
	//    Collision = the candidate appears as a word token in ANY shipped file.
	const used = new Set<string>();
	const allText = Object.values(files).join("\n");
	const map: Record<string, string> = {};
	for (const [wire, path] of owner) {
		if (path === null) continue; // ambiguous — skip
		const t = targets.find((c) => !used.has(c) && !new RegExp(`\\b${c}\\b`).test(allText));
		if (!t) break; // pool exhausted — leave the rest as-is
		map[wire] = t;
		used.add(t);
	}
	if (!Object.keys(map).length) return { map: {}, outputs: {} };

	// 3. rewrite every file: export specifiers in runtime modules, import
	//    specifiers from runtime/* everywhere.
	const outputs: Record<string, string> = {};
	for (const [path, src] of Object.entries(files)) {
		const sf = parse(src);
		const edits: Edit[] = [];
		const isRuntime = runtimePaths.has(path);
		for (const st of sf.statements) {
			// export{ local as WIRE } -> export{ local as TARGET }  (runtime modules)
			if (
				isRuntime &&
				ts.isExportDeclaration(st) &&
				st.exportClause &&
				ts.isNamedExports(st.exportClause)
			)
				for (const el of st.exportClause.elements) {
					const t = map[el.name.text];
					if (t) edits.push({ start: el.name.getStart(sf), end: el.name.getEnd(), text: t });
				}
			// import{ WIRE as local }from"runtime/…" -> import{ TARGET as local }…
			// import{ WIRE }from"runtime/…"          -> import{ TARGET as WIRE }…
			if (
				ts.isImportDeclaration(st) &&
				ts.isStringLiteral(st.moduleSpecifier) &&
				RUNTIME.test(st.moduleSpecifier.text) &&
				st.importClause?.namedBindings &&
				ts.isNamedImports(st.importClause.namedBindings)
			)
				for (const el of st.importClause.namedBindings.elements) {
					const wire = (el.propertyName ?? el.name).text;
					const t = map[wire];
					if (!t) continue;
					if (el.propertyName)
						edits.push({
							start: el.propertyName.getStart(sf),
							end: el.propertyName.getEnd(),
							text: t,
						});
					else
						edits.push({
							start: el.name.getStart(sf),
							end: el.name.getEnd(),
							text: `${t} as ${wire}`,
						});
				}
		}
		if (!edits.length) continue;
		edits.sort((a, b) => b.start - a.start);
		let out = src;
		for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
		outputs[path] = out;
	}
	return { map, outputs };
}

if (import.meta.main) {
	// CLI: node symbol-rename.mts <runtime-comma-list> <file1> <file2> …
	// runtime-comma-list = the shipped files that ARE runtime modules.
	const [runtimeCsv, ...paths] = process.argv.slice(2);
	const runtimePaths = new Set(runtimeCsv ? runtimeCsv.split(",") : []);
	const files: Record<string, string> = {};
	for (const p of paths) files[p] = readFileSync(p, "utf8");
	const { map, outputs } = renameRuntimeExports(files, runtimePaths);
	for (const [p, src] of Object.entries(outputs)) writeFileSync(p, src);
	const n = Object.keys(map).length;
	console.log(
		n
			? `symbol-rename: ${n} host-known (${Object.entries(map)
					.map(([w, t]) => `${w}→${t}`)
					.join(", ")})`
			: "symbol-rename: nothing to rename",
	);
}
