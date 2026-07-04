// Compile-time useState lowering (packed core Stage 2), AST-based.
//
// Replaces the regex tool (tools/lower.py) with a REAL parse + binding
// resolution via the TypeScript compiler API (already required for tsc).
// Every decision is made on the resolved SYMBOL, not on name matching:
// "who is this identifier bound to?" is answered by the checker, so
// shadowing, property access, and aliasing are correct by construction —
// only the genuinely-correct call sites are rewritten.
//
//   const [x, setX] = useState(init)  ->  const x = __sp.sig(init)
//   x()          (getter, 0 args)     ->  __sp.get(x)
//   setX(expr)   (setter)             ->  __sp.set(x, expr)
//   setX()                            ->  __sp.set(x, undefined)
//
// A pair is lowered ONLY when its useState resolves to the import from
// "runtime/signals" AND every reference to both names is a qualifying
// direct call (getter: exactly the call target, zero args; setter: the
// call target). Any other use — value position, extra args, alias,
// shadow — leaves that pair on the object-API useState. Semantics never
// change, only representation. The runtime alias is unique per file.
//
// Usage: node lower.mts FILE...    |    node lower.mts --selftest
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const SRC_MODULE = "runtime/signals";
const JSX_MODULE = "runtime/jsx-runtime";

// auto-thunk is scoped to HOST (Piu) elements and their REACTIVE props ONLY —
// these two sets MUST stay in sync with jsx-runtime.ts (isPiu / REACTIVE_PROPS).
// A component (VirtualList, user fn) is NOT a host, so its props (rows, data,
// each, value…) are left ALONE — wrapping a plain-value prop like `rows={n()}`
// into a thunk would break the component that reads it as a number. A non-
// reactive host prop (width/left/top…) is also left alone — it's a static
// construction read, and wrapping it would trip jsx-runtime's bind-time reject.
const PIU_HOSTS = new Set([
	"Label",
	"Text",
	"Content",
	"Container",
	"Column",
	"Row",
	"Scroller",
	"Port",
	"Layout",
]);
const REACTIVE_PROPS = new Set(["string", "state", "variant", "skin", "style", "active"]);

interface Edit {
	start: number;
	end: number;
	text: string;
}

function program(text: string): { checker: ts.TypeChecker; sf: ts.SourceFile } {
	const fileName = "app.js";
	const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
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
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
		},
		host,
	);
	return { checker: prog.getTypeChecker(), sf: prog.getSourceFile(fileName)! };
}

// symbol of a local binding imported by `name` from `module` (default:
// runtime/signals), resolved by the checker so aliased imports still match.
function importSymbol(
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

function collectIdentifiers(sf: ts.SourceFile): ts.Identifier[] {
	const ids: ts.Identifier[] = [];
	(function walk(n: ts.Node) {
		if (ts.isIdentifier(n)) ids.push(n);
		ts.forEachChild(n, walk);
	})(sf);
	return ids;
}

// Is `node` (an expression) part of a destructuring ASSIGNMENT TARGET?
// Walks up through array/object literal layers; true when the chain ends as
// the left side of an `=` or a for-of/for-in initializer.
function isDestructuringTarget(node: ts.Node): boolean {
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

function freshAlias(sf: ts.SourceFile): string {
	const used = new Set(collectIdentifiers(sf).map((i) => i.text));
	let a = "__sp";
	for (let k = 2; used.has(a); k++) a = "__sp" + k;
	return a;
}

// --- JSX auto-thunk (Stage 1.5) ------------------------------------------
// What Solid's JSX compiler does: a reactive read written directly in a JSX
// attribute — `string={count()}` — is wrapped into a thunk `() => count()` so
// the runtime binds it live. Authors then drop the arrow and write React-
// looking `string={count()}` while keeping fine-grained semantics.
//
// This runs on the ESBUILD-BUNDLED output (jsx factory calls, arg[1] = props
// object), BEFORE the signal/useState read-lowering below, so the wrapped
// `count()` still lowers to `() => __sp.get(count)` in the same build.
//
// Conservative by construction — a prop value is wrapped ONLY when:
//   * the value is not already a function/arrow (event handlers, existing
//     thunks are left alone), and
//   * it is not the `children` prop (a function child is a different path,
//     it throws jsx:fn-child), and
//   * the value subtree contains a REACTIVE READ resolved by symbol: a 0-arg
//     call to a useState getter, or `sig.value` on a signal/computed/useMemo
//     binding. A static `left={40}` or `x={props.n}` is never touched.
// Idempotent: a wrapped value is an arrow on the next pass, so it is skipped.
export function autoThunk(text: string): { code: string; wrapped: number } {
	const { checker, sf } = program(text);
	const jsxSym = importSymbol(checker, sf, "jsx", JSX_MODULE);
	const jsxsSym = importSymbol(checker, sf, "jsxs", JSX_MODULE);
	if (!jsxSym && !jsxsSym) return { code: text, wrapped: 0 };

	// reactive symbols: useState getters (read via g()), signal/computed/useMemo
	// bindings (read via .value). Collected by resolved symbol, not by name.
	const useSym = importSymbol(checker, sf, "useState");
	const sigSym = importSymbol(checker, sf, "signal");
	const compSym = importSymbol(checker, sf, "computed");
	const memoSym = importSymbol(checker, sf, "useMemo");
	const getterSyms = new Set<ts.Symbol>(); // read as g()
	const valueSyms = new Set<ts.Symbol>(); // read as x.value
	(function walk(n: ts.Node) {
		if (
			ts.isVariableDeclaration(n) &&
			n.initializer &&
			ts.isCallExpression(n.initializer) &&
			ts.isIdentifier(n.initializer.expression)
		) {
			const callee = checker.getSymbolAtLocation(n.initializer.expression);
			const el0 = ts.isArrayBindingPattern(n.name) ? n.name.elements[0] : undefined;
			if (
				useSym &&
				callee === useSym &&
				ts.isArrayBindingPattern(n.name) &&
				n.name.elements.length === 2 &&
				el0 &&
				!ts.isOmittedExpression(el0) &&
				ts.isIdentifier(el0.name)
			) {
				const s = checker.getSymbolAtLocation(el0.name);
				if (s) getterSyms.add(s);
			} else if (
				((sigSym && callee === sigSym) ||
					(compSym && callee === compSym) ||
					(memoSym && callee === memoSym)) &&
				ts.isIdentifier(n.name)
			) {
				const s = checker.getSymbolAtLocation(n.name);
				if (s) valueSyms.add(s);
			}
		}
		ts.forEachChild(n, walk);
	})(sf);
	if (!getterSyms.size && !valueSyms.size) return { code: text, wrapped: 0 };

	// does an expression subtree contain a reactive read?
	function hasReactiveRead(node: ts.Node): boolean {
		let found = false;
		(function scan(n: ts.Node) {
			if (found) return;
			if (ts.isIdentifier(n)) {
				const s = checker.getSymbolAtLocation(n);
				if (s) {
					// getter: `g()` — the identifier is the call target, 0 args
					if (
						getterSyms.has(s) &&
						ts.isCallExpression(n.parent) &&
						n.parent.expression === n &&
						n.parent.arguments.length === 0
					)
						found = true;
					// signal read: `x.value`
					else if (
						valueSyms.has(s) &&
						ts.isPropertyAccessExpression(n.parent) &&
						n.parent.expression === n &&
						n.parent.name.text === "value"
					)
						found = true;
				}
			}
			ts.forEachChild(n, scan);
		})(node);
		return found;
	}

	const isJsxCall = (call: ts.CallExpression): boolean => {
		if (!ts.isIdentifier(call.expression)) return false;
		const s = checker.getSymbolAtLocation(call.expression);
		return !!s && (s === jsxSym || s === jsxsSym);
	};

	// Is the jsx type a Piu HOST element? A host is a FREE global — a bare
	// identifier in the Piu set with NO resolvable declaration (host-injected at
	// runtime). A component (imported/local) resolves to a symbol, and a shadowed
	// `const Label = …` also resolves — so symbol-resolution handles shadowing.
	const isPiuHostType = (typeNode: ts.Node): boolean =>
		ts.isIdentifier(typeNode) &&
		PIU_HOSTS.has(typeNode.text) &&
		!checker.getSymbolAtLocation(typeNode);

	const edits: Edit[] = [];
	(function walk(n: ts.Node) {
		if (
			ts.isCallExpression(n) &&
			isJsxCall(n) &&
			n.arguments.length >= 2 &&
			ts.isObjectLiteralExpression(n.arguments[1]) &&
			isPiuHostType(n.arguments[0]) // ONLY host elements — never components
		) {
			for (const prop of n.arguments[1].properties) {
				if (!ts.isPropertyAssignment(prop)) continue; // skip spreads/shorthand
				const key = ts.isIdentifier(prop.name)
					? prop.name.text
					: ts.isStringLiteral(prop.name)
						? prop.name.text
						: null;
				if (key === null || !REACTIVE_PROPS.has(key)) continue; // whitelist only
				const v = prop.initializer;
				if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) continue; // already a thunk
				if (!hasReactiveRead(v)) continue;
				edits.push({ start: v.getStart(sf), end: v.getStart(sf), text: "() => (" });
				edits.push({ start: v.getEnd(), end: v.getEnd(), text: ")" });
			}
		}
		ts.forEachChild(n, walk);
	})(sf);
	if (!edits.length) return { code: text, wrapped: 0 };

	let out = text;
	for (const e of edits.sort((a, b) => b.start - a.start))
		out = out.slice(0, e.start) + e.text + out.slice(e.end);
	return { code: out, wrapped: edits.length / 2 };
}

interface Pair {
	decl: ts.VariableDeclaration;
	gName: string;
	initText: string;
	gSym: ts.Symbol | undefined;
	sSym: ts.Symbol | undefined;
}
interface Sig {
	call: ts.CallExpression;
	name: string;
	initText: string;
	kind: "sig" | "computed";
	sym: ts.Symbol | undefined;
}

export function lower(text: string): { code: string; lowered: number; bailed: number } {
	// JSX auto-thunk first: `string={count()}` -> `string={() => count()}`, so
	// the wrapped read lowers to `() => __sp.get(count)` in the same pass below.
	text = autoThunk(text).code;
	const { checker, sf } = program(text);
	const useSym = importSymbol(checker, sf, "useState");
	const sigSym = importSymbol(checker, sf, "signal");
	const compSym = importSymbol(checker, sf, "computed");
	const memoSym = importSymbol(checker, sf, "useMemo");
	if (!useSym && !sigSym && !compSym && !memoSym) return { code: text, lowered: 0, bailed: 0 };

	const declIds = new Set<ts.Node>();
	const txt = (n: ts.Node) => text.slice(n.getStart(sf), n.getEnd());

	// candidate useState pairs: const [g, s] = useState(init) whose useState is OURS
	const pairs: Pair[] = [];
	// candidate signal bindings: const s = signal(init) whose signal is OURS
	const sigs: Sig[] = [];
	(function walk(n: ts.Node) {
		if (
			ts.isVariableDeclaration(n) &&
			n.initializer &&
			ts.isCallExpression(n.initializer) &&
			ts.isIdentifier(n.initializer.expression)
		) {
			const callee = checker.getSymbolAtLocation(n.initializer.expression);
			const init = n.initializer.arguments[0];
			const initText = init ? txt(init) : "undefined";
			if (
				useSym &&
				callee === useSym &&
				n.name &&
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
					pairs.push({
						decl: n,
						gName: ge.name.text,
						initText,
						gSym: checker.getSymbolAtLocation(ge.name),
						sSym: checker.getSymbolAtLocation(se.name),
					});
					declIds.add(ge.name);
					declIds.add(se.name);
				}
			} else if (sigSym && callee === sigSym && n.name && ts.isIdentifier(n.name)) {
				sigs.push({
					call: n.initializer,
					name: n.name.text,
					initText,
					kind: "sig",
					sym: checker.getSymbolAtLocation(n.name),
				});
				declIds.add(n.name);
			} else if (
				((compSym && callee === compSym) || (memoSym && callee === memoSym)) &&
				n.name &&
				ts.isIdentifier(n.name)
			) {
				// computed()/useMemo(): read-only derived signal. Same read path
				// as a signal (.value -> S.get); any write is caller error -> bail.
				sigs.push({
					call: n.initializer,
					name: n.name.text,
					initText,
					kind: "computed",
					sym: checker.getSymbolAtLocation(n.name),
				});
				declIds.add(n.name);
			}
		}
		ts.forEachChild(n, walk);
	})(sf);
	if (!pairs.length && !sigs.length) return { code: text, lowered: 0, bailed: 0 };

	// classify every reference by resolved symbol (not by name)
	const refs = new Map<ts.Symbol | undefined, ts.Identifier[]>();
	for (const p of pairs) {
		refs.set(p.gSym, []);
		refs.set(p.sSym, []);
	}
	for (const s of sigs) refs.set(s.sym, []);
	for (const id of collectIdentifiers(sf)) {
		if (declIds.has(id)) continue;
		const s = checker.getSymbolAtLocation(id);
		if (s && refs.has(s)) refs.get(s)!.push(id);
	}
	const isCallTarget = (id: ts.Identifier) =>
		ts.isCallExpression(id.parent) && id.parent.expression === id;

	const edits: Edit[] = [];
	let lowered = 0,
		bailed = 0;
	for (const p of pairs) {
		let ok = true;
		for (const id of refs.get(p.gSym)!) {
			// getter: 0-arg call only
			if (!(isCallTarget(id) && ts.isCallExpression(id.parent) && id.parent.arguments.length === 0))
				ok = false;
		}
		for (const id of refs.get(p.sSym)!) {
			// setter: call target only
			if (!isCallTarget(id)) ok = false;
		}
		if (!ok) {
			bailed++;
			continue;
		}
		lowered++;
		edits.push({
			start: p.decl.getStart(sf),
			end: p.decl.getEnd(),
			text: `${p.gName} = __ALIAS__.sig(${p.initText})`,
		});
		for (const id of refs.get(p.gSym)!)
			edits.push({
				start: id.parent.getStart(sf),
				end: id.parent.getEnd(),
				text: `__ALIAS__.get(${p.gName})`,
			});
		for (const id of refs.get(p.sSym)!) {
			const c = id.parent as ts.CallExpression;
			if (c.arguments.length === 0)
				// setX()
				edits.push({
					start: c.getStart(sf),
					end: c.getEnd(),
					text: `__ALIAS__.set(${p.gName}, undefined)`,
				});
			// wrap not slurp: keep arg + `)` so nested reads lower
			else
				edits.push({
					start: c.getStart(sf),
					end: c.arguments.pos,
					text: `__ALIAS__.set(${p.gName}, `,
				});
		}
	}
	// Stage 3: direct signal() / computed() / useMemo() — every ref must be
	// `s.value` (a read, or for a signal a statement-level `s.value = e`
	// write); anything else bails. A computed is read-only, so any write to
	// it bails (and stays the object API, where it is still caller error).
	for (const s of sigs) {
		const uses = refs.get(s.sym)!;
		const plan: Edit[] = [];
		let ok = true;
		for (const id of uses) {
			const pae = id.parent;
			if (
				!(ts.isPropertyAccessExpression(pae) && pae.expression === id && pae.name.text === "value")
			) {
				ok = false;
				break;
			}
			const asn = pae.parent;
			const opk = ts.isBinaryExpression(asn) && asn.left === pae ? asn.operatorToken.kind : 0;
			if (opk === ts.SyntaxKind.EqualsToken) {
				// `s.value = e`
				if (s.kind !== "sig") {
					ok = false;
					break;
				} // write to a computed
				if (!ts.isExpressionStatement(asn.parent)) {
					ok = false;
					break;
				} // value-used assignment
				// two edits so nested reads in the RHS lower independently:
				// `s.value =` -> `__sp.put(s,` and insert `)` after the RHS.
				// put (RAW write), NOT set: set unwraps function values as
				// functional updates (the useState contract) but the object API
				// stores a function verbatim — set here would silently CALL a
				// function the user meant to store.
				plan.push({
					start: pae.getStart(sf),
					end: (asn as ts.BinaryExpression).operatorToken.getEnd(),
					text: `__ALIAS__.put(${s.name},`,
				});
				plan.push({ start: asn.getEnd(), end: asn.getEnd(), text: ")" });
			}
			// compound assignment (+= -= &&= ...) — the read+write can't be
			// expressed as one S.put, so bail. Range is COMPOUND ops only, so a
			// plain binary like `s.value * 2` falls through to the read branch.
			else if (
				opk >= ts.SyntaxKind.FirstCompoundAssignment &&
				opk <= ts.SyntaxKind.LastCompoundAssignment
			) {
				ok = false;
				break;
			}
			// ++/--, delete: mutations a get()-rewrite would turn into syntax
			// errors (`__sp.get(s)++`). Bail so the whole file still lowers
			// cleanly with this signal on the object API.
			else if (
				(ts.isPostfixUnaryExpression(asn) || ts.isPrefixUnaryExpression(asn)) &&
				(asn.operator === ts.SyntaxKind.PlusPlusToken ||
					asn.operator === ts.SyntaxKind.MinusMinusToken)
			) {
				ok = false;
				break;
			} else if (ts.isDeleteExpression(asn)) {
				ok = false;
				break;
			}
			// destructuring write target (`[s.value] = arr`, `({x: s.value} = o)`)
			// — a get() there is a syntax error; walk up through literal layers
			// and bail if the chain ends on the LEFT of an `=`.
			else if (isDestructuringTarget(pae)) {
				ok = false;
				break;
			} else
				plan.push({ start: pae.getStart(sf), end: pae.getEnd(), text: `__ALIAS__.get(${s.name})` }); // read
		}
		if (!ok) {
			bailed++;
			continue;
		}
		lowered++;
		// signal(init) -> __sp.sig(init) ; computed(fn) -> __sp.computed(fn).
		// WRAP the call head (don't slurp the argument) so a nested signal
		// read in the argument — `computed(() => a.value)` — lowers too.
		const call = s.call,
			method = s.kind === "sig" ? "sig" : "computed";
		if (call.arguments.length === 0)
			edits.push({
				start: call.getStart(sf),
				end: call.getEnd(),
				text: `__ALIAS__.${method}(${s.initText})`,
			}); // initText == "undefined"
		else
			edits.push({
				start: call.getStart(sf),
				end: call.arguments.pos,
				text: `__ALIAS__.${method}(`,
			}); // keeps arg + `)`
		edits.push(...plan);
	}
	if (!lowered) return { code: text, lowered: 0, bailed };

	const alias = freshAlias(sf);
	let out = text;
	for (const e of edits.sort((a, b) => b.start - a.start))
		out = out.slice(0, e.start) + e.text.replaceAll("__ALIAS__", alias) + out.slice(e.end);
	out = `import { S as ${alias} } from "${SRC_MODULE}";\n` + out;
	return { code: out, lowered, bailed };
}

function selftest(): void {
	const IMP = 'import { useState } from "runtime/signals";\n';
	const eq = (c: string, cond: boolean, m: string) => {
		if (!cond) {
			console.error("FAIL:", m, "\n", c);
			process.exit(1);
		}
	};

	let r = lower(
		IMP +
			"const [count, setCount] = useState(st.count());\n" +
			'render(() => x(Label, { string: () => "c" + count() }));\n' +
			"setCount(c => c + 1);\nsetCount(5);\nsetCount();\nobj.setCount(1);\n",
	);
	eq(r.code, r.lowered === 1 && r.bailed === 0, "happy counts");
	eq(r.code, r.code.includes("const count = __sp.sig(st.count())"), "decl + property init kept");
	eq(r.code, r.code.includes("__sp.get(count)"), "getter");
	eq(r.code, r.code.includes("__sp.set(count, c => c + 1)"), "functional set");
	eq(r.code, r.code.includes("__sp.set(count, 5)"), "plain set");
	eq(r.code, r.code.includes("__sp.set(count, undefined)"), "empty set");
	eq(r.code, r.code.includes("obj.setCount(1)"), "property setter untouched");
	eq(r.code, r.code.startsWith('import { S as __sp } from "runtime/signals";'), "import injected");

	// aliasing bails (setter used as a value)
	r = lower(IMP + "const [a, setA] = useState(1);\nconst p = setA;\nsetA(1);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "alias bail");
	eq(r.code, !r.code.includes("__sp"), "no alias injected on full bail");

	// shadowing is resolved by SYMBOL: the inner `b` is a different binding,
	// so the outer getter/setter lower correctly and the shadow is untouched
	r = lower(
		IMP +
			"const [b, setB] = useState(2);\n" +
			"function f(b) { return b * 2; }\nconsole.log(b());\nsetB(1);\n",
	);
	eq(r.code, r.lowered === 1 && r.bailed === 0, "shadow resolves by symbol");
	eq(r.code, r.code.includes("__sp.get(b)"), "outer getter lowered");
	eq(r.code, /return b \* 2/.test(r.code), "shadow param untouched");

	// getter with args bails
	r = lower(IMP + "const [g1, sG1] = useState(0);\ng1(42);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "getter-with-args bail");

	// strings/comments are data, ${...} is code
	r = lower(
		IMP +
			"const [n, setN] = useState(0);\n" +
			'const t = "call n() and setN";  // n() setN\n' +
			"const u = `tpl n() ${n()} end`;\nsetN(1);\n",
	);
	eq(r.code, r.lowered === 1, "string/comment no false bail");
	eq(r.code, r.code.includes('"call n() and setN"'), "string untouched");
	eq(r.code, r.code.includes("// n() setN"), "comment untouched");
	eq(r.code, r.code.includes("${__sp.get(n)}"), "interpolation lowered");

	// foreign useState untouched; alias collision -> unique name
	const foreign = 'import { useState } from "react";\nconst [x, sX] = useState(0);\nsX(1);\n';
	eq("", lower(foreign).lowered === 0 && lower(foreign).code === foreign, "foreign untouched");
	r = lower(IMP + "const __sp = 1;\nconst [y, sY] = useState(0);\nsY(y() + 1);\n");
	eq(r.code, r.lowered === 1 && r.code.includes("__sp2.sig("), "alias collision -> __sp2");

	// idempotent
	const once = lower(IMP + "const [z, sZ] = useState(0);\nsZ(z() + 1);\n").code;
	eq(once, lower(once).code === once, "idempotent");

	// --- Stage 3: direct signal() ---
	const SIG = 'import { signal } from "runtime/signals";\n';
	r = lower(
		SIG +
			"const flag = signal(false);\n" +
			"render(() => flag.value ? 1 : 0);\nflag.value = !flag.value;\n",
	);
	eq(r.code, r.lowered === 1 && r.bailed === 0, "signal happy");
	eq(r.code, r.code.includes("const flag = __sp.sig(false)"), "signal decl");
	eq(r.code, r.code.includes("__sp.get(flag)"), "signal read");
	eq(
		r.code,
		r.code.includes("__sp.put(flag, !__sp.get(flag))"),
		"signal write nests read (raw put)",
	);
	// signal used as a value (not .value) bails
	r = lower(SIG + "const s = signal(0);\nconst r2 = s;\ns.value = 1;\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "signal alias bail");
	// s.value += 1 (compound) bails
	r = lower(SIG + "const s = signal(0);\ns.value += 1;\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "signal compound-assign bail");
	// assignment used as a value bails (S.set returns undefined, not the value)
	r = lower(SIG + "const s = signal(0);\nconst y = (s.value = 5);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "signal value-used-assignment bail");
	// useState + signal together, share one alias
	r = lower(
		'import { useState, signal } from "runtime/signals";\n' +
			"const [c, sc] = useState(0);\nconst f = signal(1);\n" +
			"sc(c() + f.value);\nf.value = 2;\n",
	);
	eq(r.code, r.lowered === 2 && r.bailed === 0, "mixed useState+signal");
	eq(r.code, r.code.includes("__sp.set(c, __sp.get(c) + __sp.get(f))"), "mixed refs");

	// ++/-- bails (a get() rewrite would be a syntax error)
	r = lower(SIG + "const s = signal(0);\ns.value++;\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "signal ++ bails");
	// destructuring write target bails
	r = lower(SIG + "const s = signal(0);\n[s.value] = [1];\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "signal destructuring-write bails");
	// destructuring READ does not bail
	r = lower(SIG + "const s = signal(0);\nconst a = [s.value];\ns.value = 1;\n");
	eq(
		r.code,
		r.lowered === 1 && r.code.includes("[__sp.get(s)]"),
		"array-literal read still lowers",
	);

	// --- Stage 3: computed() / useMemo() (read-only derived) ---
	r = lower(
		'import { signal, computed } from "runtime/signals";\n' +
			"const a = signal(1);\nconst d = computed(() => a.value * 2);\n" +
			"render(() => d.value);\n",
	);
	eq(r.code, r.lowered === 2 && r.bailed === 0, "computed lowers");
	eq(
		r.code,
		r.code.includes("const d = __sp.computed(() => __sp.get(a) * 2)"),
		"computed decl keeps fn, nested read lowered",
	);
	eq(r.code, r.code.includes("render(() => __sp.get(d))"), "computed read lowered");
	// writing a computed bails (read-only; stays object API where it's caller error)
	r = lower(
		'import { computed } from "runtime/signals";\n' +
			"const d = computed(() => 1);\nd.value = 2;\n",
	);
	eq(r.code, r.lowered === 0 && r.bailed === 1, "computed write bails");
	// useMemo is the same primitive
	r = lower(
		'import { useMemo } from "runtime/signals";\n' +
			"const m = useMemo(() => 5);\nrender(() => m.value);\n",
	);
	eq(
		r.code,
		r.lowered === 1 && r.code.includes("const m = __sp.computed(() => 5)"),
		"useMemo lowers to computed",
	);
	eq(r.code, r.code.includes("__sp.get(m)"), "useMemo read lowered");

	// --- Stage 1.5: JSX auto-thunk (bundled jsx-factory form) ---
	const JSXIMP =
		'import { useState, signal } from "runtime/signals";\n' +
		'import { jsx } from "runtime/jsx-runtime";\n';
	// bare reactive read in a prop -> wrapped into a thunk, THEN lowered
	r = lower(
		JSXIMP + "const [count, setCount] = useState(0);\n" + "jsx(Label, { string: count() });\n",
	);
	eq(
		r.code,
		r.code.includes("string: () => (__sp.get(count))"),
		"auto-thunk wraps + lowers getter",
	);
	// expression containing a read is wrapped whole (so it stays reactive)
	r = lower(
		JSXIMP +
			"const [count, setCount] = useState(0);\n" +
			'jsx(Label, { string: "c" + count() });\n',
	);
	eq(
		r.code,
		r.code.includes('string: () => ("c" + __sp.get(count))'),
		"auto-thunk wraps expression",
	);
	// signal .value read wrapped too
	r = lower(JSXIMP + "const s = signal(0);\n" + "jsx(Label, { string: s.value });\n");
	eq(r.code, r.code.includes("string: () => (__sp.get(s))"), "auto-thunk wraps signal .value");
	// already-a-thunk is left alone (idempotent authoring + our own output)
	r = lower(
		JSXIMP +
			"const [count, setCount] = useState(0);\n" +
			"jsx(Label, { string: () => count() });\n",
	);
	eq(r.code, r.code.includes("string: () => __sp.get(count)"), "existing thunk not double-wrapped");
	eq(r.code, !r.code.includes("() => (() =>"), "no double thunk");
	// static prop with NO reactive read is untouched
	r = lower(
		JSXIMP + "const [count, setCount] = useState(0);\n" + "jsx(Label, { string: 'x', top: 40 });\n",
	);
	eq(r.code, !/=>\s*\('x'\)/.test(r.code) && r.code.includes("top: 40"), "static props untouched");
	// event handler (a function) never wrapped
	r = lower(
		JSXIMP +
			"const [count, setCount] = useState(0);\n" +
			"jsx(Btn, { onTap: () => setCount(count() + 1) });\n",
	);
	eq(r.code, !r.code.includes("onTap: () => (() =>"), "event handler not wrapped");
	// children prop with a reactive read is NOT auto-wrapped (fn-child path)
	r = lower(JSXIMP + "const s = signal(0);\n" + "jsx(Box, { children: s.value });\n");
	eq(r.code, !r.code.includes("children: () =>"), "children not auto-wrapped");

	// A1 regression 1: a COMPONENT prop is NEVER auto-thunked. VirtualList is an
	// imported function (resolves to a symbol), so `rows={count()}` — a plain
	// NUMBER the component reads directly — is lowered but NOT wrapped (wrapping
	// would hand the component a function and silently render nothing).
	r = lower(
		'import { useState } from "runtime/signals";\n' +
			'import { jsx } from "runtime/jsx-runtime";\n' +
			'import { VirtualList } from "runtime/flow";\n' +
			"const [count, setCount] = useState(0);\n" +
			"jsx(VirtualList, { rows: count() });\n",
	);
	eq(r.code, r.code.includes("rows: __sp.get(count)"), "component prop lowered but NOT thunked");
	eq(r.code, !r.code.includes("rows: () =>"), "component prop not wrapped");

	// A1 regression 2: a host NON-whitelist (position/size) prop is NOT auto-
	// thunked. `width={count()}` on a Label reads once statically (lowered but not
	// wrapped) — wrapping it would trip jsx-runtime's bind-time position reject.
	r = lower(
		JSXIMP + "const [count, setCount] = useState(0);\n" + "jsx(Label, { width: count() });\n",
	);
	eq(r.code, r.code.includes("width: __sp.get(count)"), "host non-whitelist prop lowered");
	eq(r.code, !r.code.includes("width: () =>"), "host position prop not wrapped");

	// idempotent end-to-end
	const twice = lower(JSXIMP + "const s = signal(0);\njsx(Label, { string: s.value });\n").code;
	eq(twice, lower(twice).code === twice, "auto-thunk + lowering idempotent");
	console.log("lower.mts selftest OK");
}

const argv = process.argv.slice(2);
if (argv[0] === "--selftest") {
	selftest();
} else {
	for (const path of argv) {
		const src = readFileSync(path, "utf8");
		const { code, lowered, bailed } = lower(src);
		if (code !== src) {
			// Idempotency guard, every prod build: lowering its own output must
			// be a fixed point. If a second pass would change the code again,
			// pass one missed or double-applied something — fail LOUD, don't
			// ship a possibly-corrupt lower.
			const second = lower(code);
			if (second.code !== code) {
				console.error(
					`lower: ${path} NOT IDEMPOTENT — second pass changed the output; refusing to write`,
				);
				process.exit(1);
			}
			writeFileSync(path, code);
		}
		console.log(`lower: ${path}  ${lowered} lowered, ${bailed} bailed`);
	}
}
