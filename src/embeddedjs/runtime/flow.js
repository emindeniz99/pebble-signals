// Control flow — with no re-render machinery, dynamic tree shape is owned
// by these components. Children are THUNKS returning nodes (there is no
// compiler making them lazy), each subtree runs under its own root so
// removal disposes every effect created inside it.
import { effect, untrack } from "runtime/signals";
import { track, createRoot } from "runtime/owner";
import { appendChild } from "runtime/jsx-runtime";

// Show({ when, children, fallback }) — `when` is a thunk; children/fallback
// are thunks returning nodes. The host Container is sized by the caller via
// coordinate props (an unconstrained Piu container measures at zero when
// empty, so pass width/height or left/right/top/bottom for stable layout).
export function Show(props) {
	const host = makeHost(props);
	let dispose = null;
	track(effect(() => {
		const on = !!props.when();
		untrack(() => {
			if (dispose) { dispose(); dispose = null; }
			// remove one-by-one instead of empty(): see For note below
			while (host.first)
				host.remove(host.first);
			const build = on ? props.children : props.fallback;
			if (!build) return;
			const [tree, d] = createRoot(() => asNode(build));
			dispose = d;
			appendChild(host, tree);
		});
	}));
	track(() => { if (dispose) { dispose(); dispose = null; } });
	return host;
}

// For({ each, key, children }) — keyed reconcile. `each` is a thunk
// returning an array; `key` maps item -> unique key (default: identity);
// `children` is (item, index) -> node. Rows whose keys survive are kept;
// new keys mount in their own root; removed keys dispose. Reconcile does
// MINIMAL piu ops (remove departed, insert/move only misplaced nodes) —
// a full empty()+re-add per update destabilizes the piu Pebble port and
// costs native churn per row (measured: app death after ~15-25 cycles).
export function For(props) {
	const host = makeHost(props, Column);
	const keyOf = props.key || (item => item);
	let rows = new Map();		// key -> { node, dispose }
	track(effect(() => {
		const items = props.each();
		untrack(() => {
			const next = new Map();
			for (let i = 0; i < items.length; i++) {
				const item = items[i], k = keyOf(item, i);
				let row = rows.get(k);
				if (row)
					rows.delete(k);
				else {
					const [node, dispose] = createRoot(() => asNode(() => props.children(item, i)));
					row = { node, dispose };
				}
				next.set(k, row);
			}
			for (const row of rows.values()) {	// keys gone from the data
				host.remove(row.node);
				row.dispose();
			}
			rows = next;
			// Position pass: walk expected order with a cursor over the
			// host's real children; move/insert only mismatched nodes.
			let cursor = host.first;
			for (const row of next.values()) {
				const node = row.node;
				if (node === cursor) {
					cursor = cursor.next;
					continue;
				}
				if (node.container)
					host.remove(node);
				if (cursor)
					host.insert(node, cursor);
				else
					host.add(node);
			}
		});
	}));
	track(() => {
		for (const row of rows.values())
			row.dispose();
		rows.clear();
	});
	return host;
}

function makeHost(props, Type) {
	const dict = {};
	for (const k in props) {
		if (k === "left" || k === "right" || k === "top" || k === "bottom"
				|| k === "width" || k === "height" || k === "skin" || k === "style")
			dict[k] = props[k];
	}
	return new (Type || Container)(null, dict);
}

function asNode(build) {
	const result = build();
	return (typeof result === "function") ? result() : result;
}
