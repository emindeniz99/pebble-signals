// Editor/typecheck shims — ONLY the JSX contract lives here now.
//
// * Piu/Pebble host globals (Application, Container, Label, Skin, Style,
//   Texture, SVGImage, console, setInterval, …) come from the REAL Moddable
//   typings vendored under types/moddable/ (see tools/sync-moddable-typings.sh),
//   wired into tsconfig.check.json.
// * The `runtime/*` module surface is NOT declared here anymore (B6): imports
//   resolve straight to the runtime .ts sources via tsconfig `paths`, so the
//   generics, prop contracts and JSDoc in src/embeddedjs/runtime/*.ts are the
//   single typed truth — nothing to hand-maintain, nothing to drift.

declare namespace JSX {
	type Element = any;
	interface IntrinsicElements {}
	interface ElementChildrenAttribute {
		children: {};
	}
}

// `importNow` as a BARE GLOBAL is Pebble-specific, but the capability is
// standard Moddable. The mechanism is `Modules.importNow(name)` (see the SDK's
// typings/modules.d.ts and documentation/xs/mods.md); Pebble's boot host
// (build/devices/pebble/host/main.js, ~line 169) wraps it —
//   importNow(specifier) { return state.mod.importNow(specifier); }
// — and passes that 1-arg wrapper into the app's compartment, so we call it
// unqualified. It loads + synchronously runs a module from the mod archive
// (precompiled bytecode; no on-device source compile) and returns its default
// export. Used by the lazyscreen example (#27). See docs/field-notes.md §1.
declare function importNow(specifier: string): any;
