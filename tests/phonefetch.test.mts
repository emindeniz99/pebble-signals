// phonefetch suite — runtime/phonefetch (fetch-over-message: the phone performs
// the HTTP, the watch gets a string). Proves the CONTRACT the device cannot be
// asked about cheaply: the channel opens on the DEDICATED codes 10100/10101
// (never 10000, which config / dev-log own — a shared code would make the
// firmware route replies to whichever channel registered first); a request goes
// out as "<id> <url>" with a per-channel counter; replies are matched BY ID, so
// a body containing spaces survives intact, an unknown id is dropped and a
// duplicate reply cannot re-settle; junk on the wire (a non-string value, a line
// with fewer than two separators) is ignored rather than crashing the watch on
// untrusted input; an HTTP/network failure RESOLVES as data (status 0 + reason)
// while a request that could not be SENT rejects instead of hanging forever
// (Rule 12); usePhoneFetch composes createResource over exactly one request,
// re-reading a URL thunk on every refetch; and disposing the owning root
// close()s the channel (Rule 5). The host `Message` is absent from the Node
// sandbox, so a StubMessage is injected via `sandbox.importNow` BEFORE
// loadModule — the same idiom message.test / statusbar.test use.
//
// The tail block is the tools/fetch-server.mts receipt: the demo's claim is a
// REAL round trip, so the server that serves it is exercised over real HTTP
// (port 0) rather than trusted.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { loadRuntime, makeChecker } from "./load-runtime.mts";
import { makeServer } from "../tools/fetch-server.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot } = signals;
const { check, done } = makeChecker("phonefetch");

interface Result {
	status: number;
	body: string;
}

// The last-constructed stub, captured by the constructor so the test can deliver
// replies to it and inspect what the hook wrote.
let lastMsg: StubMessage;

// Stub for the host `pebble/message` Message. Mirrors the device: read() returns
// the inbound Map, write() records (or throws, for the closed-outbox path), and
// onReadable is FIRED AS A METHOD so `this` is the channel — exactly the
// xsCallFunction1(..., pm->obj, ...) binding pebble-appmessage.c uses.
class StubMessage {
	// armed BEFORE a hook call, since the hook constructs the channel itself
	static throwNext = false;
	keys: Map<string, number>;
	onReadable: (this: StubMessage) => void;
	writes: Map<string, unknown>[] = [];
	closed = 0;
	throwOnce: boolean;
	inbound = new Map<string, unknown>(); // what read() returns
	constructor(o: { keys: Map<string, number>; onReadable: (this: StubMessage) => void }) {
		this.keys = o.keys;
		this.onReadable = o.onReadable;
		this.throwOnce = StubMessage.throwNext;
		StubMessage.throwNext = false;
		lastMsg = this;
	}
	read(): Map<string, unknown> {
		return this.inbound;
	}
	write(map: Map<string, unknown>): void {
		if (this.throwOnce) {
			this.throwOnce = false;
			throw new Error("not writable");
		}
		this.writes.push(map);
	}
	close(): void {
		this.closed++;
	}
	/** Deliver one inbound value under "res", as the firmware would. */
	reply(value: unknown): void {
		this.inbound = new Map<string, unknown>([["res", value]]);
		this.onReadable();
	}
}

// Inject importNow BEFORE loadModule (message.test's idiom): the hook calls
// importNow("pebble/message") at hook-call time.
(sandbox as { importNow?: unknown }).importNow = (spec: string) => {
	if (spec !== "pebble/message") throw new Error("unexpected importNow spec: " + spec);
	return { default: StubMessage };
};

const { usePhoneFetch, usePhoneFetchText } = (await loadModule("runtime/phonefetch")) as {
	usePhoneFetchText(): (url: string) => Promise<Result>;
	usePhoneFetch(url: string | (() => string)): {
		data: () => Result | undefined;
		loading: () => boolean;
		error: () => unknown;
		refetch: () => void;
	};
};

const tick = () => Promise.resolve(); // flush the shared microtask queue

// --- usePhoneFetchText: codes, request line, id matching, junk, errors ---
{
	const [fetchText, dispose] = createRoot(() => usePhoneFetchText());
	const msg = lastMsg;

	check(
		"channel opened on the DEDICATED codes (req 10100 / res 10101), not 10000",
		msg.keys.get("req") === 10100 && msg.keys.get("res") === 10101,
	);

	let got: Result | undefined;
	fetchText("http://127.0.0.1:8787/hello").then((r) => {
		got = r;
	});
	check(
		'the request went out as "<id> <url>" on the req key',
		msg.writes.length === 1 && msg.writes[0].get("req") === "1 http://127.0.0.1:8787/hello",
	);

	// junk on the wire must not settle anything and must not throw
	msg.reply(7); // a non-string value (a foreign numeric entry matched our codes)
	msg.reply("nospaces"); // no separator at all
	msg.reply("1 200"); // one separator — not "<id> <status> <body>"
	msg.reply("9 200 not yours"); // well-formed but an unknown id
	await tick();
	check("junk and unknown ids leave the request pending", got === undefined);

	// the real reply: body keeps its spaces (only the first two split)
	msg.reply("1 200 hello from http 1");
	await tick();
	check(
		"the reply resolves with status + the FULL body (inner spaces kept)",
		got !== undefined && got.status === 200 && got.body === "hello from http 1",
	);

	// the pending entry is gone: a duplicate reply for a settled id is dropped
	msg.reply("1 500 duplicate");
	await tick();
	check(
		"a duplicate reply for a settled id changes nothing",
		got !== undefined && got.status === 200 && got.body === "hello from http 1",
	);

	// second request: the counter advanced, and an HTTP/network failure is DATA
	let failed: Result | undefined;
	fetchText("http://127.0.0.1:8787/nope").then((r) => {
		failed = r;
	});
	check(
		"the second request carries id 2",
		msg.writes[1].get("req") === "2 http://127.0.0.1:8787/nope",
	);
	msg.reply("2 0 request failed: no response");
	await tick();
	check(
		"a phone-side failure RESOLVES as status 0 + the reason (never silence)",
		failed !== undefined && failed.status === 0 && failed.body === "request failed: no response",
	);

	// an UNSENDABLE request rejects immediately — it can never be answered
	msg.throwOnce = true;
	let rejected: unknown;
	await fetchText("http://127.0.0.1:8787/hello").then(
		() => {},
		(e) => {
			rejected = e;
		},
	);
	check(
		"a throwing write() REJECTS the promise (a dropped request must not hang)",
		String(rejected) === "Error: not writable",
	);
	check("the rejected request recorded no write", msg.writes.length === 2);
	// ...and left no pending entry: its id can never settle anything
	msg.reply("3 200 ghost");
	await tick();

	check("channel not closed before dispose", msg.closed === 0);
	dispose();
	check("disposing the root close()s the channel (Rule 5)", msg.closed === 1);
}

// --- usePhoneFetch: createResource over one request, string URL ---
{
	const [res, dispose] = createRoot(() => usePhoneFetch("http://127.0.0.1:8787/hello"));
	const msg = lastMsg;

	check("the resource starts loading", res.loading() === true);
	check(
		"it sent its request immediately",
		msg.writes[0].get("req") === "1 http://127.0.0.1:8787/hello",
	);
	check("no data before the reply", res.data() === undefined);

	msg.reply("1 200 hello from http 1");
	await tick();
	check(
		"the reply lands in data() as { status, body }",
		res.data()?.status === 200 && res.data()?.body === "hello from http 1",
	);
	check("loading() is false after the reply", res.loading() === false);
	check("error() stays undefined for an answered request", res.error() === undefined);

	dispose();
	check("the reactive form close()s its channel too", msg.closed === 1);
}

// --- usePhoneFetch: a URL THUNK is re-read on every fetch ---
{
	let id = 1;
	const [res, dispose] = createRoot(() => usePhoneFetch(() => `http://127.0.0.1:8787/item/${id}`));
	const msg = lastMsg;
	check(
		"the thunk URL was read for the first request",
		msg.writes[0].get("req") === "1 http://127.0.0.1:8787/item/1",
	);

	id = 2;
	res.refetch();
	check(
		"refetch() re-reads the thunk (the URL follows the current value)",
		msg.writes[1].get("req") === "2 http://127.0.0.1:8787/item/2",
	);
	dispose();
}

// --- usePhoneFetch: an unsendable request surfaces at error() ---
{
	StubMessage.throwNext = true; // the channel the hook is about to build
	const [res, dispose] = createRoot(() => usePhoneFetch("http://127.0.0.1:8787/hello"));
	await tick();
	check(
		"an unsendable request surfaces at error() (not a stuck loading())",
		String(res.error()) === "Error: not writable" && res.loading() === false,
	);
	dispose();
}

done();

// --- the receipt server itself (tools/fetch-server.mts) over real HTTP ---
test("fetch-server: GET /hello counts requests; anything else is 404", async () => {
	const server = makeServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as AddressInfo).port;
	const base = `http://127.0.0.1:${port}`;

	const first = await fetch(`${base}/hello`);
	assert.equal(first.status, 200);
	assert.equal(await first.text(), "hello from http 1");
	// the counter is what makes a second press visibly a second round trip
	assert.equal(await (await fetch(`${base}/hello`)).text(), "hello from http 2");

	const missing = await fetch(`${base}/nope`);
	assert.equal(missing.status, 404);
	assert.equal(await missing.text(), "not found");

	await new Promise<void>((resolve) => server.close(() => resolve()));
});
