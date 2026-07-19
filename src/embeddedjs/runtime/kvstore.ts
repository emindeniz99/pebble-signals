// A reactive, JSON-persisted cell for STRUCTURED values — the opt-in
// `runtime/kvstore` module. OPT-IN & ZERO-COST: an app that never imports it
// never ships it (the manifest prunes to the import closure — README
// tree-shaking), so this module costs non-users nothing.
//
// SUBSTRATE: this is the structured sibling of `runtime/localstorage`. That
// module is STRINGS ONLY (getItem/setItem take strings — the raw W3C
// webstorage over `device.keyValue`); this one wraps the same store with a
// JSON layer so a caller can persist objects / arrays / numbers / booleans:
// `JSON.stringify` on write, `JSON.parse` on read. Everything else — the bare
// `localStorage` global, the flash-backed key-value store — is identical.
//
// REACTIVITY: the getter is a plain signal read (runtime/signals) — reading it
// inside an effect / a jsx binding thunk subscribes, exactly like `useState`'s
// getter, so a `<Label string={() => JSON.stringify(value())} />` repaints when
// the setter runs. The setter is the ONE write path: it sets the signal AND
// mirrors `JSON.stringify(v)` into `localStorage` so the next boot seeds from it.
//
// EQUAL-WRITE SKIP (differs from localstorage): structured values are NOT
// value-comparable, so we do NOT deep-compare — the Object.is skip fires only
// when the caller passes the SAME REFERENCE back (a genuine no-op). A caller
// who mutates-and-passes, or passes a fresh object, ALWAYS persists. This is
// deliberate: deep equality on the 32KB arena is expensive, and a JSON store's
// contract is "you handed me a new value, I save it".
//
// ROBUSTNESS: `localStorage` is captured ONCE at call time as a bare global
// (typeof-probe so a webstorage-less host is a clean `undefined`, not a
// ReferenceError) and a host WITHOUT it degrades to a pure IN-MEMORY signal —
// the hook NEVER crashes (same contract as useLocalStorage). A stored value
// that is corrupt / not JSON (a legacy string written by useLocalStorage, a
// truncated flash record) is caught by a try/catch around JSON.parse and falls
// back to `initial` — a bad key never throws.
//
// STRINGS caveat: `initial` and every value you `set` must be JSON-serializable
// (plain objects/arrays/numbers/strings/booleans/null — NO functions, cycles,
// or Piu nodes); JSON.stringify silently drops or mangles those, exactly as the
// platform JSON does.
import { signal } from "runtime/signals";

/**
 * A `useState`-shaped tuple over a STRUCTURED value persisted in `localStorage`
 * as JSON — the structured sibling of {@link useLocalStorage}.
 *
 *   const [state, setState] = useKVStorage("prefs", { count: 0 });
 *   <Label string={() => "count " + state().count} />        // reactive read
 *   // later, from a button handler:
 *   setState({ count: state().count + 1 });                  // updates + persists
 *
 * On init the stored JSON (if any) is parsed and wins over `initial`; a missing
 * key seeds with `initial`; a corrupt / non-JSON stored value falls back to
 * `initial` WITHOUT throwing. The setter Object.is-skips only a same-REFERENCE
 * write (structured values aren't deep-compared — a new object always
 * persists), otherwise updates the reactive getter and calls
 * `localStorage.setItem(key, JSON.stringify(v))`. On a host with no
 * `localStorage`, it degrades to a plain in-memory signal (see the module
 * header). Values must be JSON-serializable (no functions/cycles).
 *
 * @param key the localStorage key to read/write
 * @param initial the value used when the key is absent or corrupt
 * @returns `[getter, setter]` — call `getter()` to read (reactive), `setter(v)` to write
 */
export function useKVStorage<T>(key: string, initial: T): [() => T, (v: T) => void] {
	// Capture the bare global ONCE (typeof-probe so a webstorage-less host is a
	// clean `undefined`, not a ReferenceError). getItem returns null when absent.
	const ls = typeof localStorage !== "undefined" ? localStorage : undefined;
	const stored = ls ? ls.getItem(key) : null;
	// A non-null stored value is JSON — parse it, but a corrupt/legacy value
	// (not JSON) must fall back to `initial`, never throw.
	let init = initial;
	if (stored !== null) {
		try {
			init = JSON.parse(stored) as T;
		} catch (_e) {
			init = initial;
		}
	}
	const s = signal(init);
	return [
		() => s.value,
		(v: T) => {
			// Object.is, not a deep compare: structured values aren't
			// value-comparable, so this skips ONLY a genuine same-reference no-op
			// (mirrors S.set's NaN-safe gate for the primitive case). A fresh
			// object always persists.
			if (Object.is(v, s.v)) return;
			s.value = v;
			if (ls) ls.setItem(key, JSON.stringify(v));
		},
	];
}
