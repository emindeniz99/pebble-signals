// message suite — runtime/message (opt-in reactive AppMessage channel: watch
// <-> pkjs <-> phone). Proves: useMessage opens a channel on the given key
// NAMES; `last` is undefined until an inbound message arrives; firing the host's
// stored `onReadable` (with `this` = the channel, as the device binds it) writes
// `last` reactively (a subscribed effect re-runs) and surfaces the value under
// its key; a second inbound Map notifies again (fresh Map, never ===); `send`
// serializes an object to the Map the host `write` receives; a THROWING write
// (full outbox) is swallowed — send never crashes the app; disposing the owning
// root `close()`s the channel AND tears down the reactive effect (Rule 5); and
// useAppMessage routes inbound to the handler instead of a signal, with the same
// send + close. The host `Message` is absent from the Node sandbox, so a
// StubMessage is injected via `sandbox.importNow` BEFORE loadModule — the same
// idiom statusbar.test uses for Style / Skin.
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, sandbox, loadModule } = await loadRuntime();
const { createRoot, effect } = signals;
const { check, done } = makeChecker("message");

// The last-constructed stub, captured by the constructor so the test can fire
// its onReadable and drive its read() / write() behavior.
let lastMsg: StubMessage;

// Stub for the host `pebble/message` Message: stores the onReadable callback
// (the test FIRES it as a method — `this` is the stub, mirroring the device's
// xsCallFunction1(..., pm->obj)), returns a test-set Map from read(), records
// write() Maps, counts close(), and can throw ONCE from write() to exercise
// send()'s try/catch.
class StubMessage {
	keys: string[];
	onReadable: (this: StubMessage) => void;
	reads = 0;
	writes: Map<string, unknown>[] = [];
	closed = 0;
	inbound = new Map<string, unknown>(); // what read() returns
	throwOnce = false;
	constructor(o: { keys: string[]; onReadable: (this: StubMessage) => void }) {
		this.keys = o.keys;
		this.onReadable = o.onReadable;
		lastMsg = this;
	}
	read(): Map<string, unknown> {
		this.reads++;
		return this.inbound;
	}
	write(map: Map<string, unknown>): void {
		if (this.throwOnce) {
			this.throwOnce = false;
			throw new Error("outbox full");
		}
		this.writes.push(map);
	}
	close(): void {
		this.closed++;
	}
}

// Inject importNow BEFORE loadModule (statusbar.test's Style / Skin idiom): the
// module's `open()` calls importNow("pebble/message") at hook-call time.
(sandbox as { importNow?: unknown }).importNow = (spec: string) => {
	if (spec !== "pebble/message") throw new Error("unexpected importNow spec: " + spec);
	return { default: StubMessage };
};

const { useMessage, useAppMessage } = (await loadModule("runtime/message")) as {
	useMessage(keys: string[]): {
		last: () => Map<string, unknown> | undefined;
		send: (obj: Record<string, string | number | boolean>) => void;
	};
	useAppMessage(
		keys: string[],
		handler: (msg: Map<string, unknown>) => void,
	): { send: (obj: Record<string, string | number | boolean>) => void };
};

// --- useMessage: open, reactive inbound, send, guarded send, cleanup ---
{
	let runs = 0;
	let seen: Map<string, unknown> | undefined = new Map(); // sentinel != undefined
	const [api, dispose] = createRoot(() => {
		const m = useMessage(["config", "reply"]);
		effect(() => {
			runs++;
			seen = m.last();
		});
		return m;
	});
	const msg = lastMsg;

	check(
		"channel opened on the given key NAMES",
		msg.keys[0] === "config" && msg.keys[1] === "reply",
	);
	check("last() is undefined before any inbound message", api.last() === undefined);
	check("subscribed effect ran once and saw undefined", runs === 1 && seen === undefined);

	// simulate an inbound message: set read()'s return, then fire onReadable as
	// the device does (this = the channel).
	msg.inbound = new Map<string, unknown>([["config", "hi there"]]);
	msg.onReadable();
	check("last() reflects the inbound Map after onReadable", api.last() === msg.inbound);
	check("the inbound value is readable under its key", api.last()?.get("config") === "hi there");
	check("onReadable read the inbound via this.read()", msg.reads === 1);
	check(
		"the inbound message re-ran the subscribed effect (reactive)",
		runs === 2 && seen === msg.inbound,
	);

	// a second inbound message (a fresh Map) notifies again (two Maps never ===)
	msg.inbound = new Map<string, unknown>([["config", "again"]]);
	msg.onReadable();
	check("a second inbound message updates last()", api.last()?.get("config") === "again");
	check("the second inbound re-ran the effect again", runs === 3);

	// send serializes the object to the Map the host write() receives
	api.send({ reply: "spdev: pong", n: 7, ok: true });
	check("send() called write() once", msg.writes.length === 1);
	check(
		"send() serialized the object to a Map (string / number / boolean values)",
		msg.writes[0].get("reply") === "spdev: pong" &&
			msg.writes[0].get("n") === 7 &&
			msg.writes[0].get("ok") === true,
	);

	// a THROWING write (full outbox) is swallowed — no crash, nothing recorded
	msg.throwOnce = true;
	api.send({ reply: "dropped" });
	check("a throwing write() is swallowed by send() (throwOnce consumed)", msg.throwOnce === false);
	check("the dropped send recorded no write", msg.writes.length === 1);

	// disposing the owning root closes the channel (Rule 5)
	check("channel not closed before dispose", msg.closed === 0);
	dispose();
	check("disposing the root close()s the channel", msg.closed === 1);
	// the reactive effect is torn down too: firing onReadable must NOT re-run it
	const runsAtDispose = runs;
	msg.inbound = new Map<string, unknown>([["config", "post-dispose"]]);
	msg.onReadable();
	check("disposing the root tore down the reactive effect", runs === runsAtDispose);
}

// --- useAppMessage: inbound routes to the handler, same send + cleanup ---
{
	const received: Map<string, unknown>[] = [];
	const [api, dispose] = createRoot(() =>
		useAppMessage(["cmd"], (m) => {
			received.push(m);
		}),
	);
	const msg = lastMsg;

	check("the callback-form return exposes send", typeof api.send === "function");
	check(
		"the callback-form return has no reactive last",
		(api as { last?: unknown }).last === undefined,
	);

	// inbound goes to the handler, NOT a signal
	msg.inbound = new Map<string, unknown>([["cmd", "start"]]);
	msg.onReadable();
	check("inbound routed to the handler", received.length === 1 && received[0] === msg.inbound);
	check("the handler received the read() Map with its value", received[0].get("cmd") === "start");

	// same guarded send
	api.send({ cmd: "ack" });
	check(
		"the callback-form send() writes too",
		msg.writes.length === 1 && msg.writes[0].get("cmd") === "ack",
	);
	msg.throwOnce = true;
	api.send({ cmd: "x" });
	check("the callback-form send() also swallows a throwing write", msg.writes.length === 1);

	// same dispose-time close
	dispose();
	check("the callback-form disposes close() too", msg.closed === 1);
}

done();
