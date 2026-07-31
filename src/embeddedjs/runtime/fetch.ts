// useFetch() — a reactive HTTP fetch hook, the opt-in `runtime/fetch` module
// (the React-Query / RN "useFetch" analog for Pebble). It is a THIN composition
// over the shipped createResource (runtime/signals): the fetcher reads the URL,
// calls the host `fetch` global, and resolves through a `parse` step, so a
// consumer gets the same reactive `{ data, loading, error, refetch }` Resource<T>
// with an HTTP body already wired in. OPT-IN & ZERO-COST: an app that never
// imports it never ships it (the manifest prunes to the import closure — README
// tree-shaking); it constructs NOTHING at module scope, so it adds nothing to the
// boot floor either.
//
// ============================ DEVICE-GATED — READ ============================
// watch-side `fetch` is NOT free. It proxies through the phone
// (@moddable/pebbleproxy — the PKJS bridge; handbook gotcha 18) and its Response /
// Headers allocations are HEAVY for the firmware-fixed 32KB arena. handbook gotcha
// 18a is the measured receipt: a `fetch()` from a signal-RUNTIME app OOMs the
// arena ("fxAbort memory full") because the reactive graph + JSX tree + a live
// Response together exceed 32KB — which is exactly why examples/fetchtest.tsx is
// BARE (no runtime at all: fetch gets the whole arena).
//
// useFetch is, by construction, the risky combination: pulling it in pulls in
// signals/createResource. So it works ONLY inside a LEAN app — one resource, a
// handful of signals, a short JSX tree — where the headroom for one transient
// Response still exists. For anything non-trivial, USE `runtime/phonefetch`
// INSTEAD: usePhoneFetch / usePhoneFetchText are FETCH-OVER-MESSAGE shipped as a
// first-class API — the XHR runs PHONE-SIDE in pkjs (src/pkjs/index.ts), the
// decoded result crosses back as ONE string AppMessage, and createResource is
// fed from that, so no Response object is ever allocated in the 32KB arena.
// usePhoneFetch takes the same `url` (string or thunk) and returns the same
// Resource<T> shape as useFetch, so the swap is a one-line import change.
// Treat useFetch as the convenient path for tiny payloads on a minimal screen,
// and runtime/phonefetch as the load-bearing one. useFetch STAYS (owner
// decision, 2026-07-31: relabelled, never deleted) — the caveat is a usage
// constraint, not a code bug.
// ============================================================================
//
// SUBSTRATE: `fetch` is the bare Pebble/Moddable host global (typed in
// types/moddable/pebble/global.d.ts as `typeof import('fetch').fetch`), referenced
// DIRECTLY — no import, no importNow (contrast the sensor / message hooks). Note
// the ambient "fetch" module is NOT loaded into the runtime-build typings, so in
// THIS module `fetch` resolves to `any` (the same reason message.ts declares
// `importNow` module-locally); we name the Response surface we hand to `parse`
// with the local {@link FetchResponse} interface below (a TYPE — it erases at
// emit, so gotcha 13's top-level-declaration budget does not apply) and cast the
// one call site. On device `fetch(url)` returns a real `Promise<Response>`.
//
// REACTIVITY (Rule 4): all of it is createResource's — useFetch adds no signal of
// its own. The fetcher it hands to createResource is `() => fetch(u).then(parse)`;
// createResource seeds `loading`, flips to `data` on resolve / `error` on reject,
// and drops out-of-order settlements by generation. Consumers read the returned
// thunks (`res.loading()`, `res.data()`, `res.error()`) inside a Label binding /
// effect to repaint on each transition.
//
// URL AS A THUNK: `url` may be a string OR a `() => string`. The thunk is read
// INSIDE the fetcher, so it is re-evaluated on EVERY fetch — the initial load and
// every refetch() — letting a derived/stateful URL (a page cursor, a selected id)
// refetch to its CURRENT value without rebuilding the hook. A plain string is read
// once per fetch all the same.
//
// NO onCleanup (contrast clock / connection / message — and this is deliberate,
// not an omission): those hooks hold a host EVENT SUBSCRIPTION that must be
// removeEventListener'd (Rule 5). `fetch` is a ONE-SHOT promise, not a
// subscription — there is nothing to tear down. If the owning screen is disposed
// while a request is in flight, the promise still settles later, but into signals
// that now have NO subscribers (the bound effects were disposed with the owner),
// so the write is a silent no-op and the resource is GC'd once the consumer drops
// it; createResource's generation guard already discards stale settlements. Rule 5
// is therefore satisfied vacuously — no subscription exists to leak.
import { createResource, type Resource } from "runtime/signals";

/**
 * The subset of the host `fetch` {@link https://developer.repebble.com Response}
 * that a {@link useFetch} `parse` callback reads — a faithful view of the shipped
 * `@moddable/fetch` `Response` (json / text / arrayBuffer + the status metadata),
 * minus `headers` (which needs the host `Headers` type, not loaded in these
 * typings — cast if you need it). Declared locally because the ambient "fetch"
 * module is absent from the runtime-build typings, so the `fetch` global resolves
 * to `any` here; this is a TYPE only and erases at emit.
 */
export interface FetchResponse {
	/** Parse the body as JSON — the DEFAULT {@link useFetch} parser. */
	json(): Promise<unknown>;
	/** Read the body as a UTF-8 string. */
	text(): Promise<string>;
	/** Read the body as raw bytes. */
	arrayBuffer(): Promise<ArrayBuffer>;
	/** True for a 2xx status. */
	readonly ok: boolean;
	/** HTTP status code (e.g. 200, 404). */
	readonly status: number;
	/** HTTP status text (e.g. "OK"). */
	readonly statusText: string;
}

/**
 * Reactive HTTP fetch — composes {@link createResource} over the host `fetch`
 * global. Runs a request NOW and exposes it as a reactive {@link Resource}
 * (`{ data, loading, error, refetch }`); read the thunks inside a Label binding to
 * repaint on each transition.
 *
 *   const res = useFetch<{ value: string }>("https://api.example.com/thing.json");
 *   <Label string={() =>
 *     res.loading() ? "…" : res.error() ? "err" : String(res.data()?.value)} />
 *   // on a button: res.refetch();
 *
 *   // a reactive URL — the thunk is re-read on every fetch, so refetch()
 *   // follows the current id:
 *   const res = useFetch(() => `https://api.example.com/item/${id()}`);
 *
 *   // a custom decoder (e.g. plain text instead of JSON):
 *   const res = useFetch("https://example.com/name.txt", { parse: (r) => r.text() });
 *
 * DEVICE-GATED (see the module header, handbook gotcha 18a): `fetch` proxies
 * through the phone and its Response allocations are heavy for the 32KB arena —
 * keep a useFetch app LEAN, or use `runtime/phonefetch`'s usePhoneFetch (the
 * shipped fetch-over-message API: same `url` contract, same Resource shape, no
 * Response in the arena) for anything non-trivial.
 *
 * @typeParam T the parsed value type (`res.data()` is `T | undefined`).
 * @param url the request URL, or a `() => string` thunk read on EVERY fetch
 *   (initial + each refetch) so a derived URL refetches to its current value.
 * @param opts `parse` overrides how the `Response` becomes `T` — it defaults to
 *   `(r) => r.json()`. Return a `Promise<T>`; a throw / rejection surfaces at
 *   `res.error()`.
 * @returns a {@link Resource}`<T>` — `{ data, loading, error, refetch }`.
 */
export function useFetch<T>(
	url: string | (() => string),
	opts?: { parse?: (r: FetchResponse) => Promise<T> },
): Resource<T> {
	// default decoder is JSON (RN/fetch convention); a custom `parse` replaces it.
	const parse = opts?.parse ?? ((r: FetchResponse) => r.json() as Promise<T>);
	// createResource owns loading/error/data + the out-of-order guard; the fetcher
	// is re-run on each refetch(), so the URL thunk is read every time.
	return createResource<T>(() => {
		const u = typeof url === "function" ? url() : url;
		// `fetch` is the bare host global (resolves to `any` in these typings — see
		// the header); cast its Promise<Response> so `parse` is type-checked. A
		// rejecting fetch skips `parse` and propagates to createResource's error().
		return (fetch(u) as Promise<FetchResponse>).then(parse);
	});
}
