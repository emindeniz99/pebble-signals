// kvstore suite — runtime/kvstore (opt-in JSON-persisted reactive store, the
// structured sibling of runtime/localstorage). Exercises the useState-shaped
// tuple over STRUCTURED values: a pre-seeded JSON key parsing + winning over
// `initial`, a missing key falling back to `initial`, a CORRUPT (non-JSON)
// stored value falling back to `initial` WITHOUT throwing, the setter
// persisting JSON.stringify(v) to the host (mock.store) AND driving the
// reactive getter (an effect re-runs), the same-REFERENCE Object.is skip
// suppressing a redundant setItem (structured values are NOT deep-compared —
// a fresh object always persists), and the webstorage-less fallback (no
// `localStorage` global) degrading to a pure in-memory signal WITHOUT crashing.
// A mock is injected onto the sandbox BEFORE the module loads (per
// load-runtime's generic loadModule), since the module reads `localStorage` as
// a bare global captured at call time.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("kvstore");

// String-only webstorage mock (JSON is layered on top by the module under
// test): getItem returns null for an absent key (W3C contract), setItem records
// into `store`, and `sets` counts writes so the same-reference skip is
// assertable.
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
	const kv = (await loadModule("runtime/kvstore")) as {
		useKVStorage<T>(key: string, initial: T): [() => T, (v: T) => void];
	};

	// --- a pre-seeded JSON key parses AND wins over `initial` ---
	{
		mock.store.set("seeded", JSON.stringify({ n: 42, tags: ["a", "b"] }));
		const [get] = kv.useKVStorage("seeded", { n: 0, tags: [] as string[] });
		const v = get();
		check("stored JSON parses to a structured value", v.n === 42);
		check("stored array round-trips", v.tags.length === 2 && v.tags[1] === "b");
	}

	// --- a missing key uses `initial` (by reference) ---
	{
		const initial = { count: 7 };
		const [get] = kv.useKVStorage("absent", initial);
		check("missing key seeds from initial", get() === initial);
	}

	// --- a CORRUPT (non-JSON) stored value falls back to initial, no throw ---
	{
		mock.store.set("corrupt", "not json {{{"); // e.g. a legacy string value
		const initial = { ok: true };
		const [get] = kv.useKVStorage("corrupt", initial);
		check("corrupt stored value falls back to initial", get() === initial);
	}

	// --- setter persists JSON.stringify AND drives the reactive getter ---
	{
		const [get, set] = kv.useKVStorage<{ count: number }>("state", { count: 0 });
		let runs = 0;
		let seen = -1;
		signals.effect(() => {
			runs++;
			seen = get().count;
		});
		check("effect runs once on subscribe", runs === 1);
		check("getter initially reads the seed", seen === 0);
		const before = mock.sets;

		const next = { count: 5 };
		set(next);
		check(
			"setter persists JSON.stringify to the host store",
			mock.store.get("state") === '{"count":5}',
		);
		check("setter calls setItem exactly once", mock.sets === before + 1);
		check("setter re-runs the reactive getter", runs === 2);
		check("getter reflects the new value", seen === 5);

		// same-REFERENCE write: Object.is skip — no setItem, no re-run
		set(next);
		check("same-reference write does not persist again", mock.sets === before + 1);
		check("same-reference write does not re-run the effect", runs === 2);

		// a FRESH object with equal contents DOES persist (no deep compare)
		set({ count: 5 });
		check("a fresh equal object still persists (no deep compare)", mock.sets === before + 2);
	}
}

// --- webstorage-less fallback: no localStorage global → in-memory, no crash ---
{
	const { loadModule } = await loadRuntime(); // fresh sandbox: NO localStorage set
	const kv = (await loadModule("runtime/kvstore")) as {
		useKVStorage<T>(key: string, initial: T): [() => T, (v: T) => void];
	};
	const initial = { mem: true };
	const [get, set] = kv.useKVStorage("k", initial);
	check("fallback seeds from initial (no host store)", get() === initial);
	const changed = { mem: false };
	set(changed); // must not throw despite no localStorage
	check("fallback setter updates the in-memory getter", get() === changed);
}

done();
