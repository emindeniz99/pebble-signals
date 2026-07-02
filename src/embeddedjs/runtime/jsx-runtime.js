// JSX factory — Solid model, no virtual DOM. Components run ONCE; host
// elements become real Piu nodes created once; function-valued props become
// live effect bindings that assign single Piu properties on change.
import { effect, track, createRoot } from "runtime/signals";

// Piu content classes are compartment globals provided by the Alloy host.
// Hardened JS freezes primordials and can make instanceof unreliable, so
// host elements are recognized by identity in this registry. Built lazily:
// this module is PRELOADED (instantiated at build time, stored in flash)
// and the Piu globals only exist at runtime.
let PIU = null;

function isPiu(type) {
	if (PIU === null)		// a 9-entry array beats a Set on the 32KB arena
		PIU = [Label, Text, Content, Container, Column, Row, Scroller, Port, Layout]
			.filter(t => t !== undefined);
	return PIU.indexOf(type) >= 0;
}

export function Fragment(props) {
	return props.children;
}

export function jsx(type, props) {
	if (isPiu(type))
		return createHost(type, props);
	if (typeof type === "function")
		return type(props || {});
	throw new Error("jsx: unknown element type");
}

export const jsxs = jsx;

// Event props -> piu Behavior methods. onTap needs active:true; the
// onPress*/onRelease* button events reach the behavior of the focused
// content (or an ancestor), so pair them with the `focus` prop.
const BUTTON_EVENTS = [
	"onPressSelect", "onReleaseSelect", "onPressUp", "onReleaseUp",
	"onPressDown", "onReleaseDown", "onPressBack", "onReleaseBack",
];

let pendingFocus = null;

// One shared behavior class; handlers live in instance fields. piu stops
// button bubbling when the method returns truthy — consume by default,
// return false from a handler to pass the event up the chain. piu accepts
// ANY object as a behavior (methods are looked up by name — no Behavior
// inheritance required), so the class lives at module scope and preloads
// to flash; the previous lazy `class extends Behavior` rebuilt its
// prototype + 9 methods inside the 32KB arena at runtime.
class HandlerBehavior {
	constructor(tap, buttons) {
		this.tap = tap;
		this.buttons = buttons;
	}
	onTouchEnded(content, id, x, y) {
		if (this.tap)
			this.tap(content, x, y);
	}
	button(name, content) {
		const h = this.buttons && this.buttons[name];
		return h ? h(content) !== false : false;
	}
	onPressSelect(content) { return this.button("onPressSelect", content); }
	onReleaseSelect(content) { return this.button("onReleaseSelect", content); }
	onPressUp(content) { return this.button("onPressUp", content); }
	onReleaseUp(content) { return this.button("onReleaseUp", content); }
	onPressDown(content) { return this.button("onPressDown", content); }
	onReleaseDown(content) { return this.button("onReleaseDown", content); }
	onPressBack(content) { return this.button("onPressBack", content); }
	onReleaseBack(content) { return this.button("onReleaseBack", content); }
}

function createHost(type, props) {
	const dict = {};
	let bindings = null, tap = null, buttons = null, children, focus = false;
	for (const k in props) {
		const v = props[k];
		if (k === "children") { children = v; continue; }
		if (k === "focus") { focus = !!v; continue; }
		if (k === "onTap") { tap = v; continue; }
		if (BUTTON_EVENTS.indexOf(k) >= 0) {
			if (buttons === null) buttons = {};
			buttons[k] = v;
			continue;
		}
		if (typeof v === "function") {	// reactive prop: thunk -> live binding
			if (bindings === null) bindings = [];
			bindings.push(k, v);
			continue;
		}
		dict[k] = v;
	}
	if (tap || buttons) {
		if (tap)
			dict.active = true;
		dict.behavior = new HandlerBehavior(tap, buttons);
	}
	const node = new type(null, dict);
	if (focus)
		pendingFocus = node;	// applied after mount; focus() needs a bound node
	if (bindings) {
		for (let i = 0; i < bindings.length; i += 2) {
			const key = bindings[i], thunk = bindings[i + 1];
			track(effect(() => setProp(node, key, thunk())));
		}
	}
	if (children !== undefined)
		appendChild(node, children);
	return node;
}

// Reactive property writes. Position/size are static-only in v1: Piu
// coordinates are construction-dict state, not plain property writes.
// `visible` is deliberately rejected — writing .visible on bound content
// crashes the piu Pebble firmware (measured); use Show for conditional UI.
// Of the rest, `string` is battle-tested on-device; state/variant/skin/
// style/active pass through and follow the same setter path.
function setProp(node, key, value) {
	switch (key) {
		case "string": node.string = value; break;
		case "state": node.state = value; break;
		case "variant": node.variant = value; break;
		case "skin": node.skin = value; break;
		case "style": node.style = value; break;
		case "active": node.active = value; break;
		case "visible":
			throw new Error("reactive `visible` crashes the piu Pebble port; use Show");
		default: throw new Error("unsupported reactive prop: " + key);
	}
}

export function appendChild(parent, child) {
	if (child === undefined || child === null || child === false || child === true)
		return;
	if (Array.isArray(child)) {
		for (const c of child)
			appendChild(parent, c);
		return;
	}
	const t = typeof child;
	if (t === "string" || t === "number") {
		parent.add(new Label(null, { string: String(child) }));
		return;
	}
	if (t === "function")
		throw new Error("function child: use Show/For, or a thunk on a string prop");
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

// Mount a JSX tree as the Piu application. `build` runs under a root owner;
// the returned disposer is kept alive for the app's lifetime.
export function render(build, dict) {
	const app = new Application(null, dict || {});
	const [tree] = createRoot(build);
	appendChild(app, tree);
	consumePendingFocus();
	return app;
}
