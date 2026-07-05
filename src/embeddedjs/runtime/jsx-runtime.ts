// JSX factory — Solid model, no virtual DOM. Components run ONCE; host
// elements become real Piu nodes created once; function-valued props become
// live effect bindings that assign single Piu properties on change.
import { createRoot, effect, report, setSink } from "runtime/signals";
import type {
	Application as PiuApplication,
	ApplicationDictionary,
	Container as PiuContainer,
	Content as PiuContent,
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
export function jsx(type: any, props: Props): JSXNode {
	if (isPiu(type)) return createHost(type, props);
	if (typeof type === "function") return type(props || {});
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

// ---- top-level error boundary (2026-07 redesign) ---------------------------
// render() installs showCrash as report()'s sink by default: an escaped
// reactive/build error tears down the whole tree and paints a crash screen
// instead of leaving a silently frozen watchface. Owner decision: on a
// product, telling the wearer the app crashed (with the actual error) beats
// a watch that looks alive but stopped updating. Per project rules, these
// module-level helpers are `const` bindings (gotcha 13 alias budget).
let theApp: PiuApplication | null = null; // the mounted Application — the crash canvas
let rootDispose: (() => void) | null = null; // tears down every effect on panic
let panicked = false; // first crash wins; also tells render() a mid-build panic happened

// Paint the crash screen. Order matters on the 32KB arena: dispose the tree
// and empty the app FIRST (frees the old nodes/effects — later notifies hit
// disposed ids and no-op), then build the deliberately tiny error UI. Any
// button rethrows the ORIGINAL error outside every guard: uncaught → fxAbort
// (stack in `pebble logs`) → the host exits the mod. That rethrow IS the
// "exit" button — and the second visibility channel.
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
	// Skin/Style are host compartment globals (absent only in the Node test
	// sandbox); "18px Gothic" is a valid Pebble system font (tools/fontcheck).
	const g = globalThis as unknown as {
		Skin?: new (d: object) => object;
		Style?: new (d: object) => object;
	};
	// No top/bottom: Piu centers a fitted Text vertically — on a ROUND screen
	// (gabbro) that lands the message in the circle's widest band instead of
	// the clipped top corners (measured on the device screenshot).
	const tprops: Props = {
		left: 18,
		right: 18,
		string:
			"APP CRASHED\n" +
			(msg.length > 380 ? msg.slice(0, 380) + "…" : msg) +
			"\n\n[any button: exit]",
	};
	if (g.Style)
		tprops.style = new g.Style({ font: "18px Gothic", color: "white", horizontal: "left" });
	const props: Props = {
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
		onPressSelect: kill,
		onPressBack: kill,
		onPressUp: kill,
		onPressDown: kill,
		children: jsx(Text, tprops),
	};
	if (g.Skin) props.skin = new g.Skin({ fill: "black" });
	const ui = jsx(Container, props) as PiuContent;
	app.add(ui);
	ui.focus(); // bound now — button presses reach the kill handler
};

// Live screen dimensions, RN-Dimensions style. Populated by render() from the
// Application's measured size, so it is VALID ONCE render() HAS STARTED (like
// RN's "after layout" caveat) — read it inside the build callback / component
// bodies, not at module top level. Lets components size to the real screen
// (200x228 emery, 260x260 gabbro) instead of a hardcoded width.
/** RN-Dimensions-style screen size; valid once {@link render} has started. */
export const screen = { width: 0, height: 0 };

/** Options for {@link render}. */
export interface RenderOptions {
	/**
	 * Top-level error boundary (default ON). `true`/omitted: an escaped
	 * reactive or build error disposes the whole tree and paints a crash
	 * screen — the full error on the watch, any button exits (rethrows →
	 * fxAbort, so the log gets it too). `false` = strict: errors are logged
	 * in full, then PROPAGATE (on device: fxAbort — dead but loud). A custom
	 * `globalThis.__spError` handler bypasses both and owns the policy.
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
	const app = new Application(null, dict || {});
	theApp = app;
	panicked = false;
	screen.width = app.width; // screen size is known once the app exists,
	screen.height = app.height; // before build() runs so it can read it
	setSink(!opts || opts.boundary !== false ? showCrash : true);
	let tree: JSXNode, disposer: () => void;
	try {
		const r = createRoot(build);
		tree = r[0];
		disposer = r[1];
	} catch (err) {
		// build threw (createRoot already tore down its partial effects).
		// Boundary: crash screen (unless a mid-build binding already painted
		// one); strict: report logs in full, then rethrows out of render().
		report(err, "render() build threw");
		return app;
	}
	if (panicked) {
		// a binding panicked DURING build: the crash screen is already up —
		// drop the orphan tree's effects instead of mounting it
		disposer();
		return app;
	}
	rootDispose = disposer;
	appendChild(app, tree);
	consumePendingFocus();
	return app;
}
