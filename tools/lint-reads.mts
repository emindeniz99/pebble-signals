// Reactive-read lint (the ".value footgun" gate). The app tsconfig is
// noCheck — transpile-only, examples deliberately loose — so tsc never sees
// the classic silent bugs around the THREE read syntaxes (useState → call,
// signal/computed → .value):
//
//   const g = computed(() => …);
//   <Label string={() => "hi " + g} />      // "[object Object]" on the watch
//   <Label string={() => "hi " + g()} />    // throw — ReadonlySignal isn't callable
//   <Label string={g} />                    // bare object as a prop "thunk"
//   const [n] = useState(0);
//   <Label string={() => "n " + n} />       // stringifies the GETTER FUNCTION
//
// None of these error at build time today; all render garbage (or crash) on
// device — the watchface-tutorial `greeting()` incident cost a bisection.
// This gate type-checks ONLY these shapes on the app entry (+ its shipped
// sibling modules) with the real TS checker, so it has the actual types of
// `signal`/`computed` (resolved straight to the runtime sources, like
// tsconfig.check.json) and zero regex guessing. Fails the build loudly.
//
// Rule 5 (the pulse `{ setName }` incident): a useState getter/setter
// ESCAPING as a value. The lowering rewrites CALLS only; any other reference
// forces the whole pair off the packed lowering onto the heap object API —
// and the shorthand escape used to compile to a dangling identifier and die
// on device before the lowering learned to bail on it. The wrap is the fix:
//
//   const [name, setName] = useState("");
//   boot({ setName });                       // rule 5 — escape
//   boot({ setName: (v) => setName(v) });    // lowers, packed
//
// Symbol-resolved exactly like the lowering (shadows don't trip it; a
// foreign `useState` import is ignored).
//
// Deliberately NOT a full type-check: examples stay loose by design (see
// tsconfig.check.json's note); we flag only provable read-syntax misuse.
//
// Usage (CLI): node tools/lint-reads.mts <appSrc> [more .tsx/.ts files]
// (exit 1 if any finding). Build flag: --no-lint-reads / LINT_READS=0.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { collectIdentifiers, importSymbol, valueSymbol } from "./lower/program.mts";
import { PIU_HOSTS, REACTIVE_PROPS } from "./lower/runtime-meta.mts";
import { packageRoot } from "./pkg-root.mts";

export interface Finding {
	file: string;
	line: number; // 1-based
	col: number; // 1-based
	rule:
		| "call-signal"
		| "stringify-signal"
		| "prop-signal"
		| "child-signal"
		| "stringify-fn"
		| "setter-as-value"
		| "getter-as-value"
		| "getter-on-static-prop";
	msg: string;
}

// Does this type (or a union member of it) name a runtime Signal/ReadonlySignal?
// Matched by symbol name + declaration living under the runtime sources (or the
// generated runtime-types .d.ts in a consumer install), so an app's own class
// named Signal never trips it.
function isSignalType(t: ts.Type): boolean {
	if (t.isUnion()) return t.types.some(isSignalType);
	const sym = t.aliasSymbol ?? t.getSymbol();
	if (!sym) return false;
	const name = sym.getName();
	if (name !== "Signal" && name !== "ReadonlySignal") return false;
	return (sym.getDeclarations() ?? []).some((d) => {
		const f = d.getSourceFile().fileName.replace(/\\/g, "/");
		return /\/(embeddedjs\/runtime(-build)?|runtime-types)\/signals\.(ts|d\.ts|js)$/.test(f);
	});
}

// A callable value (has call signatures) that is NOT also constructable — i.e.
// a plain function like a useState getter, not a Piu class. Stringifying one
// is as silently wrong as stringifying a Signal object.
function isBareFunctionType(t: ts.Type): boolean {
	if (t.isUnion()) return t.types.some(isBareFunctionType);
	return t.getCallSignatures().length > 0 && t.getConstructSignatures().length === 0;
}

const short = (n: ts.Node): string => {
	const s = n.getText();
	return s.length > 24 ? `${s.slice(0, 24)}…` : s;
};

/** Lint app sources for reactive-read misuse. Returns findings (empty = clean). */
export function lintReads(entryFiles: string[], pkgRoot?: string): Finding[] {
	const PKG = pkgRoot ?? packageRoot(dirname(new URL(import.meta.url).pathname));
	const RT = join(PKG, "src/embeddedjs/runtime");
	const roots = entryFiles.map((f) => resolve(f));
	// Piu host globals so JSX lowers without error-typing every element; absent
	// in odd layouts is fine — our rules only read OPERAND types.
	const globals = join(PKG, "src/tsx/globals.d.ts");
	if (existsSync(globals)) roots.push(globals);

	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2025,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		jsx: ts.JsxEmit.ReactJSX,
		jsxImportSource: "runtime",
		strict: false,
		noEmit: true,
		skipLibCheck: true,
		types: [],
		lib: ["lib.es2025.d.ts"],
		allowImportingTsExtensions: true,
	};
	const host = ts.createCompilerHost(options);
	// `runtime/<mod>` (and the react-jsx factory's `runtime/jsx-runtime`)
	// resolve straight to the runtime .ts sources — the same single-typed-truth
	// rule tsconfig.check.json uses, but via a host hook so no baseUrl/paths.
	host.resolveModuleNameLiterals = (literals, containingFile, _redirect, opts) =>
		literals.map((lit) => {
			const spec = lit.text;
			if (spec.startsWith("runtime/")) {
				for (const ext of [".ts", ".d.ts", ".js"]) {
					const p = join(RT, `${spec.slice("runtime/".length)}${ext}`);
					if (existsSync(p))
						return {
							resolvedModule: {
								resolvedFileName: p,
								extension: ext,
								isExternalLibraryImport: false,
							},
						};
				}
			}
			const r = ts.resolveModuleName(spec, containingFile, opts, host);
			return { resolvedModule: r.resolvedModule };
		});

	const prog = ts.createProgram(roots, options, host);
	const checker = prog.getTypeChecker();
	const findings: Finding[] = [];
	const seen = new Set<string>(); // one finding per site
	const seenPos = new Set<string>(); // any rule at this site (rule 5 defers)

	const report = (n: ts.Node, rule: Finding["rule"], msg: string) => {
		const sf = n.getSourceFile();
		const { line, character } = sf.getLineAndCharacterOfPosition(n.getStart());
		const key = `${sf.fileName}:${line}:${character}:${rule}`;
		if (seen.has(key)) return;
		seen.add(key);
		seenPos.add(`${sf.fileName}:${line}:${character}`);
		findings.push({ file: sf.fileName, line: line + 1, col: character + 1, rule, msg });
	};

	// A Signal (or bare function) used where it will STRINGIFY.
	const checkStringifyOperand = (n: ts.Expression) => {
		const t = checker.getTypeAtLocation(n);
		if (isSignalType(t))
			report(
				n,
				"stringify-signal",
				`\`${short(n)}\` is a Signal object and stringifies as [object Object] — read \`${short(n)}.value\``,
			);
		else if (isBareFunctionType(t))
			report(
				n,
				"stringify-fn",
				`\`${short(n)}\` is a function and stringifies as its source text — did you mean \`${short(n)}()\`?`,
			);
	};

	for (const rootFile of entryFiles.map((f) => resolve(f))) {
		const sf = prog.getSourceFile(rootFile);
		if (!sf) continue;
		const visit = (node: ts.Node): void => {
			// g() where g is Signal/ReadonlySignal — the watchface `greeting()` bug
			if (ts.isCallExpression(node)) {
				const t = checker.getTypeAtLocation(node.expression);
				if (isSignalType(t))
					report(
						node,
						"call-signal",
						`\`${short(node.expression)}\` is a Signal object, not a function — read \`${short(node.expression)}.value\``,
					);
			}
			// "x " + g  /  g + "x"  (either operand)
			if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
				checkStringifyOperand(node.left);
				checkStringifyOperand(node.right);
			}
			// `x ${g}` template spans
			if (ts.isTemplateExpression(node))
				for (const span of node.templateSpans) checkStringifyOperand(span.expression);
			// String(g)
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === "String" &&
				node.arguments.length === 1
			)
				checkStringifyOperand(node.arguments[0]);
			// <Label string={g} /> — a bare Signal object as a prop value
			if (ts.isJsxExpression(node) && node.expression && ts.isJsxAttribute(node.parent)) {
				const t = checker.getTypeAtLocation(node.expression);
				if (isSignalType(t))
					report(
						node.expression,
						"prop-signal",
						`prop \`${node.parent.name.getText()}\` gets the Signal OBJECT — pass a thunk: \`${node.parent.name.getText()}={() => ${short(node.expression)}.value}\``,
					);
			}
			// <Column>{g}</Column> — a bare Signal object as a JSX CHILD.
			// appendChild only rejects FUNCTION children (jsx:fn-child), so a
			// signal/computed/useMemo object lands in the piu tree as silent
			// garbage — and since useMemo returns the computed itself, the
			// once-loud function-child shape became this silent one (refuter
			// probe). Same type check as prop-signal, child position.
			if (
				ts.isJsxExpression(node) &&
				node.expression &&
				(ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
			) {
				const t = checker.getTypeAtLocation(node.expression);
				if (isSignalType(t))
					report(
						node.expression,
						"child-signal",
						`JSX child gets the Signal OBJECT (lands in the piu tree as garbage) — render it: \`<Label string={() => String(${short(node.expression)}.value)} />\``,
					);
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);

		// Rule 5: useState pair bindings escaping as VALUES. Candidacy mirrors
		// the lowering exactly (const [g, s] = useState(init) of OUR useState,
		// both plain identifiers) — a pair the lowering never touches can't
		// dangle and isn't flagged. Runs after visit() so a site the type
		// rules already flagged (e.g. stringifying a getter) isn't doubled.
		const useSym = importSymbol(checker, sf, "useState");
		if (!useSym) continue;
		const declIds = new Set<ts.Node>();
		const pairBindings = new Map<ts.Symbol, { name: string; kind: "getter" | "setter" }>();
		(function walkPairs(n: ts.Node): void {
			if (
				ts.isVariableDeclaration(n) &&
				n.initializer &&
				ts.isCallExpression(n.initializer) &&
				ts.isIdentifier(n.initializer.expression) &&
				checker.getSymbolAtLocation(n.initializer.expression) === useSym &&
				ts.isArrayBindingPattern(n.name) &&
				n.name.elements.length === 2
			) {
				const [ge, se] = n.name.elements;
				if (
					!ts.isOmittedExpression(ge) &&
					!ts.isOmittedExpression(se) &&
					ts.isIdentifier(ge.name) &&
					ts.isIdentifier(se.name)
				) {
					// an EXPORTED pair escapes by module contract — the lowering
					// skips it (object API, correct) but the packed form is lost.
					// One finding on the setter; the bindings stay untracked
					// (they are real functions, later refs are legit).
					if (
						ts.isVariableStatement(n.parent.parent) &&
						ts.getModifiers(n.parent.parent)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
					) {
						report(
							se.name,
							"setter-as-value",
							`\`${se.name.text}\` is exported with its useState pair — the pair can't lower (heap object API). Keep it module-local and export wrappers: \`export const set = (v) => ${se.name.text}(v)\``,
						);
						return ts.forEachChild(n, walkPairs);
					}
					for (const [el, kind] of [
						[ge, "getter"],
						[se, "setter"],
					] as const) {
						const sym = checker.getSymbolAtLocation((el as ts.BindingElement).name);
						if (sym)
							pairBindings.set(sym, {
								name: ((el as ts.BindingElement).name as ts.Identifier).text,
								kind,
							});
						declIds.add((el as ts.BindingElement).name);
					}
				}
			}
			ts.forEachChild(n, walkPairs);
		})(sf);
		if (!pairBindings.size) continue;
		for (const id of collectIdentifiers(sf)) {
			if (declIds.has(id)) continue;
			// a TYPE-position reference (`typeof setN`, `Foo<typeof setN>`) is
			// erased at emit — no runtime escape. isPartOfTypeNode misses type
			// QUERIES (their name resolves in value space), so climb qualified
			// names to the enclosing TypeQuery explicitly. (The lowering still
			// conservatively bails on these.)
			if (ts.isPartOfTypeNode(id)) continue;
			let q: ts.Node = id;
			while (ts.isQualifiedName(q.parent)) q = q.parent;
			if (ts.isTypeQueryNode(q.parent)) continue;
			const sym = valueSymbol(checker, id);
			const hit = sym && pairBindings.get(sym);
			if (!hit) continue;
			const asCall =
				ts.isCallExpression(id.parent) && id.parent.expression === id ? id.parent : undefined;
			if (hit.kind === "setter" ? !!asCall : asCall && asCall.arguments.length === 0) continue;
			// a GETTER as a JSX ATTRIBUTE value is a thunk position — the getter
			// IS `() => T`, the documented reactive contract for props (shipped
			// pattern: component.tsx `<Readout value={count} />`). The pair bails
			// (A1: component props are never auto-thunked) — allowed. EXCEPT on a
			// HOST's NON-reactive prop (`<Container width={count}>`): createHost
			// throws bindErr at render because only REACTIVE_PROPS may be
			// function-valued (jsx-runtime) — the lint gate must catch that, not
			// let it die on device (codex round 13).
			if (
				hit.kind === "getter" &&
				ts.isJsxExpression(id.parent) &&
				id.parent.expression === id &&
				ts.isJsxAttribute(id.parent.parent)
			) {
				const attr = id.parent.parent;
				const attrName = attr.name.getText();
				const opening = attr.parent.parent; // JsxAttributes -> Jsx(Opening|SelfClosing)Element
				const tagName =
					ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)
						? opening.tagName
						: undefined;
				// a HOST tag resolves to the ambient globals.d.ts declaration (or
				// none); a user COMPONENT resolves to its own symbol — never a host
				const decl = tagName && checker.getSymbolAtLocation(tagName)?.declarations?.[0];
				const isHost =
					!!tagName &&
					PIU_HOSTS.has(tagName.getText()) &&
					(!decl || decl.getSourceFile().fileName.endsWith("globals.d.ts"));
				if (!(isHost && !REACTIVE_PROPS.has(attrName))) continue; // component / reactive host prop
				report(
					id,
					"getter-on-static-prop",
					`\`${hit.name}\` (a useState getter) is passed to the non-reactive host prop \`${attrName}\` — createHost throws at render (only ${[...REACTIVE_PROPS].join("/")} may be function-valued). Pass a static value, or read once: \`${attrName}={${hit.name}()}\``,
				);
				continue;
			}
			const { line, character } = sf.getLineAndCharacterOfPosition(id.getStart());
			if (seenPos.has(`${sf.fileName}:${line}:${character}`)) continue; // sharper rule spoke
			if (hit.kind === "setter")
				report(
					id,
					"setter-as-value",
					`\`${hit.name}\` is a useState setter passed as a VALUE — wrap: \`(v) => ${hit.name}(v)\`. An escaped pair loses the packed lowering (heap object API); the \`{ ${hit.name} }\` shorthand shape used to die on device`,
				);
			else
				report(
					id,
					"getter-as-value",
					asCall
						? `\`${hit.name}\` is a useState getter — it takes no arguments: \`${hit.name}()\``
						: `\`${hit.name}\` is a useState getter used as a VALUE — call it (\`${hit.name}()\`) or pass \`() => ${hit.name}()\`. An escaped pair loses the packed lowering (heap object API)`,
				);
		}
	}
	return findings;
}

if (import.meta.main) {
	const files = process.argv.slice(2);
	if (!files.length) {
		process.stderr.write("usage: node tools/lint-reads.mts <appSrc> [more files]\n");
		process.exit(2);
	}
	const findings = lintReads(files);
	for (const f of findings)
		process.stderr.write(`lint-reads: ${f.file}:${f.line}:${f.col} [${f.rule}] ${f.msg}\n`);
	if (findings.length) {
		process.stderr.write(
			`lint-reads: ${findings.length} reactive-read bug(s) — these render garbage or crash on device. LINT_READS=0 to bypass.\n`,
		);
		process.exit(1);
	}
	console.log(`lint-reads: clean (${files.length} file(s))`);
}
