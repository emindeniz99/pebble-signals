// localStorage suite — runtime/localstorage (opt-in persisted reactive string).
// Exercises the useState-shaped tuple: a pre-seeded key winning over `initial`,
// a missing key falling back to `initial`, the setter persisting to the host
// (mock.store) AND driving the reactive getter (an effect re-runs), the
// Object.is skip suppressing a redundant setItem, and the webstorage-less
// fallback (no `localStorage` global) degrading to a pure in-memory signal
// WITHOUT crashing. A mock is injected onto the sandbox BEFORE the module loads
// (per load-runtime's generic loadModule), since the module reads `localStorage`
// as a bare global captured at call time.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("localstorage");

// String-only webstorage mock: getItem returns null for an absent key (W3C
// contract), setItem records into `store`, and `sets` counts writes so the
// Object.is skip is assertable.
function makeMockLS() {
	return {
		store: new Map<string, string>(),
		sets: 0,
		getItem(k: string): string | null {
			return this.store.has(k) ? (this.store.get(k) as string) : null;
		},
		setItem(k: string, v: string): void {
			this.sets++;
			this.store.set(k, v);
		},
	};
}

// --- shared sandbox with an injected mock ---
{
	const { signals, sandbox, loadModule } = await loadRuntime();
	const mock = makeMockLS();
	(sandbox as { localStorage?: unknown }).localStorage = mock;
	const ls = (await loadModule("runtime/localstorage")) as {
		useLocalStorage(key: string, initial: string): [() => string, (v: string) => void];
	};

	// --- a pre-seeded key wins over `initial` ---
	{
		mock.store.set("seeded", "persisted");
		const [get] = ls.useLocalStorage("seeded", "fallback");
		check("stored value wins over initial", get() === "persisted");
	}

	// --- a missing key uses `initial` ---
	{
		const [get] = ls.useLocalStorage("absent", "the-default");
		check("missing key seeds from initial", get() === "the-default");
	}

	// --- setter persists AND drives the reactive getter; unchanged write skips ---
	{
		const [get, set] = ls.useLocalStorage("count", "0");
		let runs = 0;
		let seen = "";
		signals.effect(() => {
			runs++;
			seen = get();
		});
		check("effect runs once on subscribe", runs === 1);
		check("getter initially reads the seed", seen === "0");
		const before = mock.sets;

		set("5");
		check("setter persists to the host store", mock.store.get("count") === "5");
		check("setter calls setItem exactly once", mock.sets === before + 1);
		check("setter re-runs the reactive getter", runs === 2);
		check("getter reflects the new value", seen === "5");

		// unchanged write: Object.is skip — no setItem, no re-run
		set("5");
		check("unchanged write does not persist again", mock.sets === before + 1);
		check("unchanged write does not re-run the effect", runs === 2);
	}
}

// --- webstorage-less fallback: no localStorage global → in-memory, no crash ---
{
	const { loadModule } = await loadRuntime(); // fresh sandbox: NO localStorage set
	const ls = (await loadModule("runtime/localstorage")) as {
		useLocalStorage(key: string, initial: string): [() => string, (v: string) => void];
	};
	const [get, set] = ls.useLocalStorage("k", "mem");
	check("fallback seeds from initial (no host store)", get() === "mem");
	set("changed"); // must not throw despite no localStorage
	check("fallback setter updates the in-memory getter", get() === "changed");
}

done();
