// Auto-thunk scope, DERIVED from the runtime source (single source of truth).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { packageRoot } from "../pkg-root.mts";

// auto-thunk is scoped to HOST (Piu) elements and their REACTIVE props ONLY: a
// component (VirtualList, user fn) is NOT a host, so its props (rows, data, each,
// value…) are left ALONE — wrapping a plain-value prop like `rows={n()}` into a
// thunk would break the component that reads it as a number. A non-reactive host
// prop (width/left/top…) is also left alone — a static construction read that
// wrapping would trip jsx-runtime's bind-time reject.
//
// SINGLE SOURCE OF TRUTH: the host set and reactive-prop whitelist are DERIVED
// from jsx-runtime.ts (the runtime authority) at load, not duplicated here — so
// the compiler can never disagree with the runtime about what is a host or what
// is reactive (that disagreement WAS the A1 bug). jsx-runtime holds the hosts as
// CLASS refs (`isPiu`'s `PIU = [Label, …]`) and REACTIVE_PROPS as a string array;
// we read that source with the TS AST (lower already uses the compiler API) and
// pull out the identifier names / string literals. If jsx-runtime refactors those
// out of shape, extraction yields an empty set and the selftest fails loud
// (nothing gets wrapped) rather than silently mis-compiling.
function extractRuntimeMeta(): { hosts: Set<string>; props: Set<string>; buttons: Set<string> } {
	const src = readFileSync(
		// package-root walk, not a fixed "../..": this file runs both as
		// tools/lower/runtime-meta.mts (repo) and dist/tools/lower/*.mjs (tarball).
		join(
			packageRoot(dirname(fileURLToPath(import.meta.url))),
			"src/embeddedjs/runtime/jsx-runtime.ts",
		),
		"utf8",
	);
	const sf = ts.createSourceFile("jsx-runtime.ts", src, ts.ScriptTarget.ES2025, true);
	const hosts = new Set<string>();
	const props = new Set<string>();
	const buttons = new Set<string>();
	const walk = (n: ts.Node): void => {
		// isPiu's `PIU = [Label, Text, …].filter(…)` — peel the .filter() to the
		// array literal of host class identifiers.
		if (
			ts.isBinaryExpression(n) &&
			ts.isIdentifier(n.left) &&
			n.left.text === "PIU" &&
			n.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			let e: ts.Expression = n.right;
			if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression))
				e = e.expression.expression;
			if (ts.isArrayLiteralExpression(e))
				for (const el of e.elements) if (ts.isIdentifier(el)) hosts.add(el.text);
		}
		// `const REACTIVE_PROPS = "a,b,c"` — the D4 slot-diet turned the frozen
		// array into a comma STRING (module scope is boot RAM); split it. The
		// old `Object.freeze([...])` shape is still accepted so the extractor
		// survives either representation. BUTTON_EVENTS has the SAME shape and
		// the same authority problem (static-scan must agree with createHost
		// about which prop makes a node dynamic), so one extractor serves both.
		const bag =
			ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)
				? n.name.text === "REACTIVE_PROPS"
					? props
					: n.name.text === "BUTTON_EVENTS"
						? buttons
						: null
				: null;
		if (bag && ts.isVariableDeclaration(n)) {
			const init = n.initializer;
			if (init && ts.isStringLiteral(init)) {
				for (const p of init.text.split(",")) bag.add(p);
			} else {
				const arg =
					init && ts.isCallExpression(init) && init.arguments.length === 1
						? init.arguments[0]
						: undefined;
				if (arg && ts.isArrayLiteralExpression(arg))
					for (const el of arg.elements) if (ts.isStringLiteral(el)) bag.add(el.text);
			}
		}
		ts.forEachChild(n, walk);
	};
	walk(sf);
	return { hosts, props, buttons };
}

// Derived once at load. Exported so tests/sync.test.mts can pin the extraction
// output (a change in jsx-runtime's host set surfaces as a loud test diff).
const meta = extractRuntimeMeta();
export const PIU_HOSTS = meta.hosts;
export const REACTIVE_PROPS = meta.props;
export const BUTTON_EVENTS = meta.buttons;

// Is the jsx type argument a Piu HOST element? A host is a FREE global — a bare
// identifier in the Piu set with NO resolvable declaration (host-injected at
// runtime). A component (imported/local) resolves to a symbol, and a shadowed
// `const Label = …` also resolves — so symbol-resolution handles shadowing.
// A one-level ALIAS of a host global (`const L = Label; <L …/>`) is still
// a host at runtime (createHost dispatches on IDENTITY) — skipping it left
// reactive props unthunked, evaluated ONCE and dead to updates (codex P2).
// Lives HERE, beside the host set it consults, because TWO passes now ask the
// question (auto-thunk and static-scan) and a second copy could drift out of
// agreement with the runtime — the A1 bug class this module exists to prevent.
export function isPiuHostType(checker: ts.TypeChecker, typeNode: ts.Node): boolean {
	if (!ts.isIdentifier(typeNode)) return false;
	if (PIU_HOSTS.has(typeNode.text) && !checker.getSymbolAtLocation(typeNode)) return true;
	const d = checker.getSymbolAtLocation(typeNode)?.valueDeclaration;
	return (
		!!d &&
		ts.isVariableDeclaration(d) &&
		!!d.initializer &&
		ts.isIdentifier(d.initializer) &&
		PIU_HOSTS.has(d.initializer.text) &&
		!checker.getSymbolAtLocation(d.initializer)
	);
}
