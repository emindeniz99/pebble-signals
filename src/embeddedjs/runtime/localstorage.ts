// A reactive string cell persisted to the host `localStorage` — the opt-in
// `runtime/localstorage` module. OPT-IN & ZERO-COST: an app that never imports
// it never ships it (the manifest prunes to the import closure — README
// tree-shaking), so this module costs non-users nothing.
//
// SUBSTRATE: Pebble/Moddable exposes W3C webstorage as the `localStorage`
// global — a thin wrapper over `device.keyValue` (the per-app flash key-value
// store). It is STRINGS ONLY: `getItem` returns `string | null`, `setItem`
// takes `(key, value)` strings. There is no JSON layer here; callers that need
// a number own the `String(n)` / `parseInt` round-trip (see examples/localstore).
//
// REACTIVITY: the getter is a plain signal read (runtime/signals) — reading it
// inside an effect / a jsx binding thunk subscribes, exactly like `useState`'s
// getter, so a `<Label string={() => value()} />` repaints when the setter
// runs. The setter is the ONE write path: it Object.is-skips unchanged writes
// (NaN-safe, matching the packed core's `S.set`), then sets the signal AND
// mirrors the value into `localStorage` so the next boot seeds from it.
//
// ROBUSTNESS: `localStorage` is captured ONCE at call time as a bare global
// (it resolves to the mod compartment global). A host WITHOUT webstorage leaves
// it undefined — a bare reference there would ReferenceError, so we probe with
// `typeof` and fall back to a pure IN-MEMORY signal (seeded from `initial`,
// setter still updates the getter, just nothing is persisted). The hook NEVER
// crashes on a webstorage-less host.
import { signal } from "runtime/signals";

/**
 * A `useState`-shaped tuple over a string persisted in `localStorage`.
 *
 *   const [name, setName] = useLocalStorage("name", "world");
 *   <Label string={() => "hi " + name()} />          // reactive read
 *   // later, from a button handler:
 *   setName("pebble");                                // updates + persists
 *
 * On init the stored value (if any) wins over `initial`; a missing key seeds
 * with `initial`. The setter drops unchanged writes (Object.is), otherwise
 * updates the reactive getter and calls `localStorage.setItem(key, v)`. On a
 * host with no `localStorage`, it degrades to a plain in-memory signal (see the
 * module header). STRINGS only — store numbers as `String(n)` / read back with
 * `parseInt`.
 *
 * @param key the localStorage key to read/write
 * @param initial the value used when the key is absent
 * @returns `[getter, setter]` — call `getter()` to read (reactive), `setter(v)` to write
 */
export function useLocalStorage(key: string, initial: string): [() => string, (v: string) => void] {
	// Capture the bare global ONCE (typeof-probe so a webstorage-less host is a
	// clean `undefined`, not a ReferenceError). getItem returns null when absent.
	const ls = typeof localStorage !== "undefined" ? localStorage : undefined;
	const stored = ls ? ls.getItem(key) : null;
	const s = signal(stored !== null ? stored : initial);
	return [
		() => s.value,
		(v: string) => {
			// Object.is, not === (NaN-safe equal-write skip, mirrors S.set): also
			// gates setItem, so an unchanged write touches neither signal nor flash.
			if (Object.is(v, s.v)) return;
			s.value = v;
			if (ls) ls.setItem(key, v);
		},
	];
}
