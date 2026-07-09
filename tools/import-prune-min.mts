// DEAD-IMPORT pruning for minified runtime modules — closes the loop that
// export-prune + DCE leave open. When prune-exports demotes an export and
// esbuild's DCE deletes its last user from a runtime module, esbuild still
// KEEPS the now-dead import specifier (runtime/* is external — it cannot
// prove the import side-effect-free). The build then computes the NEXT
// module's keep-set from that stale import clause and ships dead function
// bodies. Receipt (2026-07, the ErrorBoundary move): watchface — which uses
// no ErrorBoundary at all — shipped withBoundary/getBoundary/track/untrack
// in signals purely because jsx-runtime-min's import clause still named
// them; +9 archive symbols, +540B, measured.
//
// This pass drops import specifiers from `runtime/*` clauses whose LOCAL
// binding has zero identifier references in the module body (AST check — a
// property name like `.G` never counts). If every specifier in a clause is
// dead the whole declaration goes: runtime modules are ours and have no
// import-time side effects a sibling relies on.
//
// Usage: node import-prune-min.mts <file.js>
//   Rewrites <file.js> in place; prints the dropped names (or nothing).
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

/** Return the source with dead runtime/* import specifiers removed, plus the dropped wire names. */
export function pruneDeadImports(source: string): { out: string; dropped: string[] } {
	const sf = ts.createSourceFile("m.js", source, ts.ScriptTarget.ES2025, true, ts.ScriptKind.JS);
	// count every identifier USE by text — skipping import clauses themselves
	// and property-name positions (`.x`, `{x: …}` keys, method names)
	const uses = new Map<string, number>();
	const walk = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node)) return; // the clause is not a use
		if (ts.isIdentifier(node)) {
			const p = node.parent;
			const isPropertyName =
				(ts.isPropertyAccessExpression(p) && p.name === node) ||
				(ts.isPropertyAssignment(p) && p.name === node) ||
				(ts.isMethodDeclaration(p) && p.name === node) ||
				(ts.isPropertySignature(p) && p.name === node);
			if (!isPropertyName) uses.set(node.text, (uses.get(node.text) ?? 0) + 1);
		}
		node.forEachChild(walk);
	};
	sf.forEachChild(walk);

	const cuts: { start: number; end: number; text: string }[] = [];
	const dropped: string[] = [];
	for (const st of sf.statements) {
		if (
			!ts.isImportDeclaration(st) ||
			!ts.isStringLiteral(st.moduleSpecifier) ||
			!st.moduleSpecifier.text.startsWith("runtime/") ||
			!st.importClause?.namedBindings ||
			!ts.isNamedImports(st.importClause.namedBindings)
		)
			continue;
		const specs = st.importClause.namedBindings.elements;
		const live = specs.filter((el) => (uses.get(el.name.text) ?? 0) > 0);
		if (live.length === specs.length) continue;
		for (const el of specs) if (!live.includes(el)) dropped.push((el.propertyName ?? el.name).text);
		cuts.push(
			live.length === 0
				? // whole clause dead — drop the declaration entirely (our own
					// runtime modules have no load-time side effects siblings need)
					{ start: st.getStart(sf), end: st.getEnd(), text: "" }
				: {
						start: st.importClause.namedBindings.getStart(sf),
						end: st.importClause.namedBindings.getEnd(),
						text: `{${live.map((el) => el.getText(sf)).join(",")}}`,
					},
		);
	}
	let out = source;
	for (const c of cuts.sort((a, b) => b.start - a.start))
		out = out.slice(0, c.start) + c.text + out.slice(c.end);
	return { out, dropped };
}

// CLI entry (skipped when imported by tests)
if (import.meta.main) {
	const file = process.argv[2];
	const { out, dropped } = pruneDeadImports(readFileSync(file, "utf8"));
	if (dropped.length) {
		writeFileSync(file, out);
		console.log(`import-prune: ${file}  dropped [${dropped.join(",")}]`);
	}
}
