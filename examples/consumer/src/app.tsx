// Dogfooding example (C11 packaging, docs/packaging.md): this file typechecks
// against signal-piu as an INSTALLED library — the package installed here is
// the tarball `npm pack` produces from the repo root, not the in-repo source
// tree (see tools/consumer-smoke.mts, which packs + installs + typechecks
// this exact file on every `npm run test:consumer`).
//
// SCOPE: this only needs to TYPECHECK. A real on-device watch app also needs
// the Pebble/Moddable project scaffold (package.json `pebble` field,
// manifest.base.json, src/c/mdbl.c, wscript glue) and the vendored Piu host
// typings (types/moddable/) wired into its own tsconfig — that's the "app
// template" half of packaging, explicitly out of v1's scope (see
// docs/packaging.md, "Not in v1": the create-signal-piu scaffold CLI is
// roadmapped to fill this gap). So nothing here touches a real Piu host
// element (Label/Container/...) — Show/VirtualList's `Node` type is `any` by
// design, so a plain tagged object stands in for what would be real JSX host
// elements in a device build.
import { useState, computed, createResource } from "signal-piu/signals";
import { Show, VirtualList, type DataSource } from "signal-piu/flow";

// ---- counter ----------------------------------------------------------------
const [count, setCount] = useState(0);
const doubled = computed(() => count() * 2);

function increment(): void {
	setCount((c) => c + 1);
}

// ---- conditional --------------------------------------------------------------
function CounterPanel() {
	return (
		<Show when={() => count() > 0} fallback={() => ({ tag: "empty" })}>
			{() => ({ tag: "count", value: doubled.value })}
		</Show>
	);
}

// ---- list over a data source ---------------------------------------------------
// Any `{ count(), get(i) }` works as VirtualList's DataSource — a plain array
// wrapper here; a real app would use the byte-record store (createStore) so
// item data lives outside the 32KB arena instead of as JS objects.
function arraySource<T>(items: T[]): DataSource<T> {
	return {
		count: () => items.length,
		get: (i) => items[i],
	};
}

const watchNames = arraySource(["Emery", "Gabbro", "Robert", "Silk"]);

function WatchList() {
	return <VirtualList data={watchNames} rows={3} format={(name, i) => `${i}: ${name}`} />;
}

// ---- async resource -------------------------------------------------------------
// createResource proxies fetch() through the phone on-device (README gotcha
// 18); here it only proves the generic Resource<T> shape typechecks end to end.
const releases = createResource(() =>
	Promise.resolve({ version: "1.0.0", platforms: ["emery", "gabbro"] }),
);

function ReleaseLabel() {
	return (
		<Show when={() => !releases.loading()} fallback={() => ({ tag: "loading" })}>
			{() => ({ tag: "release", version: releases.data()?.version })}
		</Show>
	);
}

export { CounterPanel, WatchList, ReleaseLabel, increment };
