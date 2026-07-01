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
			host.empty();
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
// `children` is (item, index) -> node. v1 policy: rows whose keys survive
// are kept (moved as needed); new keys mount in their own root; removed
// keys dispose. Row nodes are remembered per key in a Map.
export function For(props) {
	const host = makeHost(props, Column);
	const keyOf = props.key || (item => item);
	let rows = new Map();		// key -> { node, dispose }
	track(effect(() => {
		const items = props.each();
		untrack(() => {
			const next = new Map();
			const order = [];
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
				order.push(row.node);
			}
			for (const row of rows.values())	// keys gone from the data
				row.dispose();
			rows = next;
			// Rebuild host order: cheap and correct for watch-sized lists.
			host.empty();
			for (const node of order)
				host.add(node);
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
