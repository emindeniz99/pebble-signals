// JSX factory — Solid model, no virtual DOM. Components run ONCE; host
// elements become real Piu nodes created once; function-valued props become
// live effect bindings that assign single Piu properties on change.
import { effect } from "runtime/signals";
import { track, createRoot } from "runtime/owner";

// Piu content classes are compartment globals provided by the Alloy host.
// Hardened JS freezes primordials and can make instanceof unreliable, so
// host elements are recognized by identity in this registry.
const PIU = new Set(
	[Label, Text, Content, Container, Column, Row, Scroller, Port, Layout]
		.filter(t => t !== undefined)
);

export function Fragment(props) {
	return props.children;
}

export function jsx(type, props) {
	if (PIU.has(type))
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
		const proto = {};
		if (tap) {
			dict.active = true;
			proto.onTouchEnded = function(content, id, x, y) { tap(content, x, y); };
		}
		if (buttons) {
			for (const name in buttons) {
				const handler = buttons[name];
				// piu stops bubbling when the method returns truthy;
				// consume by default, return false from the handler to pass.
				proto[name] = function(content) { return handler(content) !== false; };
			}
		}
		class HostBehavior extends Behavior {}
		Object.assign(HostBehavior.prototype, proto);
		dict.Behavior = HostBehavior;
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
function setProp(node, key, value) {
	switch (key) {
		case "string": node.string = value; break;
		case "visible": node.visible = value; break;
		case "state": node.state = value; break;
		case "variant": node.variant = value; break;
		case "skin": node.skin = value; break;
		case "style": node.style = value; break;
		case "active": node.active = value; break;
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

// Mount a JSX tree as the Piu application. `build` runs under a root owner;
// the returned disposer is kept alive for the app's lifetime.
export function render(build, dict) {
	const app = new Application(null, dict || {});
	const [tree] = createRoot(build);
	appendChild(app, tree);
	if (pendingFocus) {
		pendingFocus.focus();
		pendingFocus = null;
	}
	return app;
}
