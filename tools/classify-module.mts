// PURE / IMPURE module classifier — the analysis behind "auto-preload static
// app code into ROM". A Moddable `preload`ed module runs its top-level body at
// BUILD time and freezes the result into flash (ROM, ~free heap). That is safe
// ONLY for a module whose top level has NO runtime side effects:
//   * no host-global construction (`new Container(...)`, `new Skin(...)`) — the
//     Piu globals don't exist at build time, and a frozen node can't change;
//   * no reactive state at module scope (`signal(...)`, `useState(...)`) — ROM
//     is read-only, so a frozen signal can never be written (reactivity dies);
//   * no other top-level call/side effect (`render(...)`, `foo()`).
// A module that only DECLARES things (const literals, pure functions, classes,
// re-exports) is PURE → preload-eligible. Anything else is IMPURE → must stay in
// `main` (the 32KB heap).
//
// This is the classifier for the roadmapped "auto pure-module preload" feature
// (and its v2, developer-assisted "smart module splitting"): the build can route
// PURE app submodules to manifest `preload` and bundle IMPURE ones into main.
//
// Usage (CLI): node tools/classify-module.mts <file.tsx|ts>   -> prints verdict
import { readFileSync } from "node:fs";
import ts from "typescript";

export interface Verdict {
	pure: boolean;
	reasons: string[]; // why it's impure (empty when pure)
}

/**
 * Classify a module source as PURE (preload-eligible) or IMPURE. Pure — walks
 * ONLY the top-level statements; a nested `new`/call inside a function body is
 * fine (it runs when called, not at module load), so only module-scope side
 * effects count.
 */
export function classify(src: string): Verdict {
	const sf = ts.createSourceFile("m.tsx", src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
	const reasons: string[] = [];

	// does an expression, evaluated now, cause a runtime side effect?
	const hasSideEffect = (node: ts.Node): boolean => {
		let found = false;
		const scan = (n: ts.Node): void => {
			if (found) return;
			// a call or construction at module-eval time is a side effect. (We do
			// NOT descend into function/arrow bodies — those don't run at load.)
			if (ts.isNewExpression(n) || ts.isCallExpression(n)) {
				found = true;
				return;
			}
			if (ts.isFunctionExpression(n) || ts.isArrowFunction(n)) return; // body deferred
			ts.forEachChild(n, scan);
		};
		scan(node);
		return found;
	};

	const check = (stmt: ts.Statement): void => {
		// declarations that don't execute anything at load are always pure
		if (
			ts.isImportDeclaration(stmt) ||
			ts.isFunctionDeclaration(stmt) ||
			ts.isClassDeclaration(stmt) ||
			ts.isInterfaceDeclaration(stmt) ||
			ts.isTypeAliasDeclaration(stmt) ||
			ts.isExportDeclaration(stmt) ||
			ts.isEmptyStatement(stmt)
		)
			return;
		// `export default …` / `export const …` — unwrap to the inner declaration
		if (ts.isVariableStatement(stmt)) {
			for (const d of stmt.declarationList.declarations)
				if (d.initializer && hasSideEffect(d.initializer))
					reasons.push(`module-scope initializer runs at load: ${trim(d.getText(sf))}`);
			return;
		}
		if (ts.isExportAssignment(stmt)) {
			if (hasSideEffect(stmt.expression))
				reasons.push(`export default runs at load: ${trim(stmt.getText(sf))}`);
			return;
		}
		// a bare expression statement (render(...), foo()) is a side effect
		if (ts.isExpressionStatement(stmt)) {
			reasons.push(`top-level statement runs at load: ${trim(stmt.getText(sf))}`);
			return;
		}
		// anything else at top level (loops, if, etc.) executes at load -> impure
		reasons.push(`top-level control flow runs at load: ${trim(stmt.getText(sf))}`);
	};

	for (const stmt of sf.statements) check(stmt);
	return { pure: reasons.length === 0, reasons };
}

const trim = (s: string): string => {
	const one = s.replace(/\s+/g, " ").trim();
	return one.length > 60 ? `${one.slice(0, 57)}...` : one;
};

if (import.meta.main) {
	const file = process.argv[2];
	const v = classify(readFileSync(file, "utf8"));
	console.log(`${file}: ${v.pure ? "PURE (preload-eligible)" : "IMPURE (stays in main)"}`);
	for (const r of v.reasons) console.log(`  - ${r}`);
	process.exit(0);
}
