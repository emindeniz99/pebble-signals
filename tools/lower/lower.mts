// Stage-2/3 lowering: rewrite useState/signal/computed + call sites to the
// packed S API (see the header in cli.mts for the full contract).
import ts from "typescript";
import { autoThunk } from "./auto-thunk.mts";
import {
	type Edit,
	SRC_MODULE,
	collectIdentifiers,
	freshAlias,
	importSymbol,
	isDestructuringTarget,
	program,
} from "./program.mts";

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
