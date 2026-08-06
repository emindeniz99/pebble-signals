// Guarded loader for the build's peerDependencies (esbuild, typescript).
//
// They are peerDependencies, so every normal npm 7+/pnpm 8+ install brings
// them at the tested ranges — but a consumer who skipped peers
// (--legacy-peer-deps, yarn classic, a hand-copied package) would otherwise
// die in the ESM LINKER with a bare ERR_MODULE_NOT_FOUND stack: a static
// `import` fails before any code runs, so no module can catch it. Loading
// through this dynamic import is the only way to name the fix instead.
//
// The `default ?? namespace` return handles CJS interop: `import("typescript")`
// yields { default: <the ts namespace> }, esbuild exposes the same API both
// ways, and pure-ESM peers simply have no default to prefer.
export async function loadPeer<T>(name: string): Promise<T> {
	try {
		const mod = (await import(name)) as { default?: T };
		return (mod.default ?? mod) as T;
	} catch {
		process.stderr.write(
			`build: ${name} not found — install the build peers first:\n` +
				"  npm install pebble-signals\n" +
				`(${name} is a peerDependency; npm 7+/pnpm 8+ install peers\n` +
				" automatically — on --legacy-peer-deps setups add them by hand\n" +
				" at the tested ranges: typescript@^6.0 esbuild@^0.28.1.\n" +
				" See docs/packaging.md.)\n",
		);
		process.exit(1);
	}
}
