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
// Usage: node lower.mjs FILE...    |    node lower.mjs --selftest
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

async function loadTS() {
	try { return (await import("typescript")).default; } catch { /* fall back */ }
	const root = execSync("npm root -g").toString().trim();
	return (await import(`${root}/typescript/lib/typescript.js`)).default;
}
const ts = await loadTS();

const SRC_MODULE = "runtime/signals";

function program(text) {
	const fileName = "app.js";
	const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
	const host = {
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
	const prog = ts.createProgram([fileName], {
		allowJs: true, checkJs: false, noLib: true, noResolve: true,
		types: [], target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
	}, host);
	return { checker: prog.getTypeChecker(), sf: prog.getSourceFile(fileName) };
}

// symbol of the local `useState` binding IF imported from runtime/signals
// symbol of a local binding imported by `name` from runtime/signals (else null)
function importSymbol(checker, sf, name) {
	let sym = null;
	for (const st of sf.statements) {
		if (ts.isImportDeclaration(st)
			&& ts.isStringLiteral(st.moduleSpecifier)
			&& st.moduleSpecifier.text === SRC_MODULE
			&& st.importClause?.namedBindings
			&& ts.isNamedImports(st.importClause.namedBindings)) {
			for (const el of st.importClause.namedBindings.elements) {
				if ((el.propertyName ?? el.name).text === name)
					sym = checker.getSymbolAtLocation(el.name);
			}
		}
	}
	return sym;
}

function collectIdentifiers(sf) {
	const ids = [];
	(function walk(n) {
		if (ts.isIdentifier(n)) ids.push(n);
		ts.forEachChild(n, walk);
	})(sf);
	return ids;
}

function freshAlias(sf) {
	const used = new Set(collectIdentifiers(sf).map((i) => i.text));
	let a = "__sp";
	for (let k = 2; used.has(a); k++) a = "__sp" + k;
	return a;
}

export function lower(text) {
	const { checker, sf } = program(text);
	const useSym = importSymbol(checker, sf, "useState");
	const sigSym = importSymbol(checker, sf, "signal");
	if (!useSym && !sigSym) return { code: text, lowered: 0, bailed: 0 };

	const declIds = new Set();
	const txt = (n) => text.slice(n.getStart(sf), n.getEnd());

	// candidate useState pairs: const [g, s] = useState(init) whose useState is OURS
	const pairs = [];
	// candidate signal bindings: const s = signal(init) whose signal is OURS
	const sigs = [];
	(function walk(n) {
		if (ts.isVariableDeclaration(n) && n.initializer && ts.isCallExpression(n.initializer)
			&& ts.isIdentifier(n.initializer.expression)) {
			const callee = checker.getSymbolAtLocation(n.initializer.expression);
			const init = n.initializer.arguments[0];
			const initText = init ? txt(init) : "undefined";
			if (useSym && callee === useSym && n.name && ts.isArrayBindingPattern(n.name)
				&& n.name.elements.length === 2) {
				const [ge, se] = n.name.elements;
				if (!ts.isOmittedExpression(ge) && !ts.isOmittedExpression(se)
					&& ts.isIdentifier(ge.name) && ts.isIdentifier(se.name)) {
					pairs.push({ decl: n, gName: ge.name.text, initText,
						gSym: checker.getSymbolAtLocation(ge.name),
						sSym: checker.getSymbolAtLocation(se.name) });
					declIds.add(ge.name); declIds.add(se.name);
				}
			}
			else if (sigSym && callee === sigSym && n.name && ts.isIdentifier(n.name)) {
				sigs.push({ call: n.initializer, name: n.name.text, initText,
					sym: checker.getSymbolAtLocation(n.name) });
				declIds.add(n.name);
			}
		}
		ts.forEachChild(n, walk);
	})(sf);
	if (!pairs.length && !sigs.length) return { code: text, lowered: 0, bailed: 0 };

	// classify every reference by resolved symbol (not by name)
	const refs = new Map();
	for (const p of pairs) { refs.set(p.gSym, []); refs.set(p.sSym, []); }
	for (const s of sigs) refs.set(s.sym, []);
	for (const id of collectIdentifiers(sf)) {
		if (declIds.has(id)) continue;
		const s = checker.getSymbolAtLocation(id);
		if (s && refs.has(s)) refs.get(s).push(id);
	}
	const isCallTarget = (id) => ts.isCallExpression(id.parent) && id.parent.expression === id;

	const edits = [];
	let lowered = 0, bailed = 0;
	for (const p of pairs) {
		let ok = true;
		for (const id of refs.get(p.gSym))				// getter: 0-arg call only
			if (!(isCallTarget(id) && id.parent.arguments.length === 0)) ok = false;
		for (const id of refs.get(p.sSym))				// setter: call target only
			if (!isCallTarget(id)) ok = false;
		if (!ok) { bailed++; continue; }
		lowered++;
		edits.push({ start: p.decl.getStart(sf), end: p.decl.getEnd(),
			text: `${p.gName} = __ALIAS__.sig(${p.initText})` });
		for (const id of refs.get(p.gSym))
			edits.push({ start: id.parent.getStart(sf), end: id.parent.getEnd(),
				text: `__ALIAS__.get(${p.gName})` });
		for (const id of refs.get(p.sSym)) {
			const c = id.parent;
			if (c.arguments.length === 0)						// setX()
				edits.push({ start: c.getStart(sf), end: c.getEnd(),
					text: `__ALIAS__.set(${p.gName}, undefined)` });
			else								// wrap not slurp: keep arg + `)` so nested reads lower
				edits.push({ start: c.getStart(sf), end: c.arguments.pos,
					text: `__ALIAS__.set(${p.gName}, ` });
		}
	}
	// Stage 3: direct signal() — every ref must be `s.value` (read or a
	// statement-level `s.value = e` write); anything else bails.
	for (const s of sigs) {
		const uses = refs.get(s.sym);
		const plan = [];
		let ok = true;
		for (const id of uses) {
			const pae = id.parent;
			if (!(ts.isPropertyAccessExpression(pae) && pae.expression === id
				&& pae.name.text === "value")) { ok = false; break; }
			const asn = pae.parent;
			if (ts.isBinaryExpression(asn) && asn.left === pae
				&& asn.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
				if (!ts.isExpressionStatement(asn.parent)) { ok = false; break; }	// value-used assignment
				// two edits so nested reads in the RHS lower independently:
				// `s.value =` -> `__sp.set(s,`  and  insert `)` after the RHS
				plan.push({ start: pae.getStart(sf), end: asn.operatorToken.getEnd(),
					text: `__ALIAS__.set(${s.name},` });
				plan.push({ start: asn.getEnd(), end: asn.getEnd(), text: ")" });
			}
			else if (ts.isBinaryExpression(asn) && asn.left === pae) { ok = false; break; }	// compound (+= etc)
			else
				plan.push({ start: pae.getStart(sf), end: pae.getEnd(),
					text: `__ALIAS__.get(${s.name})` });							// read
		}
		if (!ok) { bailed++; continue; }
		lowered++;
		edits.push({ start: s.call.getStart(sf), end: s.call.getEnd(),
			text: `__ALIAS__.sig(${s.initText})` });
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

function selftest() {
	const IMP = 'import { useState } from "runtime/signals";\n';
	const eq = (c, cond, m) => { if (!cond) { console.error("FAIL:", m, "\n", c); process.exit(1); } };

	let r = lower(IMP +
		"const [count, setCount] = useState(st.count());\n" +
		'render(() => x(Label, { string: () => "c" + count() }));\n' +
		"setCount(c => c + 1);\nsetCount(5);\nsetCount();\nobj.setCount(1);\n");
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
	r = lower(IMP + "const [b, setB] = useState(2);\n"
		+ "function f(b) { return b * 2; }\nconsole.log(b());\nsetB(1);\n");
	eq(r.code, r.lowered === 1 && r.bailed === 0, "shadow resolves by symbol");
	eq(r.code, r.code.includes("__sp.get(b)"), "outer getter lowered");
	eq(r.code, /return b \* 2/.test(r.code), "shadow param untouched");

	// getter with args bails
	r = lower(IMP + "const [g1, sG1] = useState(0);\ng1(42);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "getter-with-args bail");

	// strings/comments are data, ${...} is code
	r = lower(IMP + "const [n, setN] = useState(0);\n"
		+ 'const t = "call n() and setN";  // n() setN\n'
		+ "const u = `tpl n() ${n()} end`;\nsetN(1);\n");
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
	r = lower(SIG + "const flag = signal(false);\n"
		+ "render(() => flag.value ? 1 : 0);\nflag.value = !flag.value;\n");
	eq(r.code, r.lowered === 1 && r.bailed === 0, "signal happy");
	eq(r.code, r.code.includes("const flag = __sp.sig(false)"), "signal decl");
	eq(r.code, r.code.includes("__sp.get(flag)"), "signal read");
	eq(r.code, r.code.includes("__sp.set(flag, !__sp.get(flag))"), "signal write nests read");
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
	r = lower('import { useState, signal } from "runtime/signals";\n'
		+ "const [c, sc] = useState(0);\nconst f = signal(1);\n"
		+ "sc(c() + f.value);\nf.value = 2;\n");
	eq(r.code, r.lowered === 2 && r.bailed === 0, "mixed useState+signal");
	eq(r.code, r.code.includes("__sp.set(c, __sp.get(c) + __sp.get(f))"), "mixed refs");
	console.log("lower.mjs selftest OK");
}

const argv = process.argv.slice(2);
if (argv[0] === "--selftest") {
	selftest();
} else {
	for (const path of argv) {
		const src = readFileSync(path, "utf8");
		const { code, lowered, bailed } = lower(src);
		if (code !== src) writeFileSync(path, code);
		console.log(`lower: ${path}  ${lowered} lowered, ${bailed} bailed`);
	}
}
