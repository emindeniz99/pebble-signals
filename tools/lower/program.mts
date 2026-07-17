// Shared TS Compiler API plumbing for the lowering passes: an in-memory
// single-file program + symbol/identifier helpers. No pass logic lives here.
import ts from "typescript";

export const SRC_MODULE = "runtime/signals";
export const JSX_MODULE = "runtime/jsx-runtime";

export interface Edit {
	start: number;
	end: number;
	text: string;
}

export function program(text: string): { checker: ts.TypeChecker; sf: ts.SourceFile } {
	const fileName = "app.js";
	const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2025, true, ts.ScriptKind.JS);
	const host: ts.CompilerHost = {
		getSourceFile: (fn) => (fn === fileName ? sf : undefined),
		getDefaultLibFileName: () => "lib.d.ts",
		writeFile: () => {},
		getCurrentDirectory: () => "",
		getCanonicalFileName: (f) => f,
		useCaseSensitiveFileNames: () => true,
		getNewLine: () => "\n",
		fileExists: (fn) => fn === fileName,
		readFile: (fn) => (fn === fileName ? text : undefined),
	};
	const prog = ts.createProgram(
		[fileName],
		{
			allowJs: true,
			checkJs: false,
			noLib: true,
			noResolve: true,
			types: [],
			target: ts.ScriptTarget.ES2025,
			module: ts.ModuleKind.ESNext,
		},
		host,
	);
	return { checker: prog.getTypeChecker(), sf: prog.getSourceFile(fileName)! };
}

// symbol of a local binding imported by `name` from `module` (default:
// runtime/signals), resolved by the checker so aliased imports still match.
export function importSymbol(
	checker: ts.TypeChecker,
	sf: ts.SourceFile,
	name: string,
	module = SRC_MODULE,
): ts.Symbol | undefined {
	let sym: ts.Symbol | undefined;
	for (const st of sf.statements) {
		if (
			ts.isImportDeclaration(st) &&
			ts.isStringLiteral(st.moduleSpecifier) &&
			st.moduleSpecifier.text === module &&
			st.importClause?.namedBindings &&
			ts.isNamedImports(st.importClause.namedBindings)
		) {
			for (const el of st.importClause.namedBindings.elements) {
				if ((el.propertyName ?? el.name).text === name) sym = checker.getSymbolAtLocation(el.name);
			}
		}
	}
	return sym;
}

export function collectIdentifiers(sf: ts.SourceFile): ts.Identifier[] {
	const ids: ts.Identifier[] = [];
	(function walk(n: ts.Node) {
		if (ts.isIdentifier(n)) ids.push(n);
		ts.forEachChild(n, walk);
	})(sf);
	return ids;
}

// Symbol of the VALUE an identifier reference reads. getSymbolAtLocation has
// two blind spots where the identifier is simultaneously a name and a value:
// shorthand `{ setA }` yields the PROPERTY symbol and `export { setA }` the
// export alias — both hid live references from the bail scan, so the lowering
// removed a binding that still had uses (the pulse `{ setName }` device
// death). For an aliased export (`export { setA as pub }`) only the LOCAL
// side resolves; the alias identifier stays invisible on purpose (one
// reference per escape site).
export function valueSymbol(checker: ts.TypeChecker, id: ts.Identifier): ts.Symbol | undefined {
	const p = id.parent;
	if (ts.isShorthandPropertyAssignment(p) && p.name === id)
		return checker.getShorthandAssignmentValueSymbol(p);
	if (ts.isExportSpecifier(p)) {
		if ((p.propertyName ?? p.name) !== id) return undefined;
		return checker.getExportSpecifierLocalTargetSymbol(p);
	}
	return checker.getSymbolAtLocation(id);
}

// Is `node` (an expression) part of a destructuring ASSIGNMENT TARGET?
// Walks up through array/object literal layers; true when the chain ends as
// the left side of an `=` or a for-of/for-in initializer.
export function isDestructuringTarget(node: ts.Node): boolean {
	let c: ts.Node = node,
		p: ts.Node = node.parent;
	while (
		p &&
		(ts.isArrayLiteralExpression(p) ||
			ts.isSpreadElement(p) ||
			ts.isObjectLiteralExpression(p) ||
			(ts.isPropertyAssignment(p) && p.initializer === c))
	) {
		c = p;
		p = p.parent;
	}
	if (
		ts.isBinaryExpression(p) &&
		p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		p.left === c &&
		c !== node
	)
		return true;
	return (ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === c;
}

export function freshAlias(sf: ts.SourceFile): string {
	const used = new Set(collectIdentifiers(sf).map((i) => i.text));
	let a = "__sp";
	for (let k = 2; used.has(a); k++) a = "__sp" + k;
	return a;
}
