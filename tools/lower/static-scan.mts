// --- Hybrid static/dynamic auto-split — the ANALYSIS pass (roadmap's last bet)
//
// The bet: a fully-STATIC JSX subtree (no thunks, no handlers, no components
// anywhere below it) should not need the reactive runtime path per node, so a
// lowering pass could emit it as direct Piu construction — `new Column(null,
// { …, contents: [new Label(null, {…})] })` — instead of nested jsx() calls.
//
// This module is the ANALYZER for that bet, not the compiler. That is a
// deliberate call, and the measurement is the argument:
//
// 1. WHAT A STATIC SUBTREE ACTUALLY PAYS TODAY. Read createHost: an effect() is
//    created ONLY for a FUNCTION-valued prop. A fully-static subtree therefore
//    already allocates ZERO signals and ZERO effects — the reactive runtime is
//    not on its path at all. What it does pay, per node, is DISPATCH and
//    TRANSIENT garbage: jsx()'s PIU.indexOf scan, createHost's `for k in props`
//    with a `has(BUTTON_EVENTS, k)` string scan per prop, a second object
//    (`dict`) copied out of the props literal, and 2-3 call frames. Both objects
//    are garbage the moment `new type(null, dict)` returns. So the compiler's
//    prize is PEAK/GC pressure and boot CPU — NOT the retained arena, which is
//    the scarce resource (project rule 4) and which the transform leaves
//    byte-for-byte identical. The roadmap's "approach react-pebble's floor"
//    framing does not survive this: react-pebble's lower floor is its ABSENT
//    runtime module, and an app with any dynamic island still ships ours.
//
// 2. HOW MUCH OF A REAL APP QUALIFIES. Measured 2026-07 by this pass over the
//    compiled example catalog — 110 apps, 423 host nodes + 68 component calls:
//    95 nodes (22%) are static by the roadmap's OWN definition, and 31 (7%)
//    are provably compilable today, in 15 subtrees. The blocker histogram says
//    why, and it is not what the roadmap assumed: thunk 134, child 116,
//    handler 75, component 68, prop:style 48, prop:skin 6. The single biggest
//    reason a node is not static is that it carries a LIVE BINDING — the
//    runtime is earning its keep on a third of all nodes. Admitting
//    `style=`/`skin=` (an identifier naming a module-scope `new Style(…)`,
//    static in fact but unprovable from a literal) is the obvious next tier
//    and would still cap out near 20%.
//
// 3. WHY NOT COMPILE IT ANYWAY. Two blockers that no amount of care removes
//    from this session: (a) the `contents:` dictionary path is used NOWHERE in
//    this repo — every node is built with `new X(null, dict)` + add(). It is
//    canonical Piu (piu/All's Container._recurse, and the SDK's own mod-balls
//    example) and the Pebble port imports that same piu/All, so it is
//    PLAUSIBLE — but plausible is not measured, and project rule 2 is explicit
//    that a device claim needs a device receipt. (b) Emitting `contents:` needs
//    a COMPILE-TIME container-vs-leaf table (it is silently ignored on a Label,
//    which would drop children with no error), while the runtime answers the
//    same question at run time with `typeof node.add === "function"`. A second
//    table that can disagree with the runtime is exactly the A1 bug class
//    runtime-meta.mts was written to prevent.
//
// So: report, don't rewrite. Nothing here edits code — it reads the SAME input
// the lowering does (the bundled, already-lowered app/main.js, where jsx calls
// carry their final shape: auto-thunk has run, so every live read is visibly an
// arrow) and prints what qualifies. Opt-in: `--hybrid-static` / HYBRID_STATIC=1,
// default OFF, so a normal build is unchanged down to the archive byte.
//
// Usage: node tools/lower/static-scan.mts FILE...
import { readFileSync } from "node:fs";
import ts from "typescript";
import { JSX_MODULE, importSymbol, program } from "./program.mts";
import { BUTTON_EVENTS, isPiuHostType } from "./runtime-meta.mts";

/** A claimed subtree, named by its outermost jsx() call site. */
export interface StaticSite {
	/** 1-based, so it pastes into an editor jump */
	line: number;
	col: number;
	/** the Piu class — `Column`, `Label`, … */
	type: string;
	/** Piu nodes the subtree constructs (a text child counts as its Label) */
	nodes: number;
	/** non-children props on those nodes — the per-prop membership scans */
	props: number;
}

/**
 * Two tiers, on purpose. `static*` is the ROADMAP's definition (no thunk, no
 * handler, no component anywhere below) and is an UPPER BOUND — a non-literal
 * prop could still hold a thunk this pass cannot see. `compilable*` is the
 * tier a conservative emitter could take today: literal props only, so nothing
 * can turn out to be a function at run time. `blockers` counts, once per host
 * node, the first LOCAL reason that node is not compilable.
 */
export interface StaticReport {
	hostNodes: number;
	componentNodes: number;
	staticSites: StaticSite[];
	staticNodes: number;
	compilableSites: StaticSite[];
	compilableNodes: number;
	compilableProps: number;
	blockers: [string, number][];
}

// Props createHost pulls OUT of the dict into behavior/focus wiring — a node
// carrying one is dynamic by construction. The button set is derived from
// jsx-runtime (single source of truth); `onTap`/`focus` are literal branch keys
// in createHost with no list to derive from, so they are named here and pinned
// by tests/sync.test.mts alongside the derived set.
const HANDLER_PROPS = new Set<string>([...BUTTON_EVENTS, "onTap", "focus"]);

// A value that provably is NOT a function at run time, so moving it from
// createHost's dict copy into a direct construction dict cannot change meaning.
// Deliberately literals only: an identifier may name a Style OR a thunk, and
// the difference is invisible here (see the header's `style=` finding).
const isLiteral = (v: ts.Expression): boolean =>
	ts.isStringLiteral(v) ||
	ts.isNumericLiteral(v) ||
	ts.isNoSubstitutionTemplateLiteral(v) ||
	v.kind === ts.SyntaxKind.TrueKeyword ||
	v.kind === ts.SyntaxKind.FalseKeyword ||
	v.kind === ts.SyntaxKind.NullKeyword ||
	// `top: -4` parses as a unary minus over a numeric literal, not a literal
	(ts.isPrefixUnaryExpression(v) &&
		v.operator === ts.SyntaxKind.MinusToken &&
		ts.isNumericLiteral(v.operand));

interface Info {
	nodes: number;
	props: number;
	isStatic: boolean;
	compilable: boolean;
}
const DEAD: Info = { nodes: 0, props: 0, isStatic: false, compilable: false };

export function scanStatic(text: string): StaticReport {
	const empty: StaticReport = {
		hostNodes: 0,
		componentNodes: 0,
		staticSites: [],
		staticNodes: 0,
		compilableSites: [],
		compilableNodes: 0,
		compilableProps: 0,
		blockers: [],
	};
	const { checker, sf } = program(text);
	const jsxSym = importSymbol(checker, sf, "jsx", JSX_MODULE);
	const jsxsSym = importSymbol(checker, sf, "jsxs", JSX_MODULE);
	if (!jsxSym && !jsxsSym) return empty;

	const isJsxCall = (call: ts.CallExpression): boolean => {
		if (!ts.isIdentifier(call.expression)) return false;
		const s = checker.getSymbolAtLocation(call.expression);
		return !!s && (s === jsxSym || s === jsxsSym);
	};

	const isHost = (call: ts.CallExpression): boolean =>
		!!call.arguments[0] && isPiuHostType(checker, call.arguments[0]);

	const blockers = new Map<string, number>();
	const note = (why: string) => blockers.set(why, (blockers.get(why) ?? 0) + 1);

	// Memoized so `note` fires exactly ONCE per node: the walk below classifies
	// every jsx call, and a parent classifies its children on the way — without
	// the cache each nested node would be counted once per ancestor.
	const seen = new Map<ts.CallExpression, Info>();
	const classify = (call: ts.CallExpression): Info => {
		const hit = seen.get(call);
		if (hit) return hit;
		const info = compute(call);
		seen.set(call, info);
		return info;
	};

	// A children value: a jsx call, an array of them, or a render-nothing
	// literal. Anything else (identifier, conditional, non-jsx call) is a
	// dynamic child and disqualifies the PARENT — reported as its blocker.
	const children = (v: ts.Expression): Info => {
		if (ts.isArrayLiteralExpression(v)) {
			const acc = { nodes: 0, props: 0, isStatic: true, compilable: true };
			for (const el of v.elements) {
				if (ts.isSpreadElement(el)) return DEAD;
				const r = children(el);
				acc.nodes += r.nodes;
				acc.props += r.props;
				acc.isStatic &&= r.isStatic;
				acc.compilable &&= r.compilable;
			}
			return acc;
		}
		// null/true/false are the legal "render nothing" children (a dead
		// `{debug && <X/>}`) — hasRenderable skips them, so they cost no node
		if (
			v.kind === ts.SyntaxKind.NullKeyword ||
			v.kind === ts.SyntaxKind.TrueKeyword ||
			v.kind === ts.SyntaxKind.FalseKeyword
		)
			return { nodes: 0, props: 0, isStatic: true, compilable: true };
		// a text child becomes a Label appendChild synthesizes — static, but an
		// emitter would have to synthesize that Label itself, so not v1-compilable.
		// The blocker belongs to that implied Label, not to the parent: the parent
		// only ever owns reasons that are LOCAL to it.
		if (ts.isStringLiteral(v) || ts.isNumericLiteral(v)) {
			note("child-text");
			return { nodes: 1, props: 1, isStatic: true, compilable: false };
		}
		if (ts.isCallExpression(v)) return classify(v);
		return DEAD;
	};

	const fail = (why: string): Info => {
		note(why);
		return DEAD;
	};

	const compute = (call: ts.CallExpression): Info => {
		if (!isJsxCall(call)) return DEAD;
		// a component runs arbitrary code (and every flow component — Show, For,
		// Navigator — IS the dynamism), so it ends the static subtree
		if (!isHost(call)) return fail("component");
		const props = call.arguments[1];
		if (!props || !ts.isObjectLiteralExpression(props)) return fail("props");
		// react-jsx hoists `key` into arg 3; hosts ignore it, but an emitter
		// dropping an argument silently is not a bet worth taking
		if (call.arguments.length > 2) return fail("key");
		let nodes = 1;
		let count = 0;
		let isStatic = true;
		let compilable = true;
		let why = "";
		for (const prop of props.properties) {
			// spread/shorthand/method: the value set is not visible here
			if (!ts.isPropertyAssignment(prop)) return fail("spread");
			const key = ts.isIdentifier(prop.name)
				? prop.name.text
				: ts.isStringLiteral(prop.name)
					? prop.name.text
					: null;
			if (key === null) return fail("computed-key");
			if (key === "children") {
				const r = children(prop.initializer);
				nodes += r.nodes;
				count += r.props;
				isStatic &&= r.isStatic;
				compilable &&= r.compilable;
				if (!r.isStatic) why ||= "child";
				continue;
			}
			count++;
			const v = prop.initializer;
			// a thunk (reactive binding) or an inline handler — the node IS the
			// dynamic island; this is the shape the runtime exists for
			if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) return fail("thunk");
			if (HANDLER_PROPS.has(key)) return fail("handler");
			if (!isLiteral(v)) {
				compilable = false;
				why ||= `prop:${key}`;
			}
		}
		if (why) note(why);
		return { nodes, props: count, isStatic, compilable };
	};

	// Document order = outermost first, so the first qualifying call on any path
	// is the MAXIMAL subtree; everything under it is already counted.
	const calls: ts.CallExpression[] = [];
	(function walk(n: ts.Node) {
		if (ts.isCallExpression(n) && isJsxCall(n)) calls.push(n);
		ts.forEachChild(n, walk);
	})(sf);

	const out: StaticReport = { ...empty, staticSites: [], compilableSites: [], blockers: [] };
	const claimedStatic: ts.Node[] = [];
	const claimedCompilable: ts.Node[] = [];
	const under = (call: ts.Node, claimed: ts.Node[]): boolean => {
		for (let p: ts.Node = call.parent; p; p = p.parent) if (claimed.includes(p)) return true;
		return false;
	};
	const site = (call: ts.CallExpression, info: Info): StaticSite => {
		const pos = sf.getLineAndCharacterOfPosition(call.getStart(sf));
		return {
			line: pos.line + 1,
			col: pos.character + 1,
			type: (call.arguments[0] as ts.Identifier).text,
			nodes: info.nodes,
			props: info.props,
		};
	};
	for (const call of calls) {
		const info = classify(call);
		if (isHost(call)) out.hostNodes++;
		else out.componentNodes++;
		if (info.isStatic && !under(call, claimedStatic)) {
			claimedStatic.push(call);
			out.staticSites.push(site(call, info));
			out.staticNodes += info.nodes;
		}
		if (info.compilable && !under(call, claimedCompilable)) {
			claimedCompilable.push(call);
			out.compilableSites.push(site(call, info));
			out.compilableNodes += info.nodes;
			out.compilableProps += info.props;
		}
	}
	out.blockers = [...blockers].sort((a, b) => b[1] - a[1]);
	return out;
}

/**
 * The build's report lines. Deliberately says what the numbers DO and DO NOT
 * mean: the saving is transient (per-node dispatch + one dict copy per node +
 * one membership scan per prop) and the retained arena is unchanged, because a
 * static subtree already creates no signals and no effects.
 */
export function formatReport(r: StaticReport, label: string): string[] {
	const pct = (n: number) => (r.hostNodes ? Math.round((n * 100) / r.hostNodes) : 0);
	const lines = [
		`hybrid-static: ${label} — ${r.hostNodes} host nodes, ${r.componentNodes} component calls`,
		`hybrid-static: static subtrees ${r.staticSites.length} (${r.staticNodes} nodes, ${pct(
			r.staticNodes,
		)}% — upper bound), compilable today ${r.compilableSites.length} (${
			r.compilableNodes
		} nodes, ${pct(r.compilableNodes)}%)`,
	];
	if (r.compilableNodes)
		lines.push(
			`hybrid-static: a compiler would drop ~${r.compilableNodes} dict copies + ~${
				2 * r.compilableNodes
			} frames + ~${r.compilableProps} prop scans at mount — TRANSIENT only, retained arena unchanged`,
		);
	for (const s of r.compilableSites)
		lines.push(`hybrid-static:   ${label}:${s.line}:${s.col} <${s.type}> ${s.nodes} nodes`);
	if (r.blockers.length)
		lines.push(`hybrid-static: blockers — ${r.blockers.map(([w, n]) => `${w} ${n}`).join(", ")}`);
	return lines;
}

if (import.meta.main) {
	for (const path of process.argv.slice(2))
		for (const line of formatReport(scanStatic(readFileSync(path, "utf8")), path))
			console.log(line);
}
