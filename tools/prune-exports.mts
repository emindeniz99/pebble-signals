// Per-app EXPORT-level runtime pruning — the #29 fix. The runtime modules ship
// preloaded into the mod archive; every export costs archive bytes and boot
// arena even if the app never imports it. Bisect receipt (2026-07): clock — a
// previously-verified 2-label app — started dying at boot with `fxAbort memory
// full` purely because the runtime GREW (createResource, richer diagnostics…);
// the boot floor tracks runtime size, threshold measured between mc.xsa
// ~14.5-14.9KB. Module-level tree-shaking (tools/treeshake.mts) can only drop
// WHOLE modules; this pass makes each shipped module pay-for-what-you-use:
// exports the app (and sibling runtime modules) never import lose their
// `export` keyword here, and esbuild's minify DCE then drops the now-
// unreferenced declarations from runtime-min.
//
// Usage: node prune-exports.mts <file.js> <keep1,keep2,...>
//   Rewrites <file.js> in place. Never removes code itself — only demotes
//   unused exports to module-local declarations (DCE is the minifier's job,
//   so MINIFY=0 debug builds stay complete and readable).
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

export function pruneExports(source: string, keep: ReadonlySet<string>): string {
	const sf = ts.createSourceFile("m.js", source, ts.ScriptTarget.ES2025, true, ts.ScriptKind.JS);
	// [start,end) spans to delete, applied back-to-front
	const cuts: { start: number; end: number; text?: string }[] = [];
	for (const st of sf.statements) {
		// export function f / export const x = … / export class C
		if (
			(ts.isFunctionDeclaration(st) || ts.isVariableStatement(st) || ts.isClassDeclaration(st)) &&
			ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
		) {
			const names: string[] = [];
			if (ts.isVariableStatement(st))
				for (const d of st.declarationList.declarations)
					if (ts.isIdentifier(d.name)) names.push(d.name.text);
			if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name)
				names.push(st.name.text);
			// a multi-declarator statement is kept if ANY name is kept
			if (names.length && !names.some((n) => keep.has(n))) {
				const mod = ts.getModifiers(st)!.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)!;
				cuts.push({ start: mod.getStart(sf), end: mod.getEnd() + 1 }); // drop "export "
			}
		}
		// export { a, b as c };  — filter the specifier list
		else if (
			ts.isExportDeclaration(st) &&
			!st.moduleSpecifier &&
			st.exportClause &&
			ts.isNamedExports(st.exportClause)
		) {
			const kept = st.exportClause.elements.filter((el) => keep.has(el.name.text));
			if (kept.length === 0) {
				cuts.push({ start: st.getStart(sf), end: st.getEnd() });
			} else if (kept.length < st.exportClause.elements.length) {
				cuts.push({
					start: st.getStart(sf),
					end: st.getEnd(),
					text: `export { ${kept.map((el) => el.getText(sf)).join(", ")} };`,
				});
			}
		}
	}
	let out = source;
	for (const c of cuts.sort((a, b) => b.start - a.start))
		out = out.slice(0, c.start) + (c.text ?? "") + out.slice(c.end);
	return out;
}

if (import.meta.main) {
	const [file, keepArg] = process.argv.slice(2);
	if (!file || keepArg === undefined) {
		console.error("usage: prune-exports.mts <file.js> <keep1,keep2,...>");
		process.exit(1);
	}
	const keep = new Set(keepArg.split(",").filter(Boolean));
	const src = readFileSync(file, "utf8");
	const out = pruneExports(src, keep);
	if (out !== src) writeFileSync(file, out);
	const dropped = (src.match(/^export /gm) || []).length - (out.match(/^export /gm) || []).length;
	console.log(`prune: ${file}  kept [${[...keep].join(",")}], demoted ${dropped} exports`);
}
