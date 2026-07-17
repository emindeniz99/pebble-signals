// Control flow — with no re-render machinery, dynamic tree shape is owned
// by these components. Children are THUNKS returning nodes (there is no
// compiler making them lazy), each subtree runs under its own root so
// removal disposes every effect created inside it.
import { signal, effect, untrack, track, createRoot } from "runtime/signals";
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
// PUBLIC types — `pnpm run typecheck` resolves `runtime/flow` straight to this
// file, so misuse (e.g. passing both `format` and `renderRow`) is a compile
// error in app code. They are `type` aliases, not interfaces, so they stay
// assignable to the loose internal `Props` (implicit index signature).
type Props = Record<string, any>;
type Disposer = () => void;
/** A lazy reactive read — call it to get the current value (read signals inside). */
export type Thunk<T> = () => T;
/** {@link animate}'s return: CALL it for the current eased value; `.stop()` cancels the tween. */
export interface Tween {
	(): number;
	stop: () => void;
}

/**
 * Host-box coordinates shared by every control-flow component. These are
 * CONSTRUCTION-TIME STATICS — Piu lays out at construction and this port
 * rejects reactive coordinate writes (use {@link Move} for dynamic
 * position). GOTCHA: an unconstrained container measures at ZERO when
 * empty — pass `width`/`height` (or `left`+`right`/`top`+`bottom`) for
 * stable layout; a width-less host defaults to the full screen width.
 */
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

/** Props for {@link Show}. */
export type ShowProps = BoxProps & {
	/** The condition — a thunk; read signals inside to make it live. */
	when: Thunk<boolean>;
	/** The truthy side — a THUNK returning nodes (built lazily per toggle). */
	children: Thunk<JSXNode>;
	/** The falsy side; omitted = an empty placeholder (layout stays stable). */
	fallback?: Thunk<JSXNode>;
	/**
	 * Build BOTH sides once at mount and swap by reference — zero allocation
	 * per toggle, but both subtrees stay live (their effects keep running
	 * off-screen). Default (false) rebuilds the active side per toggle:
	 * cheaper memory, costlier toggles.
	 */
	keepAlive?: boolean;
};

/** Props for {@link For}. */
export type ForProps<T> = BoxProps & {
	/** The array — a thunk; read a signal inside so the list is live. */
	each: Thunk<T[]>;
	/**
	 * item -> unique key (default: item identity). Rows whose keys survive
	 * are KEPT (minimal Piu ops); a DUPLICATE key keeps its first occurrence
	 * and later items are skipped; NaN keys are normalized to stay stable.
	 */
	key?: (item: T, i: number) => unknown;
	/**
	 * Row builder — each row runs under its own root and disposes on removal.
	 * Must return ONE element (or a primitive, wrapped into a Label); an
	 * array/null row throws loud — a port constraint (one row = one mounted
	 * piu node), not Solid parity. `i` is the CREATION-TIME index: a kept
	 * row's builder never re-runs, so reorders do NOT update a captured `i`
	 * (contract; a per-row index signal would cost arena per row — Rule 4).
	 * Key rows by identity, not by index.
	 */
	children: (item: T, i: number) => JSXNode;
};

/** Anything with `count()` and `get(i)` — an array wrapper, the byte store, a lazy fetcher. */
export type DataSource<T> = {
	count(): number;
	get(i: number): T;
};
type VLBase<T> = BoxProps & {
	/** The data — `get(i)` is called ONLY for the visible window (lazy-fetch friendly). */
	data: DataSource<T>;
	/** Visible row count (default 3). Each row is LIVE Piu nodes on the 32KB heap — keep small. */
	rows?: number;
	/** Thunk -> window start index; read a signal inside it to scroll. */
	at?: Thunk<number>;
};
/**
 * {@link VirtualList} simple mode: one recycled Label per slot, text via
 * `format`. Mutually exclusive with `renderRow` (compile error if both).
 */
export type VLSimple<T> = VLBase<T> & {
	/** value -> row text (default `String(value)`). */
	format?: (v: T, i: number) => string;
	renderRow?: never;
};
/**
 * {@link VirtualList} rich mode: a recycled SUBTREE per slot via `renderRow`
 * (built once, never destroyed). Mutually exclusive with `format`. Each
 * extra node per row costs arena — the measured ceiling is brutal (see the
 * `richlist` example); prefer simple mode for scrollable multi-row lists.
 */
export type VLRich<T> = VLBase<T> & {
	/**
	 * Slot builder: `indexThunk()` is the slot's CURRENT record index (reads
	 * live). Must return ONE element per slot (array/null throws loud — same
	 * port constraint as {@link ForProps.children}).
	 */
	renderRow: (indexThunk: Thunk<number>, data: DataSource<T>) => JSXNode;
	format?: never;
};

export type MoveProps = BoxProps & {
	/** Horizontal offset (px) from the base position — a thunk; read signals inside. */
	x?: Thunk<number>;
	/** Vertical offset (px) from the base position — a thunk; read signals inside. */
	y?: Thunk<number>;
	/** Static children, built once at mount (position moves; the subtree does not rebuild). */
	children?: JSXNode;
};

/** The handle every {@link Navigator} screen builder receives. */
export type NavHandle = {
	/** Push a child screen — the CURRENT screen is disposed (one screen lives at a time). */
	push(build: (nav: NavHandle) => JSXNode): void;
	/** Pop to the parent (no-op at the root) — the parent REBUILDS from its builder. */
	pop(): void;
	/** Reactive current depth (1 = root). */
	depth(): number;
	/** Reactive: is there a parent to pop to. */
	canPop(): boolean;
};
/** Props for {@link Navigator}. */
export type NavigatorProps = BoxProps & {
	/**
	 * The root screen builder. The swap wraps every screen in a sized
	 * Container before mounting (the pre-wrapper port crash behind the old
	 * "must return a Container" rule; a fresh on-device probe of a bare-Label
	 * screen through the wrapper is still pending — prefer a Column root
	 * until it lands). Screen state does NOT survive a pop+rebuild — persist
	 * anything that must live in a signal OUTSIDE the builder.
	 */
	root: (nav: NavHandle) => JSXNode;
};
// NOTE: flow deliberately does NOT import consumePendingFocus — calling a
// preloaded module's function that WRITES another preloaded module's
// aliased variable kills the firmware at startup (measured by bisection;
// appendChild is safe because it never touches jsx-runtime module state).
// Consequence: the `focus` prop only works in the initial render() tree.

/**
 * Show({ when, children, fallback, keepAlive }) — `when` is a thunk;
 * children/fallback are thunks returning nodes. The host is sized by the
 * caller via coordinate props (an unconstrained Piu container measures at
 * zero when empty, so pass width/height or left/right/top/bottom for
 * stable layout).
 *
 * Each side is automatically wrapped in a Container sized like the host
 * before it is swapped in: the piu Pebble port crashes the firmware when a
 * bare Label is swapped as a container's direct child (measured — both
 * fresh rebuilds and prebuilt re-binds die), while Container-wrapped
 * subtrees swap and re-bind indefinitely.
 *
 * Two modes:
 *  - default: Solid semantics — swap subtrees, disposing the outgoing root
 *    (heap returns to its floor; verified in M5). The swap allocates the
 *    incoming subtree, which on the firmware-fixed 32KB arena can be the
 *    difference between running and "fxAbort memory full".
 *  - keepAlive: build children AND fallback once at mount and swap them by
 *    reference with the atomic replace() — zero allocation per toggle.
 *    (Not `visible`: setting visible on bound content crashes the port;
 *    not remove-now/re-add-later either: the re-add crashes.) A missing
 *    side becomes an empty placeholder wrapper so every transition still
 *    goes through replace(). Both subtrees stay live — their effects keep
 *    running while off-screen. The right default when memory is tighter
 *    than update cost.
 *
 * PERF: Show is the most expensive control-flow node — a host container plus a
 * per-side wrapper subtree. For a one-widget toggle prefer a reactive string
 * (`string={() => cond() ? a : b}`) — no subtree. Reach for `keepAlive` when
 * the same two sides toggle often (builds both once, swaps by reference — zero
 * allocation per toggle) and for the default rebuild mode when memory is
 * tighter than update cost (only one side is ever allocated).
 */
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
	let cur = -1; // last rendered side: -1 unbuilt, 0 fallback, 1 children
	effect(() => {
		const on = props.when() ? 1 : 0;
		// only rebuild when truthiness actually FLIPS — a predicate like
		// `() => count() > 0` re-runs this effect on every count change, but
		// while it stays truthy the shown subtree (its state/effects/timers)
		// must survive, not be disposed and rebuilt (mirrors keepAlive's
		// `next === mounted` guard, minus the both-sides-live allocation).
		if (on === cur) return;
		// back to UNBUILT until the build lands: a throwing side is CONTAINED
		// upstream (notify/report), and a pre-latched `cur` would then claim a
		// side is mounted while the host sits empty — suppressing every retry
		// with that truthiness (sticky blank side, audit F1). Reset-then-latch
		// makes ANY next re-run rebuild after a contained throw, in either
		// direction, with no try/catch frame (same self-heal contract as U7).
		cur = -1;
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
		cur = on; // latch only a SUCCESSFUL build
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

// NOTE: <ErrorBoundary> moved to jsx-runtime (2026-07). It began life here
// next to Show/For, but pulling the WHOLE flow module for one component cost
// an extra archive module record (+2 ids, gotcha 15) — measured to matter on
// a saturated app's boot floor. It lives in jsx-runtime now, so a lean app
// gets local error containment without flow.

/**
 * For({ each, key, children }) — keyed reconcile. `each` is a thunk
 * returning an array; `key` maps item -> unique key (default: identity);
 * `children` is (item, index) -> node. Rows whose keys survive are kept;
 * new keys mount in their own root; removed keys dispose; a DUPLICATE key
 * keeps its first occurrence and the later items are skipped. Reconcile
 * does MINIMAL piu ops (remove departed, insert/move only misplaced
 * nodes) — a full empty()+re-add per update destabilizes the piu Pebble
 * port and costs native churn per row (measured: app death after ~15-25
 * cycles).
 */
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
				const item = items[i];
				let k = keyOf(item, i);
				if (k !== k) k = "\u0000NaN"; // NaN never indexOf-matches -> silent full churn (U9)
				let x = rk.indexOf(k);
				if (x >= 0) {
					if (rs[x] === pass)
						// duplicate key: first occurrence wins
						continue;
				} else {
					// `children` may legally return a primitive (JSXNode); asRow
					// wraps a string/number into a Label (as appendChild does) and
					// fails LOUD on an array/null row, so the reconcile slot is
					// always a real mounted node.
					const [node, dispose] = createRoot(() => asRow(() => props.children(item, i), "For"));
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
					if (rn[x].container) host.remove(rn[x]); // contained-throw pass may leave a row unmounted
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

/**
 * VirtualList({ data, rows, at, format, ... }) — a virtualized ("windowed")
 * list; our FlatList. Creates a FIXED set of `rows` Labels ONCE and rewrites
 * their .string as the window moves — CELL RECYCLING: nodes are never
 * created or destroyed on scroll, so RAM is O(rows), not O(items). Any data
 * source with count() and get(i) works (the byte-record store is one), so
 * item DATA lives outside the arena (bytes) while only `rows` Piu nodes
 * exist — that is the whole trick behind an unbounded list on 32KB.
 *   data:   { count(): number, get(i): value }
 *   rows:   visible row count (default 3)
 *   at:     thunk -> window start index (read a signal inside it to scroll)
 *   format: (value, index) -> string  (default String(value))
 *
 * PERF / LAZY DATA: only `rows` nodes ever exist (recycled), and get(i) is
 * called ONLY for the visible window — so the data source can lazy-fetch or
 * lazy-compute inside get(i) and an "unbounded" list costs O(rows) RAM. Keep
 * `rows` small (each row is live Piu nodes on the 32KB heap); use `format`
 * (one Label/row, cheap) over `renderRow` (a subtree/row) unless you need it.
 * A const arrow, not a `function` declaration (preloaded-module alias rule,
 * gotcha 13). Overscan is intentionally omitted: this port redraws text
 * instantly with no pixel/momentum scroll, so pre-mounting off-screen rows
 * buys nothing (there is no lazy mount to warm) — we render exactly `rows`.
 */
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
			// surface); asRow wraps a string/number into a Label (as For and
			// appendChild do) and rejects array/null slots loud, so host.add
			// never gets a raw value.
			host.add(asRow(() => props.renderRow(() => (at ? at() : 0) + slot, data), "VirtualList"));
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

/**
 * Navigator({ root }) — a screen STACK for infinitely-deep navigation on the
 * 32KB heap. Only the TOP screen is ever BUILT: pushing a child disposes the
 * current screen's nodes+effects and builds the child; popping disposes the
 * child and REBUILDS the parent from its stored builder. So the arena holds
 * exactly ONE screen regardless of stack depth — you can drill 100 levels and
 * the heap stays flat (the stack itself is just an array of small builder
 * closures). This is #13's lazy-swap generalized into a back-stack.
 *
 * `root` is a builder (nav) => node|thunk. Every screen builder receives the
 * same `nav` handle:
 *   nav.push(build)  push a child screen (build is (nav) => node)
 *   nav.pop()        pop to the parent (no-op at the root)
 *   nav.depth()      reactive current depth (1 = root)
 *   nav.canPop()     reactive: is there a parent to pop to
 * Parent screen state does NOT survive a pop+rebuild — keep anything that must
 * persist in a signal OUTSIDE the screen builder (the standard swap tradeoff).
 *
 * GOTCHAS (measured):
 *  - do NOT make a Navigator the DIRECT child of a focused Container — the piu
 *    port crashes at mount resolving focus into a dynamically-built direct
 *    child. Wrap it in a Column (like Show).
 *  - screen builders may return any node — the swap wraps EVERY screen in a
 *    concrete-sized Container before mounting (the same wrapper Show uses),
 *    which is what the old "must return a Container element" rule guarded
 *    against: pre-wrapper, a bare Label added straight to the host crashed
 *    the swap (measured, multilazy era). The wrapper path is pinned in the
 *    Node suite; a fresh ON-DEVICE probe of a bare-Label screen through the
 *    wrapper is still pending (Rule 2), so prefer a Column screen root until
 *    that receipt lands.
 *  - the host is given a CONCRETE width AND height (full screen unless the
 *    caller passes them). multilazy's host is 180x140 for a reason: a host
 *    with no height gives a multi-child column no vertical box and the port
 *    crashes laying it out (measured — 1 label survived, 2+ died).
 * Buttons go on the outer focused Container and drive nav via the handle
 * screens hand back.
 */
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
			// r-tuple used WITHOUT destructuring: two locals -> one. This function
			// is chain-resident at max render depth (Round 7); the jsx key param
			// (U1 fix) costs one slot per nested component jsx frame, and this
			// buys it back — navreactive sits ONE slot from the 384 wall.
			const r = createRoot(() => {
				// asNode INLINED (build(nav) called directly, not asNode(() => …)):
				// the INITIAL swap runs deep inside render()'s build, and every frame
				// here counts against the mod's fixed JS value stack — a Navigator
				// over a reactive screen sits near it (field-notes Round 7). Dropping
				// the asNode call + its arg-arrow shaves two frames from that chain;
				// the auto-thunk unwrap is identical to asNode's.
				let s: unknown = build(nav);
				if (typeof s === "function") s = (s as () => unknown)();
				appendChild(wrapper, s as JSXNode);
				return wrapper;
			});
			// re-entrant push()/pop() DURING this build (a redirecting screen)
			// already mounted the real top — this orphan must not double-mount
			// or clobber disposeTop (the pushed screen's root leaked; U3)
			if (stack[stack.length - 1] !== build) {
				r[1]();
				return;
			}
			disposeTop = r[1];
			host.add(r[0]);
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
		// a cascade below us (a completion write stopping other tweens) can
		// shrink the array past this index — the slot may now be empty
		if (r === undefined) continue;
		r.elapsed += STEP;
		const p = r.elapsed >= r.dur ? 1 : r.elapsed / r.dur;
		r.sig.value = r.from + (r.to - r.from) * r.ease(p);
		if (p >= 1) {
			// re-resolve: the value write above can cascade into stop()/dispose of
			// ANOTHER tween below us, shifting indices — splice(i) would then
			// remove the wrong tween (it froze forever; reproduced). Mirror stop().
			const j = a.indexOf(r);
			if (j >= 0) a.splice(j, 1);
		}
	}
	if (a.length === 0) {
		clearInterval(t.timer); // last tween done — release the native timer
		// a completion write above may have CASCADED — stopping the last tween
		// (nulling `ticker`) and then starting a replacement, which installs a
		// FRESH ticker. Only clear the global when it is still the one this
		// tick captured, or we orphan the replacement's timer/active list.
		if (ticker === t) ticker = null;
	}
};

/**
 * animate(from, to, ms, easing?) — a Reanimated-style tween. Returns a getter
 * thunk backed by a signal; the shared ~30fps ticker eases the value from -> to
 * over `ms` and drops it when it lands. Read it in a binding to drive UI:
 *   const x = animate(0, 100, 400);
 *   <Label string={() => "x " + Math.round(x())} />
 * `easing` maps progress 0..1 -> 0..1 (default linear). The tween is registered
 * with the current owner, so disposing the subtree that created it stops it;
 * `.stop()` cancels manually. setInterval is always present on device (the base
 * mod manifest provides the timer module) — no no-timer fallback: if it is ever
 * absent the throw is the correct fail-loud signal (a missing timer module),
 * not a silently frozen tween.
 */
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

/**
 * Move({ x, y, children }) — reactive POSITION for a mounted subtree.
 * Coordinate props are construction-time statics on this port (jsx-runtime
 * rejects bind-time coordinate writes), but `content.moveBy(dx,dy)`
 * post-mount is device-proven safe (2026-07 probe: a box stepped across
 * gabbro for 6 heartbeats, 0 aborts — unlike `visible` writes, which crash
 * the port). Move wraps its children in a host container at the
 * construction-time base position (left/top/width/height props), then ONE
 * effect tracks the x()/y() offset thunks and applies the DELTA between the
 * last applied offset and the new one via moveBy. Offsets are rounded to
 * whole pixels BEFORE diffing, so float sources (an animate() tween) never
 * accumulate sub-pixel drift. The children build once at mount and never
 * rebuild — only their position changes (recycling, not reconcile).
 *   const x = animate(0, 80, 1200);
 *   <Move left={20} top={40} width={40} height={40} x={x}>
 *     <Label ... />
 *   </Move>
 * Size the host explicitly like any moving widget (makeHost's screen-width
 * default applies when you don't — fine for a marquee row, wrong for a
 * sprite). Offsets are RELATIVE to the base position, not absolute
 * coordinates: x/y = 0 means "at rest where you were constructed".
 */
export function Move(props: MoveProps): PiuContainer {
	const host = makeHost(props, Column);
	if (props.children !== undefined) appendChild(host, props.children);
	const px = props.x,
		py = props.y;
	let lx = 0,
		ly = 0;
	effect(() => {
		const nx = px ? Math.round(px()) : 0;
		const ny = py ? Math.round(py()) : 0;
		if (nx !== lx || ny !== ly) {
			host.moveBy(nx - lx, ny - ly);
			lx = nx;
			ly = ny;
		}
	});
	return host;
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
	const n = typeof result === "function" ? (result as () => unknown)() : result;
	// A PRIMITIVE row/child is legal on the JSXNode type surface (`() => n`),
	// but a For slot / Show side becomes a real mounted node handed to piu
	// add/insert — a raw string there crashes the port. Wrap it in a Label
	// exactly as appendChild does (a caller that re-appends through
	// appendChild just gets an already-mounted Content — no double wrap).
	return (
		typeof n === "string" || typeof n === "number" ? new Label(null, { string: String(n) }) : n
	) as JSXNode;
}

// A For/VirtualList row is ONE mounted node handed to piu add/insert. An
// array or null/undefined row has no single-node meaning there — a raw array
// lands in the piu tree as garbage and null dies later inside reconcile with
// an unactionable TypeError. PORT CONSTRAINT (not Solid parity — Solid
// accepts fragment/array rows): fail loud at row build, like bindErr. Show
// sides don't come through here — appendChild legally flattens arrays and
// skips null for them.
function asRow(build: unknown, who: string): Content {
	const n = asNode(build);
	// booleans too: appendChild SKIPS true/false as children, but a skipped
	// row has no single-node meaning either — same loud refusal.
	if (n === null || n === undefined || typeof n === "boolean" || Array.isArray(n))
		throw new Error(
			`${who}: row must be a single element (got ${Array.isArray(n) ? "an array" : String(n)})`,
		);
	return n as Content;
}
