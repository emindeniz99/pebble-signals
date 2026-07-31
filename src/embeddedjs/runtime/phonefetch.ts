// usePhoneFetch / usePhoneFetchText — FETCH-OVER-MESSAGE: the PHONE performs the
// HTTP request and the watch receives one already-decoded STRING. The opt-in
// `runtime/phonefetch` module. OPT-IN & ZERO-COST: an app that never imports it
// never ships it (the manifest prunes to the import closure — README
// tree-shaking), and it constructs NOTHING at module scope, so it adds nothing
// to the boot floor either.
//
// WHY THIS EXISTS — it is the LOAD-BEARING http path, `runtime/fetch` is not.
// Watch-side `fetch()` already proxies through the phone (@moddable/pebbleproxy,
// handbook gotcha 18), but it materializes Response / Headers / URL objects INSIDE
// the firmware-fixed 32KB arena, and gotcha 18a is the measured receipt that
// this OOMs ("fxAbort memory full") from a signal-runtime app — which is exactly
// why examples/fetchtest.tsx has to be BARE. Over this channel the only thing
// that ever enters the arena is a `{ status, body }` pair built from one inbound
// string, so an ordinary reactive app can do HTTP. `runtime/fetch` / useFetch
// STAYS (relabelled, not deleted — owner decision 2026-07-31) for the
// tiny-payload bare-app case; this module is the one to reach for.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/message/pebble-appmessage.{js,c}) — the SAME
// `pebble/message` channel runtime/message.ts and runtime/config.ts use, so the
// mechanics are the proven ones:
//   * the host `Message` class is reached via `importNow("pebble/message")
//     .default` INSIDE the hook, never at module scope (Rule 1 / gotcha 13: a
//     preloaded module's top-level host construction freezes broken).
//   * `onReadable` is a REGULAR function — the host invokes it with `this` BOUND
//     TO THE CHANNEL (pebble-appmessage.c:379 `xsCallFunction1(..., pm->obj,
//     ...)`), so the inbound dictionary is read as `this.read()`. An arrow's
//     lexical `this` would miss the channel.
//   * `channel.write(map)` maps each STRING key through the channel's key map
//     (pebble-appmessage.c:288, `keys.get(name)`) and THROWS when the outbox is
//     unavailable ("not writable", :266-267) — see ERRORS below.
//
// DEDICATED KEY CODES 10100 / 10101 (and why not the usual array form). The
// host constructor only rewrites an ARRAY of names into codes — `new Map(keys
// .map((v, i) => [v, 10000 + i]))` (pebble-appmessage.js:25-30) — so an array
// ALWAYS claims code 10000, and 10000 is taken: the pkjs bridge forwards the
// settings-page string there and the dev-log tap listens there
// (src/pkjs/index.ts, examples/config.tsx, examples/devlog.tsx). That matters
// because the firmware routes an inbound dictionary entry to the FIRST channel
// whose key map contains that code and to that one only (pebble-appmessage.c
// :454-460) — a phonefetch channel declared the array way would race useConfig
// for every settings payload. A Map is passed through to the native UNCHANGED
// (the `Array.isArray` guard above), and both `read()` (js:35-46) and `match()`
// (js:51-56) consume it as name -> code, so we declare our own private codes:
// 10100 = request (watch -> phone), 10101 = reply (phone -> watch). They sit
// clear of the app array range (10000 + i — an app would need 101 declared keys
// to reach us) and of the fetch proxy's own range (HTTP_BASE = 15000,
// kPKJSReadyMessage = 15025, pebble-appmessage.c:34). DEVICE-RECEIPTED
// (gabbro 2026-07-31, screenshots/fetchdemo-gabbro.png — two live round trips):
// the explicit-Map form routes correctly alongside the live config channel.
//
// PROTOCOL — two one-line strings, so each direction is ONE dictionary entry
// (fewer entries = less AppMessage overhead, and nothing to JSON-parse):
//   watch -> phone, key "req"  (10100):  "<id> <url>"
//   phone -> watch, key "res"  (10101):  "<id> <status> <body>"
// `<id>` is this channel's request counter; `<body>` may contain spaces (only
// the first two are separators). The phone half lives in src/pkjs/index.ts.
//
// SIZE CAP — 1024 chars of body, TRUNCATED LOUD, phone-side. AppMessage is
// small and the exact ceiling is a runtime value, not a constant: the host opens
// the channel with `app_message_inbox_size_maximum()` (pebble-appmessage.c
// :148-149) while the only sizes the SDK GUARANTEES are
// APP_MESSAGE_INBOX_SIZE_MINIMUM 124 (phone -> watch) and
// APP_MESSAGE_OUTBOX_SIZE_MINIMUM 636 (watch -> phone) (pebble.h). So: keep URLs
// short (a URL over the outbox size makes `write` throw, which REJECTS — see
// ERRORS), and expect a body clipped to 1024 chars with a visible
// "...[+<n>B cut]" marker appended by the phone (src/pkjs/index.ts) — never a
// silent truncation (Rule 12). Two honest caveats: the cap counts CHARS, so a
// non-ASCII body can be up to ~3x that in UTF-8 bytes on the wire; and 1024 is a
// pick, not a measurement (Rule 2) — if a firmware's inbox turns out smaller the
// oversized reply is dropped by the firmware, which is why the phone side
// answers a delivery failure with a short status-0 reply instead of leaving the
// request hanging.
//
// ONE PENDING ENTRY PER IN-FLIGHT REQUEST: a `Map<id, resolve>` holds exactly
// one closure per unanswered request and the entry is DELETED the moment its
// reply lands, so nothing accumulates. A reply whose id is unknown (a duplicate,
// or one that outlived its screen) is dropped. No timeout timer — this module
// owns no clock: a request whose reply NEVER arrives stays pending for the life
// of the channel (its Resource stays `loading()`). The pkjs side is what keeps
// that from happening — it caps each request at 15 s and ALWAYS answers — with a status-0 reply on a network
// error, a malformed request, or an undeliverable reply.
//
// ERRORS, never silence (Rule 12): a transport / HTTP failure comes back as
// DATA — `status: 0` with the reason in `body` (a rejected promise would hide
// the reason behind `error()` and lose the status), so `4xx`, `5xx` and "phone
// says the request died" all render through the same two fields. The ONE
// rejection is a request that could not even be SENT: `channel.write` throws
// when the outbox is closed or the URL overflows it, and that request can never
// be answered — so the promise rejects immediately instead of hanging (contrast
// runtime/message.ts's `send`, which swallows a full outbox because a dropped
// log line has no continuation). Note the firmware closes the outbox until the
// previous write is acked (pebble-appmessage.c:325-328), so back-to-back
// requests can reject with "not writable" — loud, and retriable by the caller.
//
// REACTIVITY (Rule 4): usePhoneFetch adds NO signal of its own — it composes
// createResource (runtime/signals) over one request, so a consumer gets the same
// reactive `{ data, loading, error, refetch }` Resource<T> as useFetch, with the
// same URL-thunk contract (the thunk is read inside the fetcher, hence on the
// initial load AND on every refetch — a derived URL refetches to its current
// value). usePhoneFetchText is the imperative half: a plain promise, for a
// button handler that owns its own state.
//
// CLEANUP (Rule 5): the channel is `close()`d via onCleanup when the owning
// screen / root is disposed — no leak on navigate-away. So CALL THESE HOOKS
// INSIDE the render() build / a component body; at module scope onCleanup is a
// no-op and the channel simply lives for the app's life. A promise still pending
// at dispose never settles (its channel is gone) — the same shape as a fetch in
// flight when its screen dies (runtime/fetch header), and its Resource's
// subscribers were disposed with the owner, so nothing observes it.
//
// NOT A SINGLETON (contrast the sensor / battery hooks): a `Message` is
// MULTI-instance by design and the firmware routes by code, so every hook call
// opens its OWN channel with its OWN id counter, pending map and cleanup. Two
// concurrent hooks on the same codes would both `match` 10101 and the FIRST one
// registered would swallow every reply (pebble-appmessage.c:454-460) — so call
// it ONCE per app and pass the returned fetcher / Resource down.
import { createResource, onCleanup, type Resource } from "runtime/signals";

// `importNow` is the bare Pebble compartment global (host/main.js wraps
// Modules.importNow into the app compartment). It is NOT in the runtime-build
// host typings (only the .tsx globals.d.ts declares it), so declare it
// module-locally here — ambient, so it ERASES from the emit, leaving the proven
// bare `importNow("pebble/message")` call (runtime/message.ts, runtime/config.ts).
declare function importNow(specifier: string): unknown;

// The subset of the host `Message` instance this module touches (read / write /
// close). Named to match the LOCAL `MessageChannel` interface in
// runtime/message.ts, runtime/config.ts and examples/config.tsx (Rule 11) —
// this is the host surface, not the hook's return.
interface MessageChannel {
	read(): Map<string, unknown>;
	write(map: Map<string, string | number | boolean>): void;
	close(): void;
}

// The host `Message` class as reached through importNow — a `{ default: ctor }`
// namespace. `keys` is a Map of NAME -> CODE (not the usual string array): see
// the header's "DEDICATED KEY CODES".
type MessageModule = {
	default: new (o: {
		keys: Map<string, number>;
		onReadable: (this: MessageChannel) => void;
	}) => MessageChannel;
};

/**
 * One phone-side HTTP result: the status the phone saw plus the response body as
 * a string. `status` is the HTTP status code (200, 404, …) for a completed
 * request, or **0** when the phone could not complete it at all — a network
 * error, a malformed request line, or a reply the watch could not be given — in
 * which case `body` carries the reason (see the module header, ERRORS). The body
 * is capped at 1024 chars by the phone and, when clipped, ends in a visible
 * `...[+<n>B cut]` marker.
 */
export interface PhoneFetchResult {
	status: number;
	body: string;
}

/**
 * The imperative fetcher {@link usePhoneFetchText} returns: call it with a URL,
 * get a promise of one {@link PhoneFetchResult}. It RESOLVES for every answered
 * request — including HTTP errors and phone-side failures (`status: 0`) — and
 * REJECTS only when the request could not be sent at all (a closed outbox / a
 * URL that overflows it), because such a request can never be answered.
 */
export type FetchText = (url: string) => Promise<PhoneFetchResult>;

/**
 * usePhoneFetchText() — open the fetch-over-message channel and return a plain
 * `fetchText(url)` promise API (the imperative half of this module).
 *
 *   const fetchText = usePhoneFetchText();
 *   // in a button handler:
 *   fetchText("http://example.com/hello").then(
 *     (r) => { setStatus(r.status); setBody(r.body); },
 *     (e) => { setStatus(0); setBody(`send failed: ${e}`); },
 *   );
 *
 * Each call sends `"<id> <url>"` to the phone on AppMessage code 10100 and
 * settles when the reply `"<id> <status> <body>"` comes back on 10101 (the pkjs
 * half is src/pkjs/index.ts). Requests are id-correlated, so several may be in
 * flight, each holding exactly ONE entry in the pending map until its reply
 * lands. HTTP and network failures RESOLVE with `status: 0` and a reason in
 * `body`; only an unsendable request rejects (module header, ERRORS). The watch
 * side runs no timer: it is the phone that bounds a request (15 s) and always
 * answers, so a promise only stays pending if the phone half is missing.
 *
 * The channel is `close()`d on dispose, so CALL THIS INSIDE the render() build /
 * a component body (Rule 5), ONCE per app — a second channel on the same codes
 * would never receive a reply.
 *
 * @returns a {@link FetchText} — `(url) => Promise<`{@link PhoneFetchResult}`>`
 */
export function usePhoneFetchText(): FetchText {
	// importNow INSIDE the hook (Rule 1) — a module-scope host construction would
	// freeze broken in the preload. Inline cast per config.tsx's proven shape.
	const Message = (importNow("pebble/message") as MessageModule).default;
	// ONE entry per in-flight request: id -> its resolve. Deleted on reply.
	const pending = new Map<number, (r: PhoneFetchResult) => void>();
	let next = 0; // per-channel request counter (ids are not global)
	const channel = new Message({
		// name -> CODE map, passed to the native untouched (header: DEDICATED KEYS)
		keys: new Map([
			["req", 10100],
			["res", 10101],
		]),
		// regular function (not arrow): the host binds `this` to the channel, so
		// `this.read()` is the inbound Map (config.tsx). Fires outside any effect.
		onReadable(this: MessageChannel) {
			const line = this.read().get("res");
			// not our reply (a foreign entry matched, or a non-string value): ignore.
			// Inbound data is UNTRUSTED — a malformed line must never crash the watch.
			if (typeof line !== "string") return;
			const sp1 = line.indexOf(" ");
			const sp2 = line.indexOf(" ", sp1 + 1);
			// fewer than two separators = not "<id> <status> <body>". (sp2 < 0 also
			// covers sp1 < 0: with no space at all, the second search starts at 0 and
			// fails too.)
			if (sp2 < 0) return;
			const id = Number(line.slice(0, sp1));
			const settle = pending.get(id);
			// unknown id: a duplicate reply, or one that outlived its request.
			if (!settle) return;
			pending.delete(id);
			settle({ status: Number(line.slice(sp1 + 1, sp2)), body: line.slice(sp2 + 1) });
		},
	});
	// Rule 5 — close with the owning screen / root (no leak on navigate-away).
	onCleanup(() => channel.close());
	return (url) =>
		new Promise((resolve, reject) => {
			const id = ++next;
			try {
				channel.write(new Map([["req", `${id} ${url}`]]));
			} catch (e) {
				// the request never left the watch, so no reply can ever settle it:
				// reject NOW rather than hang (Rule 12), and register no pending entry.
				reject(e);
				return;
			}
			pending.set(id, resolve);
		});
}

/**
 * usePhoneFetch(url) — the REACTIVE half: one phone-side request exposed as a
 * {@link Resource}, the drop-in replacement for `useFetch` on a normal reactive
 * app (module header: WHY THIS EXISTS).
 *
 *   const res = usePhoneFetch("http://127.0.0.1:8787/hello");
 *   <Label string={() =>
 *     res.loading() ? "…" : `${res.data()?.status} ${res.data()?.body}`} />
 *   // on a button: res.refetch();
 *
 *   // a reactive URL — the thunk is re-read on every fetch, so refetch()
 *   // follows the current id:
 *   const res = usePhoneFetch(() => `http://example.com/item/${id()}`);
 *
 * The request runs IMMEDIATELY (createResource's contract), so for a
 * press-to-fetch screen use {@link usePhoneFetchText} instead (that is what
 * examples/fetchdemo.tsx does). `data()` holds `{ status, body }` — an HTTP
 * error or a phone-side failure is DATA (`status: 0` + a reason), so `error()`
 * only ever holds an unsendable request (module header, ERRORS).
 *
 * Opens its own channel and `close()`s it on dispose, so CALL THIS INSIDE the
 * render() build / a component body (Rule 5), ONCE per app.
 *
 * @param url the request URL, or a `() => string` thunk read on EVERY fetch
 *   (initial + each refetch) so a derived URL refetches to its current value.
 * @returns a {@link Resource}`<`{@link PhoneFetchResult}`>` — `{ data, loading,
 *   error, refetch }`
 */
export function usePhoneFetch(url: string | (() => string)): Resource<PhoneFetchResult> {
	const fetchText = usePhoneFetchText();
	// createResource owns loading/error/data + the out-of-order guard; the fetcher
	// is re-run on each refetch(), so the URL thunk is read every time.
	return createResource<PhoneFetchResult>(() => fetchText(typeof url === "function" ? url() : url));
}
