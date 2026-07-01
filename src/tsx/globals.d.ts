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
}
declare module "runtime/signals" {
	export function signal<T>(value: T): { value: T };
	export function effect(fn: () => void): () => void;
	export function computed<T>(fn: () => T): { readonly value: T };
	export function untrack<T>(fn: () => T): T;
}
declare module "runtime/owner" {
	export function createRoot<T>(fn: () => T): [T, () => void];
	export function onCleanup(fn: () => void): void;
	export function track(disposer: () => void): () => void;
}
