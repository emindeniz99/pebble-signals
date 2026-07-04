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

// Pebble-host-injected globals the vendored Moddable typings cannot know
// about: the boot host (build/devices/pebble/host/main.js) passes a
// synchronous module loader into the app's ArchiveCompartment. It resolves
// PRECOMPILED bytecode from the mod archive — there is no on-device source
// compile. Used by the lazyscreen example (#27).
declare function importNow(specifier: string): any;
