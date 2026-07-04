// JSX factory — Solid model, no virtual DOM. Components run ONCE; host
// elements become real Piu nodes created once; function-valued props become
// live effect bindings that assign single Piu properties on change.
import { effect, track, createRoot } from "runtime/signals";
import type {
	Application as PiuApplication,
	ApplicationDictionary,
} from "../../../types/moddable/piu/MC-types";

// A JSX result: a Piu node, a primitive child, an array of them, or nullish.
// The factory is inherently dynamic (host class OR component fn), so the
// dispatch boundary is loosely typed — like React's own jsx-runtime.
type Node = any;
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
export function Fragment(props: Props): Node {
	return props.children;
}

/** JSX factory (automatic runtime). Host Piu type → real node; function → component call. */
export function jsx(type: any, props: Props): Node {
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

let pendingFocus: Node = null;

// One shared behavior class; handlers live in instance fields. piu stops
// button bubbling when the method returns truthy — consume by default,
// return false from a handler to pass the event up the chain. piu accepts
// ANY object as a behavior (methods are looked up by name — no Behavior
// inheritance required), so the class lives at module scope and preloads
// to flash; the previous lazy `class extends Behavior` rebuilt its
// prototype + 9 methods inside the 32KB arena at runtime.
class HandlerBehavior {
	// `declare` = type-only, no field initializer emitted (constructor sets them)
	declare t: ((content: Node, x: number, y: number) => void) | null;
	declare b: Record<string, (content: Node) => unknown> | null;
	constructor(
		tap: ((content: Node, x: number, y: number) => void) | null,
		buttons: Record<string, (content: Node) => unknown> | null,
	) {
		this.t = tap;
		this.b = buttons;
	}
	onTouchEnded(content: Node, _id: number, x: number, y: number) {
		if (this.t) this.t(content, x, y);
	}
}
// The eight identical one-line button delegates are GENERATED here instead
// of copy-pasted: this module-scope loop runs at preload (build) time, so
// the closures land in flash and the prototype is written before it
// freezes. ~300B of archive saved over the literal methods.
for (const n of BUTTON_EVENTS)
	(HandlerBehavior.prototype as any)[n] = function (this: HandlerBehavior, content: Node) {
		const h = this.b && this.b[n];
		return h ? h(content) !== false : false;
	};

function createHost(type: any, props: Props): Node {
	const dict: Record<string, any> = {};
	let bindings: (string | (() => unknown))[] | null = null,
		tap: ((content: Node, x: number, y: number) => void) | null = null,
		buttons: Record<string, (content: Node) => unknown> | null = null,
		children: Node,
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
			track(effect(() => setProp(node, key, thunk())));
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
function setProp(node: any, key: string, value: unknown) {
	node[key] = value;
}

/** Append a child (node / string / number / array) to a parent Piu node. */
export function appendChild(parent: any, child: Node) {
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
	parent.add(child);
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

// Live screen dimensions, RN-Dimensions style. Populated by render() from the
// Application's measured size, so it is VALID ONCE render() HAS STARTED (like
// RN's "after layout" caveat) — read it inside the build callback / component
// bodies, not at module top level. Lets components size to the real screen
// (200x228 emery, 260x260 gabbro) instead of a hardcoded width.
/** RN-Dimensions-style screen size; valid once {@link render} has started. */
export const screen = { width: 0, height: 0 };

// Mount a JSX tree as the Piu application. `build` runs under a root owner;
// the returned disposer is kept alive for the app's lifetime.
/** Mount a JSX tree as the Piu Application. `build` runs under a root owner. */
export function render(build: () => Node, dict?: ApplicationDictionary): PiuApplication {
	const app = new Application(null, dict || {});
	screen.width = app.width; // screen size is known once the app exists,
	screen.height = app.height; // before build() runs so it can read it
	const [tree] = createRoot(build);
	appendChild(app, tree);
	consumePendingFocus();
	return app;
}
