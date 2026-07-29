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
import ts from "typescript";
import { type Edit, JSX_MODULE, importSymbol, program } from "./program.mts";
import { REACTIVE_PROPS, isPiuHostType } from "./runtime-meta.mts";

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
	// useReducer is useState under the hood — it returns `[() => S, dispatch]`,
	// so its first binding is read as `count()` exactly like a useState getter.
	// The factory set omitted it, so `const [c, d] = useReducer(...)` left the
	// documented bare form `string={c()}` unwrapped — evaluated once, then dead
	// to every `dispatch()` (codex P2).
	const reducerSym = importSymbol(checker, sf, "useReducer");
	// NAMESPACE imports of the signals module (`import * as sig from
	// "runtime/signals"`): `sig.useState(...)` is the same factory — the
	// named-import-only collector left a namespace user's documented bare
	// reactive form (`string={count()}`) unwrapped, so the prop evaluated
	// once into a static host value and later writes never refreshed it
	// (codex P2).
	const nsSyms = new Set<ts.Symbol>();
	for (const st of sf.statements)
		if (
			ts.isImportDeclaration(st) &&
			ts.isStringLiteral(st.moduleSpecifier) &&
			/(?:^|\/)signals$/.test(st.moduleSpecifier.text) &&
			st.importClause?.namedBindings &&
			ts.isNamespaceImport(st.importClause.namedBindings)
		) {
			const s = checker.getSymbolAtLocation(st.importClause.namedBindings.name);
			if (s) nsSyms.add(s);
		}
	const NS_FACTORIES = new Set(["useState", "useReducer", "signal", "computed", "useMemo"]);
	const getterSyms = new Set<ts.Symbol>(); // read as g()
	const valueSyms = new Set<ts.Symbol>(); // read as x.value
	(function walk(n: ts.Node) {
		if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer)) {
			const ce = n.initializer.expression;
			// which factory made this binding — by resolved symbol for named
			// imports, by namespace symbol + property name for `sig.useState`
			let kind: string | null = null;
			if (ts.isIdentifier(ce)) {
				const callee = checker.getSymbolAtLocation(ce);
				if (callee)
					kind =
						useSym && callee === useSym
							? "useState"
							: reducerSym && callee === reducerSym
								? "useReducer"
								: sigSym && callee === sigSym
									? "signal"
									: compSym && callee === compSym
										? "computed"
										: memoSym && callee === memoSym
											? "useMemo"
											: null;
			} else if (ts.isPropertyAccessExpression(ce) && ts.isIdentifier(ce.expression)) {
				const ns = checker.getSymbolAtLocation(ce.expression);
				if (ns && nsSyms.has(ns) && NS_FACTORIES.has(ce.name.text)) kind = ce.name.text;
			}
			const el0 = ts.isArrayBindingPattern(n.name) ? n.name.elements[0] : undefined;
			if (
				(kind === "useState" || kind === "useReducer") &&
				ts.isArrayBindingPattern(n.name) &&
				// getter is element[0]; a read-only `const [count] = useState(0)`
				// (setter intentionally dropped) is a valid one-element destructure
				// and must collect just like `[count, setCount]` — requiring exactly
				// two left it a one-time eval that no write refreshed (codex P2)
				n.name.elements.length >= 1 &&
				el0 &&
				!ts.isOmittedExpression(el0) &&
				ts.isIdentifier(el0.name)
			) {
				const s = checker.getSymbolAtLocation(el0.name);
				if (s) getterSyms.add(s);
			} else if (
				(kind === "signal" || kind === "computed" || kind === "useMemo") &&
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

	const edits: Edit[] = [];
	(function walk(n: ts.Node) {
		if (
			ts.isCallExpression(n) &&
			isJsxCall(n) &&
			n.arguments.length >= 2 &&
			ts.isObjectLiteralExpression(n.arguments[1]) &&
			isPiuHostType(checker, n.arguments[0]) // ONLY host elements — never components
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
