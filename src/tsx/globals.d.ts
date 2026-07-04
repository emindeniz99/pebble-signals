// Editor/typecheck shims. The Alloy host injects Piu classes as compartment
// globals at runtime. The Piu/Pebble host globals (Application, Container,
// Label, Skin, Style, Texture, SVGImage, console, setInterval, …) now come from
// the REAL Moddable typings vendored under types/moddable/ (see
// tools/sync-moddable-typings.sh) and wired into tsconfig.check.json — not the
// `any` stubs that used to live here. This file keeps only what is OURS: the
// JSX contract and the runtime/* module surface.

declare namespace JSX {
	type Element = any;
	interface IntrinsicElements {}
	interface ElementChildrenAttribute { children: {} }
}

declare module "runtime/jsx-runtime" {
	/** JSX factory (automatic runtime). Host Piu type → real node; function → component call. */
	export function jsx(type: any, props: any): any;
	/** JSX factory for elements with static children (same behavior as {@link jsx}). */
	export function jsxs(type: any, props: any): any;
	/** `<>...</>` — returns its children unchanged. */
	export function Fragment(props: any): any;
	/** Mount a JSX tree as the Piu Application. `build` runs under a root owner. */
	export function render(build: () => any, dict?: any): any;
	/** Append a child (node / string / number / array) to a parent Piu node. */
	export function appendChild(parent: any, child: any): void;
	/** RN-Dimensions-style screen size; valid once {@link render} has started. */
	export const screen: { width: number; height: number };
}
declare module "runtime/signals" {
	/**
	 * Create a reactive value. Reading `.value` inside an {@link effect} (or a
	 * JSX binding thunk) subscribes to it; writing `.value` notifies subscribers.
	 * The build lowers `const s = signal(v)` to the packed integer {@link S} API.
	 * @param value initial value
	 */
	export function signal<T>(value: T): { value: T };
	/**
	 * Run `fn` now and re-run it whenever a signal it READ changes. Dependencies
	 * are re-tracked every run (conditional deps work). Returns an integer effect
	 * id — dispose with {@link dispose}, or {@link track} it to an owner. A bare
	 * `effect()` is NOT auto-owned; the hooks ({@link useEffect}) track for you.
	 */
	export function effect(fn: () => void): number;
	/**
	 * Memoized derived signal: `fn` re-runs only when a dependency changes, and
	 * its value is cached across reads. Costs one internal effect — prefer a
	 * plain thunk `() => a() + b()` unless the value is read in many places.
	 */
	export function computed<T>(fn: () => T): { readonly value: T };
	/** Read signals inside `fn` WITHOUT subscribing to them. */
	export function untrack<T>(fn: () => T): T;
	/**
	 * Coalesce writes: N `.value` sets inside `fn` produce ONE notification per
	 * subscriber (union of touched signals), after `fn` returns. Reads inside the
	 * batch see new values eagerly; only notification defers (Solid semantics).
	 */
	export function batch<T>(fn: () => T): T;
	/** Mutable box that never notifies — React's `useRef`. */
	export function useRef<T>(v: T): { current: T };
	/** React's `useReducer`, over {@link useState}: `dispatch` is a functional update. */
	export function useReducer<S, A>(reducer: (s: S, a: A) => S, init: S): [() => S, (a: A) => void];
	/** Run `fn` once, untracked. Components run once here, so this is "do it once". */
	export function onMount(fn: () => void): void;
	/** Create a context cell with a default value; read via {@link useContext}. */
	export function createContext<T>(defaultValue: T): { v: T };
	/** Read the current value of a context created by {@link createContext}. */
	export function useContext<T>(ctx: { v: T }): T;
	/** Set `ctx` to `value` for the (synchronous) duration of `build()`, then restore. */
	export function provide<T, R>(ctx: { v: T }, value: T, build: () => R): R;
	/** Terminal disposal for a closure disposer or a packed effect id. */
	export function dispose(d: number | (() => void)): void;
	/**
	 * Run `fn` under a fresh owner; returns `[result, disposer]`. Calling the
	 * disposer tears down every effect/cleanup {@link track}ed during `fn`.
	 */
	export function createRoot<T>(fn: () => T): [T, () => void];
	/** Register a cleanup to run when the current owner is disposed. */
	export function onCleanup(fn: () => void): void;
	/** Register an effect id / disposer with the current owner; returns it. */
	export function track(disposer: number | (() => void)): number | (() => void);
	/**
	 * React-style state, Solid semantics: returns `[getter, setter]` where the
	 * getter is a CALL — `count()`, not `count`. The setter takes a value or a
	 * functional update `setCount(c => c + 1)`. Lowered to the packed {@link S} API.
	 */
	export function useState<T>(init: T): [() => T, (v: T | ((prev: T) => T)) => void];
	/**
	 * Auto-tracked effect (no dependency array). An optional returned function is
	 * the cleanup: it runs before every re-run and once more at dispose.
	 */
	export function useEffect(fn: () => void | (() => void)): void;
	/** Memoized getter over {@link computed}: `const total = useMemo(() => a() + b())`. */
	export function useMemo<T>(fn: () => T): () => T;
	/**
	 * Packed lowering target — integer-id signals with zero per-signal objects.
	 * `build.mts` rewrites `useState`/`signal`/`computed` to this at compile time;
	 * you rarely call it by hand.
	 */
	export const S: {
		/** Allocate a packed signal, return its integer id. */
		sig<T>(v: T): number;
		/** Read packed signal `i` (subscribes the current effect). */
		get<T>(i: number): T;
		/** Functional-update write (the `useState` setter contract). */
		set<T>(i: number, v: T | ((prev: T) => T)): void;
		/** RAW write — stores a function verbatim (the `signal.value =` contract). */
		put<T>(i: number, v: T): void;
		/** Packed memo: one value slot + one recomputing effect. */
		computed<T>(fn: () => T): number;
	};
	/** Byte-record store (serialize primitives/records to a Uint8Array). See docs. */
	export function createStore(size: number): any;
}
declare module "runtime/owner" {
	export function createRoot<T>(fn: () => T): [T, () => void];
	export function onCleanup(fn: () => void): void;
	export function track(disposer: () => void): () => void;
}

// Control-flow components. Prop contracts are expressed as TYPES so a
// `npm run typecheck` pass catches misuse at compile time even though the
// runtime build transpiles with noCheck. The headline guard: VirtualList's
// `format` (simple mode) and `renderRow` (rich mode) are MUTUALLY EXCLUSIVE —
// passing both, or neither-with-the-wrong-one, is a type error.
declare module "runtime/flow" {
	type Thunk<T> = () => T;
	type Node = any;
	/**
	 * Reanimated-style tween. Returns a getter eased from `from` to `to` over
	 * `ms` (driven by one shared timer); `.stop()` cancels. Read it in a reactive
	 * binding to animate a property: `string={() => Math.round(x())}`.
	 * @param easing optional easing `t => t'` over `t ∈ [0,1]` (default linear)
	 */
	export function animate(
		from: number,
		to: number,
		ms: number,
		easing?: (t: number) => number,
	): { (): number; stop(): void };
	interface BoxProps {
		width?: number; height?: number;
		left?: number; right?: number; top?: number; bottom?: number;
		skin?: any; style?: any;
	}

	interface ShowProps extends BoxProps {
		when: Thunk<boolean>;
		children: Thunk<Node>;
		fallback?: Thunk<Node>;
		keepAlive?: boolean;
	}
	/** Conditional subtree: builds `children` when `when()` is truthy, else `fallback`. `keepAlive` hides instead of disposing. */
	export function Show(props: ShowProps): Node;

	interface ForProps<T> extends BoxProps {
		each: Thunk<T[]>;
		key?: (item: T, i: number) => unknown;
		children: (item: T, i: number) => Node;
	}
	/** Keyed list reconciler: maps `each()` to nodes via `children`, reusing rows by `key`. */
	export function For<T>(props: ForProps<T>): Node;

	interface DataSource<T> { count(): number; get(i: number): T; }
	interface VLBase<T> extends BoxProps {
		data: DataSource<T>;
		rows?: number;
		at?: Thunk<number>;
	}
	// simple mode: recycled Labels via `format`. `renderRow` forbidden.
	interface VLSimple<T> extends VLBase<T> {
		format?: (v: T, i: number) => string;
		renderRow?: never;
	}
	// rich mode: a recycled subtree per slot via `renderRow`. `format` forbidden.
	interface VLRich<T> extends VLBase<T> {
		renderRow: (indexThunk: Thunk<number>, data: DataSource<T>) => Node;
		format?: never;
	}
	/**
	 * Windowed list with recycled cells — a fixed pool of `rows` nodes scrolled
	 * over a `data` source. `format` (simple mode) and `renderRow` (rich mode) are
	 * MUTUALLY EXCLUSIVE at the type level.
	 */
	export function VirtualList<T>(props: VLSimple<T> | VLRich<T>): Node;

	interface NavHandle {
		push(build: (nav: NavHandle) => Node): void;
		pop(): void;
		depth(): number;
		canPop(): boolean;
	}
	interface NavigatorProps extends BoxProps {
		root: (nav: NavHandle) => Node;
	}
	/** Screen stack — only the TOP screen is built, so the arena is O(1) at any depth. `root(nav)` builds the first screen; `nav.push/pop` navigate. */
	export function Navigator(props: NavigatorProps): Node;
}
