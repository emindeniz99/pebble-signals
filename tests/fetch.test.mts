// fetch suite — runtime/fetch (opt-in reactive HTTP fetch over createResource).
// Proves: useFetch composes createResource so a request seeds `loading` and flips
// to `data` on resolve (a SUBSCRIBING effect re-runs — reactivity, not just a
// re-read); a REJECTING fetch surfaces at error() with data() left undefined; the
// DEFAULT parser decodes JSON (`r.json()`) while a CUSTOM `parse` replaces it
// (proven by making json() reject and reading text() instead); a `() => string`
// URL thunk is read on EVERY fetch (initial AND refetch), so refetch() follows the
// current URL; and refetch() re-runs the fetcher into fresh data. Every branch of
// the compiled fetch.js — the `typeof url === "function"` ternary (string vs
// thunk), the `opts?.parse` optional chain (absent vs present), and the `??`
// default (default vs custom parse) — plus every function (useFetch, the default
// parse arrow, the fetcher arrow) is exercised for 100% line/branch/function
// coverage.
//
// The vm sandbox has NO `fetch`, so — exactly as connection.test injects
// sandbox.watch and message.test injects sandbox.importNow BEFORE loadModule — we
// inject sandbox.fetch: a stub returning a Response-like `{ json, text }`. fetch.ts
// reads the `fetch` global at fetcher-CALL time (like connection.ts reads `watch`),
// so each block reassigns sandbox.fetch before building its root — and before a
// refetch — to drive what the next request returns. Resolution is driven by
// draining the shared microtask queue (settle()), mirroring resource.test; no
// timers, so no tick()/liveTimers() are needed.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot, effect } = signals;
const { check, done } = makeChecker("fetch");

// Flush the shared microtask queue enough turns for useFetch's promise chain
// (fetch -> parse -> createResource's onFulfilled — a few thenables deeper than
// resource.test's single-level fetchers) to settle. One turn is not enough;
// several are, and extra turns are no-ops once settled.
const settle = async (): Promise<void> => {
	for (let i = 0; i < 8; i++) await Promise.resolve();
};

// Inject a default `fetch` BEFORE loadModule (the connection/message idiom). Each
// block overwrites it; nothing in fetch.ts touches `fetch` at module scope, so
// this initial value is only a placeholder for the global to resolve.
sandbox.fetch = () =>
	Promise.resolve({ json: () => Promise.resolve(null), text: () => Promise.resolve("") });

const { useFetch } = await loadModule("runtime/fetch");

// --- loading -> data: default JSON parse, string url, reactive on resolve ---
{
	const payload = { value: "hello" };
	const seen: unknown[] = [];
	let fetchedUrl: string | undefined;
	// text() returns a decoy: if the DEFAULT parser wrongly used it, data() would
	// be the string, not `payload` — so the identity check below pins json() usage.
	sandbox.fetch = (u: string) => {
		fetchedUrl = u;
		return Promise.resolve({
			json: () => Promise.resolve(payload),
			text: () => Promise.resolve("TEXT-decoy"),
		});
	};
	const [res, dispose] = createRoot(() => {
		const r = useFetch("https://api/thing.json");
		effect(() => {
			// subscribe to BOTH transitions so a re-run proves reactivity
			seen.push(r.loading() ? "…" : r.data());
		});
		return r;
	});
	check("starts loading before the fetch settles", res.loading() === true);
	check("data() undefined before the first success", res.data() === undefined);
	check("no error while loading", res.error() === undefined);
	check("the subscribing binding saw loading immediately", seen.length === 1 && seen[0] === "…");
	await settle();
	check("default parse decodes JSON (r.json()) into data()", res.data() === payload);
	check("loading() false after the resolve", res.loading() === false);
	check("still no error after success", res.error() === undefined);
	check("fetch received the string url directly", fetchedUrl === "https://api/thing.json");
	check(
		"the binding re-ran exactly once on the loading->data transition (reactive)",
		seen.length === 2 && seen[1] === payload,
	);
	dispose();
}

// --- a rejecting fetch surfaces at error(); data() stays undefined ---
{
	const boom = new Error("network down");
	sandbox.fetch = () => Promise.reject(boom);
	const [res, dispose] = createRoot(() => useFetch("https://api/thing.json"));
	check("a rejecting fetch still starts in loading", res.loading() === true);
	await settle();
	check("error() exposes the rejection value", res.error() === boom);
	check("loading() false after the rejection", res.loading() === false);
	check("data() stays undefined through an error", res.data() === undefined);
	dispose();
}

// --- a thunk url is read on EACH fetch; refetch() re-runs into fresh data ---
{
	let urlReads = 0;
	let which = 1;
	const fetched: string[] = [];
	const url = (): string => {
		urlReads++;
		return "https://api/item/" + which;
	};
	// tie the resolved value to the url actually fetched, so data() proves the
	// thunk's current value reached fetch()
	sandbox.fetch = (u: string) => {
		fetched.push(u);
		return Promise.resolve({
			json: () => Promise.resolve("data:" + u),
			text: () => Promise.resolve(""),
		});
	};
	const [res, dispose] = createRoot(() => useFetch(url));
	await settle();
	check("a thunk url is read once for the initial fetch", urlReads === 1);
	check("fetch received the thunk's resolved url", fetched[0] === "https://api/item/1");
	check("initial data() reflects the fetched url", res.data() === "data:https://api/item/1");
	// move the url source, then refetch: the thunk MUST be read again
	which = 2;
	res.refetch();
	check("refetch() flips back to loading", res.loading() === true);
	await settle();
	check("the thunk url is re-read on refetch (read each fetch)", urlReads === 2);
	check("fetch received the NEW url on refetch", fetched[1] === "https://api/item/2");
	check(
		"refetch() re-ran; data() updated to the new url's value",
		res.data() === "data:https://api/item/2",
	);
	dispose();
}

// --- a custom `parse` replaces the default json() decoder ---
{
	// json() REJECTS: if the default parser were used, error() would be set — so a
	// clean text() result proves the custom parse ran instead.
	sandbox.fetch = () =>
		Promise.resolve({
			json: () => Promise.reject(new Error("json() must not be called by a text parser")),
			text: () => Promise.resolve("PLAIN-TEXT-BODY"),
		});
	const [res, dispose] = createRoot(() =>
		useFetch("https://example.com/name.txt", {
			parse: (r: { text: () => Promise<string> }) => r.text(),
		}),
	);
	await settle();
	check("a custom parse is used instead of the default json()", res.data() === "PLAIN-TEXT-BODY");
	check("custom-parse fetch settled without error", res.error() === undefined);
	check("custom-parse fetch is done loading", res.loading() === false);
	dispose();
}

done();
