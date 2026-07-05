// Control flow — with no re-render machinery, dynamic tree shape is owned
// by these components. Children are THUNKS returning nodes (there is no
// compiler making them lazy), each subtree runs under its own root so
// removal disposes every effect created inside it.
import {
	signal,
	effect,
	untrack,
	track,
	createRoot,
	withBoundary,
	getBoundary,
	report,
} from "runtime/signals";
import { appendChild, screen, type JSXNode } from "runtime/jsx-runtime";
import type {
	Skin,
	SkinDictionary,
	Style,
	StyleDictionary,
	ColumnConstructor,
	Container as PiuContainer,
	Content,
} from "../../../types/moddable/piu/MC-types";

// Control-flow works with Piu nodes and caller-supplied builder thunks — the
// dynamic boundary of the library. Children/build thunks return `JSXNode`
// (defined in jsx-runtime); hosts are the vendored `Container`, and per-row
// reconcile slots are the vendored `Content`. The prop contracts below are the
// PUBLIC types — `npm run typecheck` resolves `runtime/flow` straight to this
// file, so misuse (e.g. passing both `format` and `renderRow`) is a compile
// error in app code. They are `type` aliases, not interfaces, so they stay
// assignable to the loose internal `Props` (implicit index signature).
type Props = Record<string, any>;
type Disposer = () => void;
type Thunk<T> = () => T;
// animate()'s return: a getter you can call for the current value, with a
// .stop() to cancel the tween.
interface Tween {
	(): number;
	stop: () => void;
}

// Host-box coordinates shared by every control-flow component (construction-
// time statics — Piu lays out at construction; see jsx-runtime's bind reject).
export type BoxProps = {
	width?: number;
	height?: number;
	left?: number;
	right?: number;
	top?: number;
	bottom?: number;
	skin?: Skin | SkinDictionary;
	style?: Style | StyleDictionary;
};

export type ShowProps = BoxProps & {
	when: Thunk<boolean>;
	children: Thunk<JSXNode>;
	fallback?: Thunk<JSXNode>;
	keepAlive?: boolean;
};

export type ForProps<T> = BoxProps & {
	each: Thunk<T[]>;
	key?: (item: T, i: number) => unknown;
	children: (item: T, i: number) => JSXNode;
};

export type ErrorBoundaryProps = BoxProps & {
	/** the subtree to protect — a thunk returning nodes (like Show's children). */
	children: Thunk<JSXNode>;
	/** shown when the subtree throws; `reset` re-runs `children` under a fresh root. */
	fallback: (err: unknown, reset: () => void) => JSXNode;
};

/** Anything with `count()` and `get(i)` — an array wrapper, the byte store, a lazy fetcher. */
export type DataSource<T> = {
	count(): number;
	get(i: number): T;
};
type VLBase<T> = BoxProps & {
	data: DataSource<T>;
	rows?: number;
	at?: Thunk<number>;
};
// simple mode: recycled Labels via `format`. `renderRow` forbidden.
export type VLSimple<T> = VLBase<T> & {
	format?: (v: T, i: number) => string;
	renderRow?: never;
};
// rich mode: a recycled subtree per slot via `renderRow`. `format` forbidden.
export type VLRich<T> = VLBase<T> & {
	renderRow: (indexThunk: Thunk<number>, data: DataSource<T>) => JSXNode;
	format?: never;
};

export type NavHandle = {
	push(build: (nav: NavHandle) => JSXNode): void;
	pop(): void;
	depth(): number;
	canPop(): boolean;
};
export type NavigatorProps = BoxProps & {
	root: (nav: NavHandle) => JSXNode;
};
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
//
// PERF: Show is the most expensive control-flow node — a host container plus a
// per-side wrapper subtree. For a one-widget toggle prefer a reactive string
// (`string={() => cond() ? a : b}`) — no subtree. Reach for `keepAlive` when
// the same two sides toggle often (builds both once, swaps by reference — zero
// allocation per toggle) and for the default rebuild mode when memory is
// tighter than update cost (only one side is ever allocated).
export function Show(props: ShowProps): PiuContainer {
	const host = makeHost(props, Column);
	if (props.keepAlive) {
		const a = wrapSide(props, props.children);
		const b = wrapSide(props, props.fallback);
		let mounted: PiuContainer | null = null;
		effect(() => {
			const next = props.when() ? a : b;
			if (next === mounted) return;
			if (mounted) host.replace(mounted, next);
			else host.add(next);
			mounted = next;
		});
		return host;
	}
	let dispose: Disposer | null = null;
	effect(() => {
		const on = !!props.when();
		untrack(() => {
			if (dispose) {
				dispose();
				dispose = null;
			}
			// remove one-by-one instead of empty(): see For note below
			while (host.first) host.remove(host.first);
			const build = on ? props.children : props.fallback;
			const [tree, d] = createRoot(() => wrapSide(props, build));
			dispose = d;
			host.add(tree);
		});
	});
	track(() => {
		if (dispose) {
			dispose();
			dispose = null;
		}
	});
	return host;
}

// Build one side of a Show and wrap it in a Container sized like the host
// (see the bare-Label port bug above; width/height-sized wrappers are the
// on-device-proven shape). A missing side yields an EMPTY wrapper — never
// null — so keepAlive swaps always use replace().
function wrapSide(props: Props, build: (() => JSXNode) | undefined): PiuContainer {
	const wrapper = new Container(null, { width: props.width, height: props.height });
	if (build) appendChild(wrapper, asNode(build));
	return wrapper;
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
// 13 — matches VirtualList/Navigator); the whole module tree-shakes away for
// apps that never import it.
export const ErrorBoundary = (props: ErrorBoundaryProps): PiuContainer => {
	const host = makeHost(props, Column);
	// The boundary in scope when THIS one is built — a fallback that itself
	// throws escalates here (Solid nesting), not back into our own onError.
	const parent = getBoundary();
	let dispose: Disposer | null = null;
	let shown = false; // currently showing the fallback (not the children)?
	const clear = () => {
		if (dispose) {
			dispose();
			dispose = null;
		}
		while (host.first) host.remove(host.first);
	};
	// (re)build the protected subtree UNDER this boundary, so its effects' later
	// throws route back to onError (bnd tagging in signals' effect()/run()).
	const mountChildren = () => {
		const [tree, d] = createRoot(() =>
			withBoundary(onError, () => wrapSide(props, props.children)),
		);
		// A CREATION-TIME binding throw is caught by the binding guard (no
		// exception escapes createRoot) but fires onError SYNCHRONOUSLY during
		// the build — the fallback is already mounted. Drop this orphan children
		// tree instead of stacking it on top (mirrors render()'s `panicked`).
		if (shown) {
			d();
			return;
		}
		dispose = d;
		host.add(tree);
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
	// withBoundary(parent) so report()'s g.cb lookup lands on the parent (or
	// null), NOT back on THIS boundary — otherwise a failing fallback with no
	// parent would loop, and a parent's own fallback would be mis-tagged as
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
				const build = () => wrapSide(props, () => props.fallback(err, reset));
				const [tree, d] = createRoot(() => withBoundary(parent, build));
				dispose = d;
				host.add(tree);
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
		if (dispose) dispose();
	});
	return host;
};

// For({ each, key, children }) — keyed reconcile. `each` is a thunk
// returning an array; `key` maps item -> unique key (default: identity);
// `children` is (item, index) -> node. Rows whose keys survive are kept;
// new keys mount in their own root; removed keys dispose; a DUPLICATE key
// keeps its first occurrence and the later items are skipped. Reconcile
// does MINIMAL piu ops (remove departed, insert/move only misplaced
// nodes) — a full empty()+re-add per update destabilizes the piu Pebble
// port and costs native churn per row (measured: app death after ~15-25
// cycles).
export function For<T>(props: ForProps<T>): PiuContainer {
	const host = makeHost(props, Column);
	const keyOf = props.key || ((item: T) => item);
	// Rows live in FOUR index-aligned parallel arrays (keys/nodes/disposers/
	// stamps). A row is an INDEX: the previous Map (~10 slots + hash chunk)
	// and its per-row {n,d,s} record (~5 slots each) are gone — playbook
	// rule, "no Set/Map". Lookup is a linear indexOf: rows are few and CPU
	// is free. Each reconcile pass STAMPS the rows it keeps instead of
	// rebuilding a key map (a fresh map per pass was pure transient
	// allocation at exactly the moment the arena is fullest).
	const rk: unknown[] = [], // keys
		rn: Content[] = [], // nodes
		rd: Disposer[] = [], // disposers
		rs: number[] = []; // pass stamps
	let stamp = 0;
	effect(() => {
		const items = props.each();
		untrack(() => {
			const pass = ++stamp;
			const order: Content[] = []; // nodes in expected order this pass
			for (let i = 0; i < items.length; i++) {
				const item = items[i],
					k = keyOf(item, i);
				let x = rk.indexOf(k);
				if (x >= 0) {
					if (rs[x] === pass)
						// duplicate key: first occurrence wins
						continue;
				} else {
					// `children` may legally return a primitive (JSXNode) for the
					// type surface (see tests/types.test-d.tsx), but a reconcile
					// slot is always a real mounted node in practice — the cast is
					// type-only, matching the same boundary appendChild handles.
					const [node, dispose] = createRoot(
						() => asNode(() => props.children(item, i)) as Content,
					);
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
				if (node.container) host.remove(node);
				if (cursor) host.insert(node, cursor);
				else host.add(node);
			}
		});
	});
	track(() => {
		for (let x = 0; x < rd.length; x++) rd[x]();
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
//
// PERF / LAZY DATA: only `rows` nodes ever exist (recycled), and get(i) is
// called ONLY for the visible window — so the data source can lazy-fetch or
// lazy-compute inside get(i) and an "unbounded" list costs O(rows) RAM. Keep
// `rows` small (each row is live Piu nodes on the 32KB heap); use `format`
// (one Label/row, cheap) over `renderRow` (a subtree/row) unless you need it.
// A const arrow, not a `function` declaration (preloaded-module alias rule,
// gotcha 13). Overscan is intentionally omitted: this port redraws text
// instantly with no pixel/momentum scroll, so pre-mounting off-screen rows
// buys nothing (there is no lazy mount to warm) — we render exactly `rows`.
export const VirtualList = <T>(props: VLSimple<T> | VLRich<T>): PiuContainer => {
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
			// renderRow's return is JSXNode (may be a primitive per the type
			// surface); in practice it always builds a real node — same
			// type-only boundary cast as For's reconcile slot above.
			host.add(props.renderRow(() => (at ? at() : 0) + slot, data) as Content);
		}
		return host;
	}
	// simple rows: one recycled Label per slot, string via `format`
	const fmt = props.format || ((v: T) => String(v));
	for (let slot = 0; slot < rows; slot++) {
		const label = new Label(null, {});
		effect(() => {
			const i = (props.at ? props.at() : 0) + slot;
			label.string = i >= 0 && i < data.count() ? fmt(data.get(i), i) : "";
		});
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
export const Navigator = (props: NavigatorProps): PiuContainer => {
	const host = makeHost(props, Column);
	const stack: ((nav: NavHandle) => JSXNode)[] = [props.root];
	const depth = signal(1); // reactive; drives depth()/canPop()
	let disposeTop: Disposer | null = null;
	const swap = () =>
		untrack(() => {
			if (disposeTop) {
				disposeTop();
				disposeTop = null;
			}
			while (host.first) host.remove(host.first);
			const build = stack[stack.length - 1];
			// Wrap the screen in a Container sized with concrete width+height (like
			// Show). A screen added straight to a coordinate-anchored/height-less
			// host has no box and a multi-child column crashes the port's layout
			// (measured — 1 label survived, 2+ died). The wrapper gives it a box.
			const wrapper = new Container(null, {
				width: props.width || screen.width,
				height: props.height || screen.height,
			});
			const [tree, d] = createRoot(() => {
				appendChild(
					wrapper,
					asNode(() => build(nav)),
				);
				return wrapper;
			});
			disposeTop = d;
			host.add(tree);
		});
	const nav: NavHandle = {
		push(build: (nav: NavHandle) => JSXNode) {
			stack.push(build);
			depth.value = stack.length;
			swap();
		},
		pop() {
			if (stack.length > 1) {
				stack.pop();
				depth.value = stack.length;
				swap();
			}
		},
		depth: () => depth.value,
		canPop: () => depth.value > 1,
	};
	swap(); // build the root screen (like Show's initial effect)
	track(() => {
		if (disposeTop) {
			disposeTop();
			disposeTop = null;
		}
	});
	return host;
};

// Shared ~30fps ticker: EVERY live tween advances on ONE native timer, not one
// setInterval per tween. Concurrent tweens then cost one native timer + one tick
// closure total instead of N of each — the cheaper shape on the 32KB heap, and
// the one the animate() doc promises ("a single timer"). The ticker state is
// created LAZILY at runtime and never at preload: a module-scope object mutated
// after preload freezes into ROM and dies on the first `.push()` (the same
// reason signals.ts builds its graph through gi(), playbook gotcha). `tickAll`
// is a const arrow, not a `function` (preloaded-module alias rule, gotcha 13).
interface TweenRec {
	sig: ReturnType<typeof signal>;
	from: number;
	to: number;
	dur: number;
	ease: (t: number) => number;
	elapsed: number;
}
let ticker: { timer: number; active: TweenRec[] } | null = null;
// ~30fps. The SF32LB52J (240MHz) could afford 60fps, but the memory-LCD panel
// flush rate — not the CPU — is the real limiter, and it isn't documented; 30fps
// is the classic Pebble animation cadence and halves signal writes vs 60fps for
// a glanceable watch tween. Revisit only with an on-device flush-rate measurement.
const STEP = 33;
const tickAll = () => {
	// tickAll is ONLY ever this timer's callback and the timer is cleared the
	// instant `ticker` goes null (below and in stop()), so it never fires with
	// a null ticker — assert non-null like signals.ts's G! rather than guard a
	// branch that can't be taken.
	const t = ticker!;
	const a = t.active;
	// walk downward so splicing a finished tween doesn't skip its neighbor
	for (let i = a.length - 1; i >= 0; i--) {
		const r = a[i];
		r.elapsed += STEP;
		const p = r.elapsed >= r.dur ? 1 : r.elapsed / r.dur;
		r.sig.value = r.from + (r.to - r.from) * r.ease(p);
		if (p >= 1) a.splice(i, 1);
	}
	if (a.length === 0) {
		clearInterval(t.timer); // last tween done — release the native timer
		ticker = null;
	}
};

// animate(from, to, ms, easing?) — a Reanimated-style tween. Returns a getter
// thunk backed by a signal; the shared ~30fps ticker eases the value from -> to
// over `ms` and drops it when it lands. Read it in a binding to drive UI:
//   const x = animate(0, 100, 400);
//   <Label string={() => "x " + Math.round(x())} />
// `easing` maps progress 0..1 -> 0..1 (default linear). The tween is registered
// with the current owner, so disposing the subtree that created it stops it;
// `.stop()` cancels manually. setInterval is always present on device (the base
// mod manifest provides the timer module) — no no-timer fallback: if it is ever
// absent the throw is the correct fail-loud signal (a missing timer module),
// not a silently frozen tween.
export function animate(
	from: number,
	to: number,
	ms: number,
	easing?: (t: number) => number,
): Tween {
	const s = signal(from);
	const get = (() => s.value as number) as Tween;
	const rec: TweenRec = {
		sig: s,
		from,
		to,
		dur: ms > 0 ? ms : 1,
		ease: easing || ((t: number) => t),
		elapsed: 0,
	};
	if (!ticker) ticker = { timer: setInterval(tickAll, STEP), active: [] };
	ticker.active.push(rec);
	const stop = () => {
		if (!ticker) return; // already released (natural completion or prior stop)
		const a = ticker.active;
		const i = a.indexOf(rec);
		if (i >= 0) a.splice(i, 1);
		if (a.length === 0) {
			clearInterval(ticker.timer);
			ticker = null;
		}
	};
	track(stop); // stop on owner dispose
	get.stop = stop;
	return get;
}

function makeHost(props: Props, Type: ColumnConstructor): PiuContainer {
	const dict: Record<string, number | Skin | SkinDictionary | Style | StyleDictionary | undefined> =
		{};
	for (const k in props) {
		if (
			k === "left" ||
			k === "right" ||
			k === "top" ||
			k === "bottom" ||
			k === "width" ||
			k === "height" ||
			k === "skin" ||
			k === "style"
		)
			dict[k] = props[k];
	}
	// A width-less list measures 0 and draws nothing (gotcha 16). Default to
	// the real screen width so callers no longer hardcode `width={160}`;
	// explicit width, or left+right together, still win.
	if (dict.width === undefined && !(dict.left !== undefined && dict.right !== undefined))
		dict.width = screen.width;
	return new Type(null, dict); // every caller passes a Type (Column/Container)
}

function asNode(build: unknown): JSXNode {
	const result = (build as () => unknown)();
	// `result` is `unknown` (the auto-thunk unwrap is a genuinely dynamic
	// boundary); the cast is type-only and matches jsx-runtime's setProp/
	// appendChild casts at the same kind of boundary.
	return (typeof result === "function" ? (result as () => unknown)() : result) as JSXNode;
}
