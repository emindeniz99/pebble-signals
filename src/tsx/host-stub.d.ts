// LOOSE host-global stubs for the lenient runtime .js checkJs guard ONLY
// (tsconfig.runtime-check.json). The authoritative types come from the REAL
// vendored Moddable typings (types/moddable/, wired into the strict
// tsconfig.check.json) — but the .js guard runs with noImplicitAny off and only
// needs the Piu names to EXIST so the runtime bodies don't error as
// "cannot find name". These `any` stubs are TRANSITIONAL: they're deleted when
// the runtime converts to .ts (which type-checks against the real vendored
// typings). Do NOT include this file in the strict check — it would shadow the
// real types. This file is an AMBIENT SCRIPT (no import/export) so every
// declaration below is global; top-level `declare var` also augments globalThis
// so the runtime's `globalThis.localStorage` / `globalThis.__spError` type.
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
declare var localStorage: {
	getItem(k: string): string | null;
	setItem(k: string, v: string): void;
};
declare var __spError: ((e: Error) => void) | undefined;
