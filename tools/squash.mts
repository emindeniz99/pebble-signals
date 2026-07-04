// Automated SQUASH pass — the compiler fix for the per-function-object law
// (playbook "Code in ROM": loading a module builds EVERY module-level
// function object in RAM at ~5-6 slots each; 70 thin arrows DIE where the
// same 70 bodies switch-packed into ONE function boot — lazymany vs
// lazypack, device-proven). This pass applies that exact transform
// mechanically to a built module: a module-level
//
//   const H = [ (x) => …, (x) => …, … ];        // N function objects
//
// whose every use is `H[i](args)` (or `H.length`) becomes
//
//   const H = ($i, $a0, …) => { switch ($i) { case 0: … } };  // ONE object
//
// with call sites rewritten to `H($i, args)` and `.length` folded to the
// literal count. Deliberately NARROW — any shape it cannot prove safe is
// left untouched (the build's >16-fn advisory still fires for those):
//   - const, non-exported, module-level, single declarator, ≥2 elements
//   - every element a non-async arrow with plain identifier params
//   - no `var` in block bodies (var would hoist into the shared dispatch fn)
//   - the array identifier appears ONLY as `H[expr](…)` calls or `H.length`
//     anywhere in the file (same-name shadowing counts as a use — bail)
// Known semantic deviation (documented, accepted): an out-of-range index
// returns undefined from the switch instead of throwing "not a function".
//
// Usage: node tools/squash.mts <file.js>   — rewrites in place.
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

export interface SquashResult {
	out: string;
	packed: { name: string; count: number }[];
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

export function squash(source: string): SquashResult | null {
	const sf = ts.createSourceFile("m.js", source, ts.ScriptTarget.ES2025, true, ts.ScriptKind.JS);
	// fresh identifier prefix — no `$q…` text may exist anywhere in the source
	let prefix = "$q";
	for (let n = 0; source.includes(prefix); n++) prefix = `$q${n}_`;

	const edits: Edit[] = [];
	const packed: { name: string; count: number }[] = [];
	for (const st of sf.statements) {
		if (!ts.isVariableStatement(st)) continue;
		if (ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
		if (!(st.declarationList.flags & ts.NodeFlags.Const)) continue;
		if (st.declarationList.declarations.length !== 1) continue;
		const decl = st.declarationList.declarations[0];
		if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
		if (!ts.isArrayLiteralExpression(decl.initializer)) continue;
		const name = decl.name.text;
		const arrows = decl.initializer.elements;
		if (arrows.length < 2) continue;
		if (!arrows.every(isPackableArrow)) continue;
		const uses = collectUses(sf, name, decl.name);
		if (!uses) continue; // an unprovable use somewhere — leave untouched

		// dispatch signature: index + one arg slot per widest arrow
		const arity = Math.max(...arrows.map((a) => (a as ts.ArrowFunction).parameters.length));
		const argNames = Array.from({ length: arity }, (_, k) => `${prefix}a${k}`);
		const cases = arrows.map((el, k) => {
			const a = el as ts.ArrowFunction;
			const alias = a.parameters.length
				? `const ${a.parameters.map((p, j) => `${p.name.getText(sf)} = ${argNames[j]}`).join(", ")}; `
				: "";
			if (ts.isBlock(a.body)) {
				const inner = a.body.statements.map((s) => s.getText(sf)).join(" ");
				return `case ${k}: { ${alias}${inner} return; }`;
			}
			return `case ${k}: { ${alias}return (${a.body.getText(sf)}); }`;
		});
		edits.push({
			start: st.getStart(sf),
			end: st.getEnd(),
			text: `const ${name} = (${[`${prefix}i`, ...argNames].join(", ")}) => { switch (${prefix}i) { ${cases.join(" ")} } };`,
		});
		for (const use of uses) {
			if (use.kind === "length") {
				edits.push({
					start: use.node.getStart(sf),
					end: use.node.getEnd(),
					text: `${arrows.length}`,
				});
			} else {
				const call = use.node as ts.CallExpression;
				const index = (call.expression as ts.ElementAccessExpression).argumentExpression;
				const args = [index, ...call.arguments].map((a) => a.getText(sf));
				edits.push({
					start: call.getStart(sf),
					end: call.getEnd(),
					text: `${name}(${args.join(", ")})`,
				});
			}
		}
		packed.push({ name, count: arrows.length });
	}
	if (!packed.length) return null;
	edits.sort((a, b) => b.start - a.start);
	let out = source;
	for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
	return { out, packed };
}

const isPackableArrow = (el: ts.Expression): boolean => {
	if (!ts.isArrowFunction(el)) return false;
	if (ts.getModifiers(el)?.length) return false; // async
	if (!el.parameters.every((p) => ts.isIdentifier(p.name) && !p.initializer && !p.dotDotDotToken))
		return false;
	// `var` in a block body would hoist into the shared dispatch function
	if (ts.isBlock(el.body)) {
		let sawVar = false;
		const walk = (n: ts.Node): void => {
			if (ts.isArrowFunction(n) || ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n))
				return; // nested function scopes keep their own vars
			if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)))
				sawVar = true;
			ts.forEachChild(n, walk);
		};
		walk(el.body);
		if (sawVar) return false;
	}
	return true;
};

type Use = { kind: "call" | "length"; node: ts.Node };
// Every appearance of `name` must be `name[expr](…)` or `name.length`; return
// null when any other appearance exists (including same-name shadowing —
// cheaper to bail than to scope-analyze, and always safe).
const collectUses = (sf: ts.SourceFile, name: string, declName: ts.Node): Use[] | null => {
	const uses: Use[] = [];
	let bad = false;
	const walk = (n: ts.Node): void => {
		if (bad) return;
		if (ts.isIdentifier(n) && n.text === name && n !== declName) {
			const p = n.parent;
			if (
				ts.isElementAccessExpression(p) &&
				p.expression === n &&
				ts.isCallExpression(p.parent) &&
				p.parent.expression === p
			) {
				uses.push({ kind: "call", node: p.parent });
			} else if (
				ts.isPropertyAccessExpression(p) &&
				p.expression === n &&
				p.name.text === "length"
			) {
				uses.push({ kind: "length", node: p });
			} else if (!(ts.isPropertyAccessExpression(p) && p.name === n)) {
				bad = true; // any other use (assignment, argument, bare index, …)
			}
		}
		ts.forEachChild(n, walk);
	};
	walk(sf);
	return bad ? null : uses;
};

if (import.meta.main) {
	const file = process.argv[2];
	const res = squash(readFileSync(file, "utf8"));
	if (!res) {
		console.log("squash: no packable arrays");
	} else {
		writeFileSync(file, res.out);
		for (const p of res.packed) console.log(`squash: ${p.name} — ${p.count} bodies -> 1 fn`);
	}
}
