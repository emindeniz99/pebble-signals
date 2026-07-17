// Selftest — the executable contract of the lowering (run on every build).
import { lower } from "./lower.mts";

export function selftest(): void {
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

	// value-escapes getSymbolAtLocation can't see — each must BAIL, not lower
	// away the binding under a live reference (the pulse `{ setName }` death):
	// shorthand property, export specifier (plain + aliased), getter shorthand.
	r = lower(IMP + "const [a, setA] = useState(1);\nconst p = { setA };\nsetA(1);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "shorthand-prop escape bails");
	r = lower(IMP + "const [a, setA] = useState(1);\nexport { setA };\nsetA(1);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "export-specifier escape bails");
	r = lower(IMP + "const [a, setA] = useState(1);\nexport { setA as pub };\nsetA(1);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "aliased-export escape bails");
	r = lower(IMP + "const [a, setA] = useState(1);\nconst p = { a };\nsetA(a() + 1);\n");
	eq(r.code, r.lowered === 0 && r.bailed === 1, "getter shorthand escape bails");
	// a shorthand KEY that only shadows the name (`{ setA: 1 }`) is a property,
	// not a reference — no false bail.
	r = lower(IMP + "const [a, setA] = useState(1);\nconst p = { setA: 1 };\nsetA(a() + 1);\n");
	eq(r.code, r.lowered === 1 && r.bailed === 0, "property KEY named like setter no false bail");
	// signal escaping via shorthand bails the same way
	r = lower(
		'import { signal } from "runtime/signals";\n' +
			"const s = signal(0);\nconst p = { s };\ns.value = 1;\n",
	);
	eq(r.code, r.lowered === 0 && r.bailed === 1, "signal shorthand escape bails");
	// a full bail is BYTE-IDENTICAL (no alias import, no partial edits)
	const escSrc = IMP + "const [a, setA] = useState(1);\nconst p = { setA };\nsetA(1);\n";
	eq(lower(escSrc).code, lower(escSrc).code === escSrc, "escape bail is byte-identical");
	// per-pair independence: an escaped pair bails while its neighbor lowers
	r = lower(
		IMP +
			"const [a, setA] = useState(1);\nconst [b, setB] = useState(2);\n" +
			"const p = { setA };\nsetA(1);\nsetB(b() + 1);\n",
	);
	eq(r.code, r.lowered === 1 && r.bailed === 1, "escaped pair bails, neighbor lowers");
	eq(r.code, r.code.includes("const [a, setA] = useState(1)"), "escaped pair decl kept");
	eq(r.code, r.code.includes("__sp.set(b, __sp.get(b) + 1)"), "neighbor pair still lowered");

	// EXPORTED declarations are never candidates — importers need the real
	// bindings (lowering deleted the setter / repacked the signal; measured)
	const expPair = IMP + "export const [e1, sE1] = useState(1);\nsE1(e1() + 1);\n";
	r = lower(expPair);
	eq(r.code, r.lowered === 0 && r.bailed === 0 && r.code === expPair, "exported pair untouched");
	const expSig =
		'import { signal } from "runtime/signals";\n' + "export const es = signal(0);\nes.value = 1;\n";
	r = lower(expSig);
	eq(r.code, r.lowered === 0 && r.bailed === 0 && r.code === expSig, "exported signal untouched");

	// a lowerable reference INSIDE useState's initializer lowers cleanly
	// (decl edit wraps the call head — slurping overlapped the nested edit)
	r = lower(
		'import { useState, signal } from "runtime/signals";\n' +
			"const f = signal(1);\nconst [c, sc] = useState(f.value);\nsc(c() + 1);\nf.value = 2;\n",
	);
	eq(r.code, r.lowered === 2 && r.bailed === 0, "pair init nested ref counts");
	eq(r.code, r.code.includes("const c = __sp.sig(__sp.get(f))"), "pair init nested ref lowers");

	// mutations THROUGH parentheses bail (a get()-rewrite is a syntax error);
	// parenthesized READS still lower
	const SIGP = 'import { signal } from "runtime/signals";\n';
	eq("", lower(SIGP + "const s = signal(0);\n(s.value)++;\n").bailed === 1, "paren ++ bails");
	eq("", lower(SIGP + "const s = signal(0);\n(s.value) = 1;\n").bailed === 1, "paren assign bails");
	eq(
		"",
		lower(SIGP + "const s = signal(0);\n[(s.value)] = [1];\n").bailed === 1,
		"paren destructuring-write bails",
	);
	r = lower(SIGP + "const s = signal(0);\nconst r3 = ((s.value)) + 0;\ns.value = 1;\n");
	eq(r.code, r.lowered === 1 && r.code.includes("((__sp.get(s)))"), "paren read still lowers");

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
	console.log("lower selftest OK");
}
