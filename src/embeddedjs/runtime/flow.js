// Control flow — with no re-render machinery, dynamic tree shape is owned
// by these components. Children are THUNKS returning nodes (there is no
// compiler making them lazy), each subtree runs under its own root so
// removal disposes every effect created inside it.
import { signal, effect, untrack, track, createRoot } from "runtime/signals";
import { appendChild, screen } from "runtime/jsx-runtime";
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
	// Rows live in FOUR index-aligned parallel arrays (keys/nodes/disposers/
	// stamps). A row is an INDEX: the previous Map (~10 slots + hash chunk)
	// and its per-row {n,d,s} record (~5 slots each) are gone — playbook
	// rule, "no Set/Map". Lookup is a linear indexOf: rows are few and CPU
	// is free. Each reconcile pass STAMPS the rows it keeps instead of
	// rebuilding a key map (a fresh map per pass was pure transient
	// allocation at exactly the moment the arena is fullest).
	const rk = [], rn = [], rd = [], rs = [];
	let stamp = 0;
	track(effect(() => {
		const items = props.each();
		untrack(() => {
			const pass = ++stamp;
			const order = [];	// nodes in expected order this pass
			for (let i = 0; i < items.length; i++) {
				const item = items[i], k = keyOf(item, i);
				let x = rk.indexOf(k);
				if (x >= 0) {
					if (rs[x] === pass)	// duplicate key: first occurrence wins
						continue;
				}
				else {
					const [node, dispose] = createRoot(() => asNode(() => props.children(item, i)));
					x = rk.length;
					rk.push(k);
					rn.push(node);
					rd.push(dispose);
					rs.push(0);
				}
				rs[x] = pass;
				order.push(rn[x]);
			}
			// Sweep departed keys: downward walk + swap-pop keeps the arrays
			// dense with zero allocation (row array ORDER is irrelevant —
			// screen order comes from the position pass below).
			for (let x = rk.length - 1; x >= 0; x--) {
				if (rs[x] !== pass) {
					host.remove(rn[x]);
					rd[x]();
					const last = rk.length - 1;
					if (x !== last) {
						rk[x] = rk[last];
						rn[x] = rn[last];
						rd[x] = rd[last];
						rs[x] = rs[last];
					}
					rk.pop();
					rn.pop();
					rd.pop();
					rs.pop();
				}
			}
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
		for (let x = 0; x < rd.length; x++)
			rd[x]();
		rk.length = rn.length = rd.length = rs.length = 0;
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
	const data = props.data;
	// RICH rows: `renderRow(indexThunk, data)` builds a recycled subtree ONCE
	// per visible slot (a Row of Labels, an icon skin, etc). indexThunk()
	// returns the CURRENT record index for that slot — read a signal inside
	// it (via props.at) so the row's own bindings re-run on scroll. Still
	// recycling: the subtree is created once and never destroyed, unlike a
	// create/destroy FlatList (which on 32KB rides the ceiling and crashes
	// under scroll — measured). Each extra node per row costs arena, so
	// keep rows small; see the `richlist` example's measured budget.
	if (props.renderRow) {
		for (let slot = 0; slot < rows; slot++) {
			const at = props.at;
			host.add(props.renderRow(() => (at ? at() : 0) + slot, data));
		}
		return host;
	}
	// simple rows: one recycled Label per slot, string via `format`
	const fmt = props.format || (v => String(v));
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

// Navigator({ root }) — a screen STACK for infinitely-deep navigation on the
// 32KB heap. Only the TOP screen is ever BUILT: pushing a child disposes the
// current screen's nodes+effects and builds the child; popping disposes the
// child and REBUILDS the parent from its stored builder. So the arena holds
// exactly ONE screen regardless of stack depth — you can drill 100 levels and
// the heap stays flat (the stack itself is just an array of small builder
// closures). This is #13's lazy-swap generalized into a back-stack.
//
// `root` is a builder (nav) => node|thunk. Every screen builder receives the
// same `nav` handle:
//   nav.push(build)  push a child screen (build is (nav) => node)
//   nav.pop()        pop to the parent (no-op at the root)
//   nav.depth()      reactive current depth (1 = root)
//   nav.canPop()     reactive: is there a parent to pop to
// Parent screen state does NOT survive a pop+rebuild — keep anything that must
// persist in a signal OUTSIDE the screen builder (the standard swap tradeoff).
//
// GOTCHAS (measured):
//  - do NOT make a Navigator the DIRECT child of a focused Container — the piu
//    port crashes at mount resolving focus into a dynamically-built direct
//    child. Wrap it in a Column (like Show).
//  - each screen builder MUST return a CONTAINER element (a Column/Container),
//    not a bare Label — the screen node is added straight to the host (the
//    proven multilazy shape). A bare-Label child crashes the swap; a Column
//    wrapping your content is safe.
//  - the host is given a CONCRETE width AND height (full screen unless the
//    caller passes them). multilazy's host is 180x140 for a reason: a host
//    with no height gives a multi-child column no vertical box and the port
//    crashes laying it out (measured — 1 label survived, 2+ died).
// Buttons go on the outer focused Container and drive nav via the handle
// screens hand back.
export const Navigator = (props) => {
	const host = makeHost(props, Column);
	const stack = [props.root];
	const depth = signal(1);			// reactive; drives depth()/canPop()
	let disposeTop = null;
	const swap = () => untrack(() => {
		if (disposeTop) { disposeTop(); disposeTop = null; }
		while (host.first)
			host.remove(host.first);
		const build = stack[stack.length - 1];
		// Wrap the screen in a Container sized with concrete width+height (like
		// Show). A screen added straight to a coordinate-anchored/height-less
		// host has no box and a multi-child column crashes the port's layout
		// (measured — 1 label survived, 2+ died). The wrapper gives it a box.
		const wrapper = new Container(null,
			{ width: props.width || screen.width, height: props.height || screen.height });
		const [tree, d] = createRoot(() => { appendChild(wrapper, asNode(() => build(nav))); return wrapper; });
		disposeTop = d;
		host.add(tree);
	});
	const nav = {
		push(build) { stack.push(build); depth.value = stack.length; swap(); },
		pop() { if (stack.length > 1) { stack.pop(); depth.value = stack.length; swap(); } },
		depth: () => depth.value,
		canPop: () => depth.value > 1,
	};
	swap();						// build the root screen (like Show's initial effect)
	track(() => { if (disposeTop) { disposeTop(); disposeTop = null; } });
	return host;
};

function makeHost(props, Type) {
	const dict = {};
	for (const k in props) {
		if (k === "left" || k === "right" || k === "top" || k === "bottom"
				|| k === "width" || k === "height" || k === "skin" || k === "style")
			dict[k] = props[k];
	}
	// A width-less list measures 0 and draws nothing (gotcha 16). Default to
	// the real screen width so callers no longer hardcode `width={160}`;
	// explicit width, or left+right together, still win.
	if (dict.width === undefined && !(dict.left !== undefined && dict.right !== undefined))
		dict.width = screen.width;
	return new (Type || Container)(null, dict);
}

function asNode(build) {
	const result = build();
	return (typeof result === "function") ? result() : result;
}
