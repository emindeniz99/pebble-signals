// Editor-facing shims. The Alloy host injects Piu classes as compartment
// globals at runtime; the build transpiles with noCheck, so these exist to
// keep IDEs quiet, not to type-check.
declare const Application: any;
declare const Behavior: any;
declare const Column: any;
declare const Container: any;
declare const Content: any;
declare const Label: any;
declare const Layout: any;
declare const Port: any;
declare const Row: any;
declare const Scroller: any;
declare const Skin: any;
declare const Style: any;
declare const Text: any;
declare const Texture: any;
declare const console: { log(...args: unknown[]): void };
declare function setInterval(fn: () => void, ms: number): number;
declare function clearInterval(id: number): void;
declare function setTimeout(fn: () => void, ms: number): number;

declare namespace JSX {
	type Element = any;
	interface IntrinsicElements {}
	interface ElementChildrenAttribute { children: {} }
}

declare module "runtime/jsx-runtime" {
	export function jsx(type: any, props: any): any;
	export function jsxs(type: any, props: any): any;
	export function Fragment(props: any): any;
	export function render(build: () => any, dict?: any): any;
	export function appendChild(parent: any, child: any): void;
	// RN-Dimensions-style screen size; valid once render() has started.
	export const screen: { width: number; height: number };
}
declare module "runtime/signals" {
	export function signal<T>(value: T): { value: T };
	export function effect(fn: () => void): number;
	export function computed<T>(fn: () => T): { readonly value: T };
	export function untrack<T>(fn: () => T): T;
	export function batch<T>(fn: () => T): T;
	export function useRef<T>(v: T): { current: T };
	export function dispose(d: number | (() => void)): void;
	export function createRoot<T>(fn: () => T): [T, () => void];
	export function onCleanup(fn: () => void): void;
	export function track(disposer: number | (() => void)): number | (() => void);
	export function useState<T>(init: T): [() => T, (v: T | ((prev: T) => T)) => void];
	export function useEffect(fn: () => void | (() => void)): void;
	export function useMemo<T>(fn: () => T): () => T;
	// packed lowering target (S.sig/get/set/computed) — integer-id signals
	export const S: {
		sig<T>(v: T): number;
		get<T>(i: number): T;
		set<T>(i: number, v: T | ((prev: T) => T)): void;	// functional-update (useState)
		put<T>(i: number, v: T): void;					// raw write (signal .value =)
		computed<T>(fn: () => T): number;
	};
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
	export function Show(props: ShowProps): Node;

	interface ForProps<T> extends BoxProps {
		each: Thunk<T[]>;
		key?: (item: T, i: number) => unknown;
		children: (item: T, i: number) => Node;
	}
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
	export function Navigator(props: NavigatorProps): Node;
}
