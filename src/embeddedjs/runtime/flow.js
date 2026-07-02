// Control flow — with no re-render machinery, dynamic tree shape is owned
// by these components. Children are THUNKS returning nodes (there is no
// compiler making them lazy), each subtree runs under its own root so
// removal disposes every effect created inside it.
import { effect, untrack, track, createRoot } from "runtime/signals";
import { appendChild } from "runtime/jsx-runtime";
// NOTE: flow deliberately does NOT import consumePendingFocus — calling a
// preloaded module's function that WRITES another preloaded module's
// aliased variable kills the firmware at startup (measured by bisection;
// appendChild is safe because it never touches jsx-runtime module state).
// Consequence: the `focus` prop only works in the initial render() tree.

// Show({ when, children, fallback, keepAlive }) — `when` is a thunk;
// children/fallback are thunks returning nodes. The host is sized by the
// caller via coordinate props (an unconstrained Piu container measures at
// zero when empty, so pass width/height or left/right/top/bottom for
// stable layout).
//
// Each side is automatically wrapped in a Container sized like the host
// before it is swapped in: the piu Pebble port crashes the firmware when a
// bare Label is swapped as a container's direct child (measured — both
// fresh rebuilds and prebuilt re-binds die), while Container-wrapped
// subtrees swap and re-bind indefinitely.
//
// Two modes:
//  - default: Solid semantics — swap subtrees, disposing the outgoing root
//    (heap returns to its floor; verified in M5). The swap allocates the
//    incoming subtree, which on the firmware-fixed 32KB arena can be the
//    difference between running and "fxAbort memory full".
//  - keepAlive: build children AND fallback once at mount and swap them by
//    reference with the atomic replace() — zero allocation per toggle.
//    (Not `visible`: setting visible on bound content crashes the port;
//    not remove-now/re-add-later either: the re-add crashes.) A missing
//    side becomes an empty placeholder wrapper so every transition still
//    goes through replace(). Both subtrees stay live — their effects keep
//    running while off-screen. The right default when memory is tighter
//    than update cost.
export function Show(props) {
	const host = makeHost(props, Column);
	if (props.keepAlive) {
		const a = wrapSide(props, props.children);
		const b = wrapSide(props, props.fallback);
		let mounted = null;
		track(effect(() => {
			const next = props.when() ? a : b;
			if (next === mounted)
				return;
			if (mounted)
				host.replace(mounted, next);
			else
				host.add(next);
			mounted = next;
		}));
		return host;
	}
	let dispose = null;
	track(effect(() => {
		const on = !!props.when();
		untrack(() => {
			if (dispose) { dispose(); dispose = null; }
			// remove one-by-one instead of empty(): see For note below
			while (host.first)
				host.remove(host.first);
			const build = on ? props.children : props.fallback;
			const [tree, d] = createRoot(() => wrapSide(props, build));
			dispose = d;
			host.add(tree);
		});
	}));
	track(() => { if (dispose) { dispose(); dispose = null; } });
	return host;
}

// Build one side of a Show and wrap it in a Container sized like the host
// (see the bare-Label port bug above; width/height-sized wrappers are the
// on-device-proven shape). A missing side yields an EMPTY wrapper — never
// null — so keepAlive swaps always use replace().
function wrapSide(props, build) {
	const wrapper = new Container(null, { width: props.width, height: props.height });
	if (build)
		appendChild(wrapper, asNode(build));
	return wrapper;
}

// For({ each, key, children }) — keyed reconcile. `each` is a thunk
// returning an array; `key` maps item -> unique key (default: identity);
// `children` is (item, index) -> node. Rows whose keys survive are kept;
// new keys mount in their own root; removed keys dispose; a DUPLICATE key
// keeps its first occurrence and the later items are skipped. Reconcile
// does MINIMAL piu ops (remove departed, insert/move only misplaced
// nodes) — a full empty()+re-add per update destabilizes the piu Pebble
// port and costs native churn per row (measured: app death after ~15-25
// cycles).
export function For(props) {
	const host = makeHost(props, Column);
	const keyOf = props.key || (item => item);
	// Rows live in ONE persistent Map; each reconcile pass stamps the rows
	// it keeps instead of rebuilding a key map (a fresh Map per pass was
	// pure transient allocation at exactly the moment the arena is fullest
	// — adding a row is when "fxAbort memory full" hits).
	const rows = new Map();		// key -> { n: node, d: dispose, s: stamp }
	let stamp = 0;
	track(effect(() => {
		const items = props.each();
		untrack(() => {
			const pass = ++stamp;
			const order = [];	// nodes in expected order this pass
			for (let i = 0; i < items.length; i++) {
				const item = items[i], k = keyOf(item, i);
				let row = rows.get(k);
				if (row) {
					if (row.s === pass)	// duplicate key: first occurrence wins
						continue;
				}
				else {
					const [node, dispose] = createRoot(() => asNode(() => props.children(item, i)));
					row = { n: node, d: dispose, s: 0 };
					rows.set(k, row);
				}
				row.s = pass;
				order.push(row.n);
			}
			// forEach, not entries(): the entries iterator allocates a fresh
			// [key, value] array per row on EVERY pass — garbage at exactly
			// the moment the arena is fullest (spec allows delete-in-forEach)
			rows.forEach((row, k) => {
				if (row.s !== pass) {	// key gone from the data
					host.remove(row.n);
					row.d();
					rows.delete(k);
				}
			});
			// Position pass: walk expected order with a cursor over the
			// host's real children; move/insert only mismatched nodes.
			let cursor = host.first;
			for (const node of order) {
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
		rows.forEach(row => row.d());
		rows.clear();
	});
	return host;
}

// VirtualList({ data, rows, at, format, ... }) — a virtualized ("windowed")
// list; our FlatList. Creates a FIXED set of `rows` Labels ONCE and rewrites
// their .string as the window moves — CELL RECYCLING: nodes are never
// created or destroyed on scroll, so RAM is O(rows), not O(items). Any data
// source with count() and get(i) works (the byte-record store is one), so
// item DATA lives outside the arena (bytes) while only `rows` Piu nodes
// exist — that is the whole trick behind an unbounded list on 32KB.
//   data:   { count(): number, get(i): value }
//   rows:   visible row count (default 3)
//   at:     thunk -> window start index (read a signal inside it to scroll)
//   format: (value, index) -> string  (default String(value))
// A const arrow, not a `function` declaration (preloaded-module alias rule,
// gotcha 13). Overscan is intentionally omitted: this port redraws text
// instantly with no pixel/momentum scroll, so pre-mounting off-screen rows
// buys nothing (there is no lazy mount to warm) — we render exactly `rows`.
export const VirtualList = (props) => {
	const host = makeHost(props, Column);
	const rows = props.rows || 3;
	const fmt = props.format || (v => String(v));
	const data = props.data;
	for (let slot = 0; slot < rows; slot++) {
		const label = new Label(null, {});
		track(effect(() => {
			const i = (props.at ? props.at() : 0) + slot;
			label.string = (i >= 0 && i < data.count()) ? fmt(data.get(i), i) : "";
		}));
		host.add(label);
	}
	return host;
};

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
