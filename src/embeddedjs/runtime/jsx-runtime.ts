// JSX factory — Solid model, no virtual DOM. Components run ONCE; host
// elements become real Piu nodes created once; function-valued props become
// live effect bindings that assign single Piu properties on change.
import {
	createRoot,
	effect,
	getBoundary,
	report,
	setSink,
	track,
	untrack,
	withBoundary,
} from "runtime/signals";
import type {
	Application as PiuApplication,
	ApplicationDictionary,
	Container as PiuContainer,
	Content as PiuContent,
	Skin as PiuSkin,
	SkinDictionary,
	Style as PiuStyle,
	StyleDictionary,
} from "../../../types/moddable/piu/MC-types";

// A JSX result: a Piu node, a primitive child, an array of them, or nullish.
export type JSXNode = PiuContent | string | number | boolean | null | undefined | JSXNode[];
// The factory is inherently dynamic (host class OR component fn), so the
// dispatch boundary is loosely typed — like React's own jsx-runtime.
type Props = Record<string, any>;

// Piu content classes are compartment globals provided by the Alloy host.
// Hardened JS freezes primordials and can make instanceof unreliable, so
// host elements are recognized by identity in this registry. Built lazily:
// this module is PRELOADED (instantiated at build time, stored in flash)
// and the Piu globals only exist at runtime.
let PIU: unknown[] | null = null;

function isPiu(type: unknown): boolean {
	if (PIU === null)
		// a 9-entry array beats a Set on the 32KB arena
		PIU = [Label, Text, Content, Container, Column, Row, Scroller, Port, Layout].filter(
			(t) => t !== undefined,
		);
	return PIU.indexOf(type) >= 0;
}

/** `<>...</>` — returns its children unchanged. */
export function Fragment(props: Props): JSXNode {
	return props.children;
}

/** JSX factory (automatic runtime). Host Piu type → real node; function → component call. */
// react-jsx HOISTS a JSX `key` attribute out of props into the third argument
// (its reserved-prop rule) — without accepting it here, `<For key={...}>`
// (the documented usage) silently lost its key function and fell back to
// identity keys = full row churn per update. Components get it re-injected
// as props.key; host Piu elements ignore it (no keyed semantics there).
// Depth-safe: jsx frames never nest (children evaluate before the outer
// call), so the extra parameter is one live stack slot, not xdepth.
export function jsx(type: any, props: Props, key?: unknown): JSXNode {
	if (isPiu(type)) return createHost(type, props);
	if (typeof type === "function") {
		if (key !== undefined) {
			props = props || {};
			if (props.key === undefined) props.key = key;
		}
		return type(props || {});
	}
	throw new Error("jsx:type");
}

/** JSX factory for elements with static children (same behavior as {@link jsx}). */
export const jsxs = jsx;

// Event props -> piu Behavior methods. onTap needs active:true; the
// onPress*/onRelease* button events reach the behavior of the focused
// content (or an ancestor), so pair them with the `focus` prop.
const BUTTON_EVENTS = Object.freeze([
	"onPressSelect",
	"onReleaseSelect",
	"onPressUp",
	"onReleaseUp",
	"onPressDown",
	"onReleaseDown",
	"onPressBack",
	"onReleaseBack",
]);

let pendingFocus: PiuContent | null = null;

// One shared behavior class; handlers live in instance fields. piu stops
// button bubbling when the method returns truthy — consume by default,
// return false from a handler to pass the event up the chain. piu accepts
// ANY object as a behavior (methods are looked up by name — no Behavior
// inheritance required), so the class lives at module scope and preloads
// to flash; the previous lazy `class extends Behavior` rebuilt its
// prototype + 9 methods inside the 32KB arena at runtime.
class HandlerBehavior {
	// `declare` = type-only, no field initializer emitted (constructor sets them)
	declare t: ((content: PiuContent, x: number, y: number) => void) | null;
	declare b: Record<string, (content: PiuContent) => unknown> | null;
	constructor(
		tap: ((content: PiuContent, x: number, y: number) => void) | null,
		buttons: Record<string, (content: PiuContent) => unknown> | null,
	) {
		this.t = tap;
		this.b = buttons;
	}
	onTouchEnded(content: PiuContent, _id: number, x: number, y: number) {
		if (this.t) this.t(content, x, y);
	}
}
// The eight identical one-line button delegates are GENERATED here instead
// of copy-pasted: this module-scope loop runs at preload (build) time, so
// the closures land in flash and the prototype is written before it
// freezes. ~300B of archive saved over the literal methods.
for (const n of BUTTON_EVENTS)
	(HandlerBehavior.prototype as any)[n] = function (this: HandlerBehavior, content: PiuContent) {
		const h = this.b && this.b[n];
		return h ? h(content) !== false : false;
	};

function createHost(type: any, props: Props): PiuContent {
	const dict: Record<string, any> = {};
	let bindings: (string | (() => unknown))[] | null = null,
		tap: ((content: PiuContent, x: number, y: number) => void) | null = null,
		buttons: Record<string, (content: PiuContent) => unknown> | null = null,
		children: JSXNode,
		focus = false;
	for (const k in props) {
		const v = props[k];
		if (k === "children") {
			children = v;
			continue;
		}
		if (k === "focus") {
			focus = !!v;
			continue;
		}
		if (k === "onTap") {
			tap = v;
			continue;
		}
		if (BUTTON_EVENTS.indexOf(k) >= 0) {
			if (buttons === null) buttons = {};
			buttons[k] = v;
			continue;
		}
		if (typeof v === "function") {
			// reactive prop: thunk -> live binding
			if (bindings === null) bindings = [];
			bindings.push(k, v);
			continue;
		}
		dict[k] = v;
	}
	if (tap || buttons) {
		if (tap) dict.active = true;
		dict.behavior = new HandlerBehavior(tap, buttons);
	}
	const node = new type(null, dict);
	if (focus) pendingFocus = node; // applied after mount; focus() needs a bound node
	if (bindings) {
		for (let i = 0; i < bindings.length; i += 2) {
			const key = bindings[i] as string,
				thunk = bindings[i + 1] as () => unknown;
			// Reject an illegal reactive prop ONCE, HERE (bind time), with an
			// actionable message — not on every effect run. Only the whitelist
			// can be written reactively; a reactive position prop is the classic
			// React-refugee surprise (Piu layout is construction-time).
			if (REACTIVE_PROPS.indexOf(key) < 0) throw new Error(bindErr(key));
			// effect() auto-registers with the innermost owner (running-owner round).
			// The binding body is GUARDED so a throwing thunk is caught WITH
			// context (which prop, which node class) — including on the FIRST
			// render, which runs during effect creation and would otherwise skip
			// the notify() guard. What happens NEXT is report()'s escalation
			// ladder (2026-07 redesign, owner decision: telling the wearer beats
			// a silently frozen label): under render()'s default boundary the
			// tree is torn down and a crash screen is painted; with
			// `boundary:false` the error is logged then rethrown (fxAbort — dead
			// but loud); a custom `__spError` handler owns the policy; and with
			// no boundary at all (bare core, tests) the node keeps its last good
			// value and the app survives. Conformance laws 24-25 pin this.
			effect(() => {
				try {
					setProp(node, key, thunk());
				} catch (err) {
					const cls = (node as { constructor?: { name?: string } }).constructor;
					report(err, "binding '" + key + "' on " + ((cls && cls.name) || "content") + " threw");
				}
			});
		}
	}
	if (children !== undefined) appendChild(node, children);
	return node;
}

// Reactive property writes. Position/size are static-only: Piu coordinates are
// construction-dict state, not plain property writes. `visible` crashes the piu
// Pebble port when written on bound content (measured); use Show. `string` is
// battle-tested on-device; state/variant/skin/style/active follow the same path.
const REACTIVE_PROPS = Object.freeze(["string", "state", "variant", "skin", "style", "active"]);
const POSITION_PROPS = Object.freeze([
	"left",
	"right",
	"top",
	"bottom",
	"width",
	"height",
	"x",
	"y",
]);

// Actionable bind-time error for a prop that can't be a reactive binding.
function bindErr(key: string): string {
	if (key === "visible")
		return "jsx: `visible` can't be reactive (crashes the port) — use <Show> for conditional UI";
	if (POSITION_PROPS.indexOf(key) >= 0)
		return (
			"jsx: position/size prop `" +
			key +
			"` is static — Piu lays out at construction time. Reposition by swapping with <Show>, not a reactive binding."
		);
	return (
		"jsx: prop `" +
		key +
		"` can't be a reactive binding (reactive props: " +
		REACTIVE_PROPS.join(", ") +
		")"
	);
}

// createHost guarantees `key` is in REACTIVE_PROPS before it ever calls this, so
// this is just the write. Kept as a named step so the binding effect reads well.
function setProp(node: PiuContent, key: string, value: unknown) {
	// Piu content types have no index signature for this dynamic key — the
	// cast is type-only (erases in emit); the write stays `node[key] = value`.
	(node as unknown as Record<string, unknown>)[key] = value;
}

/** Append a child (node / string / number / array) to a parent Piu node. */
export function appendChild(parent: PiuContainer, child: JSXNode) {
	if (child === undefined || child === null || child === false || child === true) return;
	if (Array.isArray(child)) {
		for (const c of child) appendChild(parent, c);
		return;
	}
	const t = typeof child;
	if (t === "string" || t === "number") {
		parent.add(new Label(null, { string: String(child) }));
		return;
	}
	if (t === "function") throw new Error("jsx:fn-child"); // use Show/For or a string-prop thunk
	// `t` (not `child` directly) drove the typeof narrowing above, so TS still
	// sees `child` as `string | number | Content` here — a type-only cast (the
	// string/number cases already returned) narrows it without touching emit.
	parent.add(child as PiuContent);
}

// Apply a pending `focus` request now that its node is mounted (focus()
// is a no-op on unbound content). Only render() may call this: exporting
// it to flow.js killed the firmware at startup — a preloaded module
// calling another preloaded module's function that writes its aliased
// state is fatal on this XS build (measured). So the `focus` prop only
// takes effect in the initial render() tree.
function consumePendingFocus() {
	if (pendingFocus) {
		pendingFocus.focus();
		pendingFocus = null;
	}
}

// Compile-time flag: does this build ship the full crash SCREEN, or the lean
// "log + contain" sink? Default ON. The build's `--no-crash-ui` / CRASH_UI=0
// esbuild-`define`s this to `false`, and DCE then drops the whole showCrash
// body (Text/Skin/Style construction + retry) — recovering boot symbols +
// bytecode for a saturated app that would rather keep the room than the UI.
// `typeof` guard makes it SAFE when undefined (Node tests, non-minified debug
// builds): unset → ON. `render(..., {boundary:false})` still gives strict
// crash-on-error regardless; this only controls the on-watch screen.
declare const __SP_CRASH_UI__: boolean;

// ---- top-level error boundary (2026-07 redesign) ---------------------------
// render() installs showCrash as report()'s sink by default: an escaped
// reactive/build error tears down the whole tree and paints a crash screen
// instead of leaving a silently frozen watchface. Owner decision: on a
// product, telling the wearer the app crashed (with the actual error) beats
// a watch that looks alive but stopped updating. Per project rules, these
// module-level helpers are `const` bindings (gotcha 13 alias budget).
let theApp: PiuApplication | null = null; // the mounted Application — the crash canvas
let theBuild: (() => JSXNode) | null = null; // kept for the crash screen's RETRY
let rootDispose: (() => void) | null = null; // tears down every effect on panic
let panicked = false; // first crash wins; also tells render() a mid-build panic happened

// Build + mount the tree onto the app under a fresh root. Shared by render()
// and the crash screen's retry. A binding that panics DURING the build paints
// the crash screen from inside createRoot — in that case the orphan tree is
// dropped (its effects disposed) instead of mounted over the crash screen.
const mount = (app: PiuApplication, build: () => JSXNode): void => {
	pendingFocus = null; // drop any STALE focus target from a post-mount flow build
	const r = createRoot(build);
	if (panicked) {
		r[1]();
		return;
	}
	rootDispose = r[1];
	appendChild(app, r[0]);
	consumePendingFocus();
};

// Paint the crash screen. Order matters on the 32KB arena: dispose the tree
// and empty the app FIRST (frees the old nodes/effects — later notifies hit
// disposed ids and no-op), then build the deliberately tiny error UI.
// Buttons — Solid's ErrorBoundary `reset` and React's error-dialog guidance,
// adapted to a two-button watch:
//   select = RETRY: re-run the app build under a fresh root (module-scope
//            state survives; component-scope state starts over). A build
//            that immediately throws again just repaints this screen.
//   back/up/down = EXIT: rethrow the ORIGINAL error outside every guard —
//            uncaught → fxAbort (stack in `pebble logs`) → the host kills
//            the mod. The rethrow IS the exit AND the second log channel.
const showCrash = (err: unknown, msg: string): void => {
	if (panicked) return; // one screen per crash; re-entrant reports just log
	panicked = true;
	pendingFocus = null; // a mid-build crash must not hand focus to orphans
	if (rootDispose) {
		rootDispose();
		rootDispose = null;
	}
	// theApp is never null here: render() assigns it before installing this
	// sink, and the sink is the only caller (the `!` is type-only, erases).
	const app = theApp!;
	app.empty();
	const kill = () => {
		throw err;
	};
	const retry = () => {
		panicked = false;
		app.empty();
		try {
			mount(app, theBuild!); // render() set theBuild before this sink existed
		} catch (e2) {
			report(e2, "retry build threw"); // paints this screen again
		}
	};
	// Skin/Style are host compartment globals (absent only in the Node test
	// sandbox); "18px Gothic" is a valid Pebble system font (tools/fontcheck).
	const g = globalThis as unknown as {
		Skin?: new (d: object) => object;
		Style?: new (d: object) => object;
	};
	// The log kept the full multi-line error above; the SCREEN compacts
	// newlines to " ~ " so wrapped text packs far more per line (each stack
	// frame is short — one frame per line wasted most of a 260px circle).
	let body = msg.replace(/\n+/g, " ~ ");
	if (body.length > 380) body = body.slice(0, 380) + "…";
	// No top/bottom: Piu centers a fitted Text vertically — on a ROUND screen
	// (gabbro) that lands the message in the circle's widest band instead of
	// the clipped top corners (measured on the device screenshot). Insets
	// adapt to the shape via screen.round (host display flag).
	const inset = screen.round ? 26 : 8;
	const tprops: Props = {
		left: inset,
		right: inset,
		string: "APP CRASHED\n" + body + "\n\n[select: retry \u00b7 back: exit]",
	};
	if (g.Style)
		tprops.style = new g.Style({ font: "18px Gothic", color: "white", horizontal: "left" });
	const props: Props = {
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
		onPressSelect: retry,
		onPressBack: kill,
		onPressUp: kill,
		onPressDown: kill,
		children: jsx(Text, tprops),
	};
	if (g.Skin) props.skin = new g.Skin({ fill: "black" });
	const ui = jsx(Container, props) as PiuContent;
	app.add(ui);
	ui.focus(); // bound now — button presses reach the retry/kill handlers
};

// Live screen info, RN-Dimensions style. Populated by render() from the
// Application's measured size and the host display, so it is VALID ONCE
// render() HAS STARTED (like RN's "after layout" caveat) — read it inside the
// build callback / component bodies, not at module top level. Lets components
// size to the real screen (200x228 emery, 260x260 gabbro) and adapt layout to
// the panel: `round` (circular display — inset content away from the clipped
// corners) and `color` (color vs b/w panel) come from the host's `screen`
// display global (`pebble-display.js` on the Pebble host).
/** RN-Dimensions-style screen info (size/round/color); valid once {@link render} has started. */
export const screen = { width: 0, height: 0, round: false, color: false };

/** Options for {@link render}. */
export interface RenderOptions {
	/**
	 * Top-level error boundary (default ON). `true`/omitted: an escaped
	 * reactive or build error disposes the whole tree and paints a crash
	 * screen — the full error on the watch; select retries the build, any
	 * other button exits (rethrows → fxAbort, so the log gets it too).
	 * `false` = strict: errors are logged in full, then PROPAGATE (on
	 * device: fxAbort — dead but loud). A custom `globalThis.__spError`
	 * handler bypasses both and owns the policy.
	 */
	boundary?: boolean;
}

// Mount a JSX tree as the Piu application. `build` runs under a root owner;
// the disposer is kept so the default error boundary can tear the tree down.
/** Mount a JSX tree as the Piu Application. `build` runs under a root owner. */
export function render(
	build: () => JSXNode,
	dict?: ApplicationDictionary,
	opts?: RenderOptions,
): PiuApplication {
	// a SECOND render() must not leak the previous tree (nor cross-wire its
	// crashes onto the new app) — tear the old root down first
	if (rootDispose) {
		rootDispose();
		rootDispose = null;
	}
	const app = new Application(null, dict || {});
	theApp = app;
	theBuild = build;
	panicked = false;
	screen.width = app.width; // screen size is known once the app exists,
	screen.height = app.height; // before build() runs so it can read it
	// panel shape/depth from the host display global (absent in Node tests)
	const hs = (globalThis as unknown as { screen?: { round?: boolean; color?: boolean } }).screen;
	screen.round = !!(hs && hs.round);
	screen.color = !!(hs && hs.color);
	// crashSink: the tree-teardown crash SCREEN, or null (lean log+contain).
	// Kept as a dead-`if` on the compile-time flag ON PURPOSE: when esbuild
	// `define`s __SP_CRASH_UI__ = false (--no-crash-ui) the branch is dead and
	// DCE drops both it AND showCrash's whole body — esbuild eliminates a
	// constant-`false` `if` reliably, where it would NOT re-fold a `?:` fed an
	// inlined const (measured: the ternary form left showCrash referenced).
	// Flag undefined (Node tests, non-minified builds, default ON): the guard
	// stays runtime-true, so the screen is installed. `null` sink = report()
	// still LOGS in full, then CONTAINS (node keeps last good value).
	let crashSink: ((err: unknown, msg: string) => void) | null = null;
	if (typeof __SP_CRASH_UI__ === "undefined" || __SP_CRASH_UI__) crashSink = showCrash;
	setSink(!opts || opts.boundary !== false ? crashSink : true);
	try {
		mount(app, build);
	} catch (err) {
		// build threw (createRoot already tore down its partial effects).
		// Boundary: crash screen (unless a mid-build binding already painted
		// one); strict: report logs in full, then rethrows out of render().
		report(err, "render() build threw");
	}
	return app;
}

// ---- <ErrorBoundary> — the OPT-IN, per-subtree boundary (Solid parity) ------
// Lives HERE, not in flow.ts (moved 2026-07): pulling the whole flow module
// for one component cost an extra archive module record (+2 ids, gotcha 15) —
// measured to matter on a saturated app's boot floor. In jsx-runtime a lean
// app gets local error containment for free-of-flow; apps that never import
// it lose the code to export-prune + DCE, exactly as before.

/** Props for {@link ErrorBoundary}. Box coordinates size the host (like Show). */
export interface ErrorBoundaryProps {
	width?: number;
	height?: number;
	left?: number;
	right?: number;
	top?: number;
	bottom?: number;
	skin?: PiuSkin | SkinDictionary;
	style?: PiuStyle | StyleDictionary;
	/** the subtree to protect — a thunk returning nodes (like Show's children). */
	children: () => JSXNode;
	/** shown when the subtree throws; `reset` re-runs `children` under a fresh root. */
	fallback: (err: unknown, reset: () => void) => JSXNode;
}

// ErrorBoundary({ children, fallback }) — Solid's per-subtree boundary, on a
// watch. `children` is a thunk (like Show); `fallback(err, reset)` renders
// when the subtree throws — at BUILD time OR on any later reactive re-run —
// and `reset` re-runs `children` under a fresh root (component-scope state
// starts over; module-scope state survives — the swap tradeoff). The rest of
// the app keeps running; only this subtree is replaced.
//
// This is the OPT-IN, LOCAL counterpart to render()'s default top-level crash
// screen: an inner ErrorBoundary catches first; anything it doesn't wrap (or a
// throw from the fallback itself) escalates OUTWARD to the enclosing boundary
// and ultimately to the crash screen — the same chain React (root
// onUncaughtError) and Solid (outermost catch) use. It does NOT catch button/
// tap handler throws (those run outside the reactive graph — parity with
// Solid, which also skips event handlers).
//
// `const` arrow, not `export function` (preloaded-module alias budget, gotcha
// 13); apps that never import it pay nothing (export prune + DCE). ALL its
// helpers live INSIDE this one arrow on purpose: extra module-scope bindings
// push esbuild's minified top-level identifier allocation into letters the
// host never interned — MEASURED +5 boot symbols on watchface when ebHost/
// ebWrap sat at module scope. Function-local names never intern; the price is
// a few closures per ErrorBoundary instance, and boundaries are few.
export const ErrorBoundary = (props: ErrorBoundaryProps): PiuContainer => {
	// Host + side-wrapper — inlined equivalents of flow's makeHost/wrapSide
	// (importing them from flow would re-create the module dependency the move
	// exists to remove). Same on-device-proven shapes: the host defaults to
	// screen width (a width-less container measures 0, gotcha 16) and each
	// side mounts inside a Container sized like the host (bare content swapped
	// as a direct child crashes the piu Pebble port — measured).
	const ebWrap = (build: () => JSXNode): PiuContainer => {
		const wrapper = new Container(null, {
			width: props.width,
			height: props.height,
		}) as PiuContainer;
		// unwrap a thunk-returning build result (the same dynamic boundary
		// flow's asNode handles — `{() => <Label/>}` children arrive as a fn)
		const r = build();
		appendChild(wrapper, typeof r === "function" ? (r as () => JSXNode)() : r);
		return wrapper;
	};
	const dict: Record<string, unknown> = {};
	for (const k in props) if (k !== "children" && k !== "fallback") dict[k] = (props as Props)[k];
	if (dict.width === undefined && !(dict.left !== undefined && dict.right !== undefined))
		dict.width = screen.width;
	const host = new Column(null, dict) as PiuContainer;
	// The boundary in scope when THIS one is built — a fallback that itself
	// throws escalates here (Solid nesting), not back into our own onError.
	const parent = getBoundary();
	let disposer: (() => void) | null = null;
	let shown = false; // currently showing the fallback (not the children)?
	const clear = () => {
		if (disposer) {
			disposer();
			disposer = null;
		}
		while (host.first) host.remove(host.first);
	};
	// (re)build the protected subtree UNDER this boundary, so its effects' later
	// throws route back to onError (the z-tagging in signals' effect()/run()).
	const mountChildren = () => {
		const r = createRoot(() => withBoundary(onError, () => ebWrap(props.children)));
		// A CREATION-TIME binding throw is caught by the binding guard (no
		// exception escapes createRoot) but fires onError SYNCHRONOUSLY during
		// the build — the fallback is already mounted. Drop this orphan children
		// tree instead of stacking it on top (mirrors render()'s `panicked`).
		if (shown) {
			r[1]();
			return;
		}
		disposer = r[1];
		host.add(r[0]);
	};
	const reset = () =>
		untrack(() => {
			clear();
			shown = false;
			try {
				mountChildren();
			} catch (err) {
				onError(err); // children re-build threw immediately — back to fallback
			}
		});
	// Escalate an error OUT of this boundary: to the parent boundary if any,
	// else the terminal sink (render's crash screen). Routed through
	// withBoundary(parent) so report()'s boundary lookup lands on the parent
	// (or null), NOT back on THIS boundary — otherwise a failing fallback with
	// no parent would loop, and a parent's own fallback would be mis-tagged as
	// ours. __spError still outranks everything inside report().
	const escalate = (e: unknown) =>
		withBoundary(parent, () => report(e, "ErrorBoundary fallback threw"));
	const onError = (err: unknown) => {
		if (shown) {
			escalate(err); // the fallback itself failed — never loop back here
			return;
		}
		untrack(() => {
			shown = true;
			clear();
			try {
				// build the fallback under the PARENT boundary: a throw from it
				// (build-time or a later re-run) escalates OUT, matching Solid.
				const build = () => ebWrap(() => props.fallback(err, reset));
				const r = createRoot(() => withBoundary(parent, build));
				disposer = r[1];
				host.add(r[0]);
			} catch (err2) {
				escalate(err2);
			}
		});
	};
	try {
		mountChildren();
	} catch (err) {
		onError(err); // first build threw synchronously (creation-time)
	}
	track(() => {
		if (disposer) disposer();
	});
	return host;
};
