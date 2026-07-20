// config suite — runtime/config (opt-in reactive Clay-settings hook). Proves
// useConfig<T>(initial) returns a reactive getter that: seeds from `initial`
// before any message and opens ONE pebble/message channel on key "config";
// seeds from a PERSISTED flash value over `initial` on boot (the kvstore read
// path); MERGES an inbound JSON settings payload over the current value —
// PRESERVING unspecified keys — and NOTIFIES subscribers (reactive) while
// persisting the merged object to flash (the write path); leaves the value
// UNCHANGED on a malformed / non-JSON payload WITHOUT throwing (the try/catch);
// falls back to "{}" when the inbound dictionary carries no "config" entry (the
// `?? "{}"` branch); and CLOSES its channel on dispose (Rule 5 cleanup — no
// leak). Two host surfaces are absent from the Node sandbox and injected BEFORE
// the module loads (per load-runtime's generic loadModule, exactly the idiom
// kvstore.test / tabs.test use): `importNow` -> a StubMessage class (stores the
// onReadable callback so a test can FIRE an inbound message; records close()),
// and `localStorage` -> the string-only webstorage mock kvstore.test uses. Each
// scenario gets a FRESH sandbox (setup()), because useConfig hard-codes the one
// "config" key — a shared store would leak persisted state between scenarios.
// No setInterval is involved (config has no timers), so tick()/liveTimers() are
// not exercised.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { check, done } = makeChecker("config");

// String-only webstorage mock (kvstore layers JSON on top) — identical to
// kvstore.test's: getItem returns null for an absent key (W3C contract), setItem
// records into `store`, `sets` counts writes so persistence is assertable.
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

// Stub for the host `pebble/message` Message class (the "message unit" stub):
// stores the `onReadable` the hook passes so a test can FIRE an inbound message;
// read() returns a Map wrapping the current `payload`; close() records teardown;
// the constructor captures `keys` and registers the instance so the test can
// reach it. `fire(payload)` sets the next inbound value then invokes onReadable
// with `this` bound to the channel (the host's xsCallFunction1(..., pm->obj)).
interface StubOpts {
	keys: string[];
	onReadable: (this: StubMessage) => void;
}
class StubMessage {
	keys: string[];
	onReadable: (this: StubMessage) => void;
	closed = false;
	payload: unknown = "{}";
	static instances: StubMessage[] = [];
	constructor(opts: StubOpts) {
		this.keys = opts.keys;
		this.onReadable = opts.onReadable;
		StubMessage.instances.push(this);
	}
	read(): Map<string, unknown> {
		return new Map<string, unknown>([["config", this.payload]]);
	}
	close(): void {
		this.closed = true;
	}
	fire(payload: unknown): void {
		this.payload = payload;
		this.onReadable.call(this);
	}
}

type ConfigModule = { useConfig<T extends object>(initial: T): () => T };

// Fresh sandbox per scenario with BOTH host surfaces injected BEFORE the module
// loads, optionally pre-seeding the "config" flash key. `signals` + `useConfig`
// come back for the createRoot/effect assertions; `mock` for the persistence
// assertions. StubMessage.instances is reset so instances[0] is THIS scenario's.
async function setup(seed?: string): Promise<{
	signals: typeof import("../src/embeddedjs/runtime/signals");
	mock: ReturnType<typeof makeMockLS>;
	useConfig: ConfigModule["useConfig"];
}> {
	StubMessage.instances = [];
	const { signals, sandbox, loadModule } = await loadRuntime();
	const mock = makeMockLS();
	if (seed !== undefined) mock.store.set("config", seed);
	(sandbox as { localStorage?: unknown }).localStorage = mock;
	(sandbox as { importNow?: unknown }).importNow = (spec: string) => {
		if (spec !== "pebble/message") throw new Error("unexpected importNow spec: " + spec);
		return { default: StubMessage };
	};
	const cfg = (await loadModule("runtime/config")) as ConfigModule;
	return { signals, mock, useConfig: cfg.useConfig };
}

// --- returns `initial` before any message; ONE channel on key "config"; cleanup ---
{
	const { signals, useConfig } = await setup();
	const initial = { text: "none", invert: 0 };
	const [get, dispose] = signals.createRoot(() => useConfig(initial));
	check("useConfig returns initial before any message", get() === initial);
	check("opens exactly one message channel", StubMessage.instances.length === 1);
	check("channel declares the 'config' key first", StubMessage.instances[0].keys[0] === "config");
	// Rule 5 cleanup: the channel is open until the owning root is disposed
	check("channel is open before dispose", StubMessage.instances[0].closed === false);
	dispose();
	check("disposing the root closes the channel", StubMessage.instances[0].closed === true);
}

// --- seeds from a PERSISTED flash value over `initial` (kvstore read path) ---
{
	const { signals, useConfig } = await setup(JSON.stringify({ text: "flash", invert: 1 }));
	const [get] = signals.createRoot(() => useConfig({ text: "none", invert: 0 }));
	const v = get();
	check("seeds from the persisted flash value, not initial", v.text === "flash" && v.invert === 1);
}

// --- inbound JSON MERGES over current + NOTIFIES + PERSISTS (the happy path) ---
{
	const { signals, mock, useConfig } = await setup();
	const initial = { text: "none", invert: 0, keepme: "yes" };
	const [get] = signals.createRoot(() => useConfig(initial));
	let runs = 0;
	let seenText = "";
	signals.effect(() => {
		runs++;
		seenText = get().text;
	});
	check("effect runs once on subscribe", runs === 1);
	check("getter initially reads the seed", seenText === "none");
	const setsBefore = mock.sets;

	// a PARTIAL inbound payload (text + invert only; keepme omitted)
	StubMessage.instances[0].fire(JSON.stringify({ text: "hi", invert: 1 }));

	check("inbound keys override the current value", get().text === "hi" && get().invert === 1);
	check("unspecified keys are preserved (merge, not replace)", get().keepme === "yes");
	check("inbound message re-runs the subscribed effect (reactive)", runs === 2);
	check("the effect saw the merged text", seenText === "hi");
	// persistence: the merged object is written back to flash as JSON, exactly once
	check("inbound config persists to flash", mock.sets === setsBefore + 1);
	const persisted = JSON.parse(mock.store.get("config") as string) as {
		text: string;
		invert: number;
		keepme: string;
	};
	check(
		"the persisted flash value is the merged object",
		persisted.text === "hi" && persisted.invert === 1 && persisted.keepme === "yes",
	);
}

// --- malformed / non-JSON payload leaves the value UNCHANGED, no throw ---
{
	const { signals, mock, useConfig } = await setup();
	const initial = { text: "keep", invert: 0 };
	const [get] = signals.createRoot(() => useConfig(initial));
	let runs = 0;
	signals.effect(() => {
		runs++;
		get();
	});
	const setsBefore = mock.sets;
	// a truncated / non-JSON payload: JSON.parse throws, the hook's try/catch
	// swallows it — this fire() call RETURNING at all proves no throw escaped.
	StubMessage.instances[0].fire("not json {{{");
	check("malformed payload leaves the value unchanged", get() === initial);
	check("malformed payload does not re-run the effect", runs === 1);
	check("malformed payload does not persist", mock.sets === setsBefore);
}

// --- inbound dictionary with NO "config" entry falls back to "{}" (?? branch) ---
{
	const { signals, mock, useConfig } = await setup();
	const initial = { text: "keep", invert: 3 };
	const [get] = signals.createRoot(() => useConfig(initial));
	const setsBefore = mock.sets;
	// payload undefined -> read().get("config") is undefined -> `?? "{}"` ->
	// JSON.parse("{}") -> {} -> the empty merge preserves every value
	StubMessage.instances[0].fire(undefined);
	check("absent 'config' entry preserves all values", get().text === "keep" && get().invert === 3);
	// the empty merge is still a FRESH object, so kvstore persists it (no deep compare)
	check("empty merge still writes through (fresh object)", mock.sets === setsBefore + 1);
}

done();
