// createResource suite — the async "fetch → {loading,error,data}" primitive.
// Fetchers here are host promises handed into the vm-sandboxed runtime (the
// runtime never needs a Promise global of its own — it only calls .then on
// what the fetcher returns, exactly like on-device fetch()). Resolution order
// is driven manually through deferreds so the out-of-order guarantees are
// tested deterministically, not by racing timers.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals } = await loadRuntime();
const { createResource, effect } = signals;
const { check, done } = makeChecker("resource");

// a promise with its settle handles exposed
function defer() {
	let resolve!: (v: unknown) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
const tick = () => Promise.resolve(); // flush the shared microtask queue

// --- initial state + success path ---
{
	const d = defer();
	const r = createResource(() => d.promise);
	check("starts loading", r.loading() === true);
	check("data undefined before first success", r.data() === undefined);
	check("no error while loading", r.error() === undefined);
	d.resolve("hello");
	await tick();
	check("data lands after resolve", r.data() === "hello");
	check("loading false after resolve", r.loading() === false);
	check("still no error after success", r.error() === undefined);
}

// --- error path: error() exposes the rejection, data() keeps the old value ---
{
	const d1 = defer();
	const r = createResource(() => d1.promise);
	d1.resolve(42);
	await tick();
	check("first value in", r.data() === 42);
	// refetch into a rejection
	const d2 = defer();
	let call = 0;
	const r2 = createResource(() => {
		call++;
		return call === 1 ? Promise.resolve("ok") : d2.promise;
	});
	await tick();
	check("r2 first fetch ok", r2.data() === "ok");
	r2.refetch();
	check("refetch flips loading", r2.loading() === true);
	const boom = new Error("boom");
	d2.reject(boom);
	await tick();
	check("error() exposes the rejection", r2.error() === boom);
	check("loading false after rejection", r2.loading() === false);
	check("data keeps the last good value through an error", r2.data() === "ok");
	// refetch after an error clears it (back to loading)
	r2.refetch();
	check("refetch after error clears error()", r2.error() === undefined && r2.loading() === true);
}

// --- out-of-order: only the NEWEST call may settle the resource ---
{
	const a = defer(); // first fetch — will resolve LAST (stale)
	const b = defer(); // refetch — resolves first
	let n = 0;
	const r = createResource(() => (++n === 1 ? a.promise : b.promise));
	r.refetch(); // supersedes the first fetch
	b.resolve("new");
	await tick();
	check("newest fetch settles", r.data() === "new" && r.loading() === false);
	a.resolve("old"); // stale resolve arrives after — must be DROPPED
	await tick();
	check("stale resolve is dropped", r.data() === "new");
	check("stale resolve does not flip state", r.loading() === false && r.error() === undefined);
}

// --- out-of-order rejection: a stale REJECT must not surface as error ---
{
	const a = defer();
	const b = defer();
	let n = 0;
	const r = createResource(() => (++n === 1 ? a.promise : b.promise));
	r.refetch();
	b.resolve("fresh");
	await tick();
	a.reject(new Error("stale failure"));
	await tick();
	check("stale rejection is dropped", r.error() === undefined && r.data() === "fresh");
}

// --- reactivity: bindings re-run exactly on transitions ---
{
	const d = defer();
	const r = createResource(() => d.promise);
	const seen: unknown[] = [];
	effect(() => {
		seen.push(r.loading() ? "…" : r.data());
	});
	check("binding sees loading immediately", seen.join(",") === "…");
	d.resolve("done");
	await tick();
	check("binding re-ran to the value", seen.join(",") === "…,done");
}

// --- re-entrant refetch DURING the loading notification: the superseded
// frame's fetcher runs AFTER the newer one, and its SYNC throw must drop
// like a stale rejection (not clobber the newer request's loading state) ---
{
	const d = defer();
	let call = 0;
	let armed = false;
	const r = createResource(() => {
		call++;
		if (call === 1) return Promise.resolve("first");
		if (call === 2) return d.promise; // the re-entrant (NEWEST) refetch
		throw new Error("stale sync boom"); // the superseded outer refetch
	});
	await tick();
	check("re-entrant setup: first value in", r.data() === "first");
	effect(() => {
		if (r.loading() && armed) {
			armed = false;
			r.refetch(); // re-entrant: supersedes the outer frame mid-notification
		}
	});
	armed = true;
	r.refetch(); // outer frame's own fetcher call happens AFTER the re-entrant one
	check(
		"stale sync throw dropped (newest request still loading)",
		r.loading() === true && r.error() === undefined,
	);
	d.resolve("newest");
	await tick();
	check(
		"newest request settles normally after the stale sync throw",
		r.data() === "newest" && r.error() === undefined && r.loading() === false,
	);
}

// --- a fetcher that throws SYNCHRONOUSLY lands in error(), not stuck loading ---
{
	const boom = new Error("sync boom");
	let mode = "throw";
	const r = createResource(() => {
		if (mode === "throw") throw boom; // never returns a promise
		return Promise.resolve("ok");
	});
	check("sync throw surfaces at error()", r.error() === boom);
	check("sync throw is NOT stuck loading", r.loading() === false);
	// refetch after fixing the fetcher recovers
	mode = "ok";
	r.refetch();
	await tick();
	check("refetch after a sync throw recovers", r.error() === undefined && r.data() === "ok");
}

done();
