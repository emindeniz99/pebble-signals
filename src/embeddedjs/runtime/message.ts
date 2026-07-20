// useMessage / useAppMessage — a reactive AppMessage channel (watch <-> pkjs <->
// phone), the opt-in `runtime/message` module. OPT-IN & ZERO-COST: an app that
// never imports it never ships it (the manifest prunes to the import closure —
// README tree-shaking), so this module costs non-users nothing; it constructs
// NOTHING at module scope, so it adds nothing to the boot floor either.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/message/pebble-appmessage.{js,c}):
//   * The host `pebble/message` module's default export is a `Message` class,
//     reached via `importNow("pebble/message").default`. It is HOST-PRELOADED
//     (zero manifest cost) — but it MUST be imported INSIDE the hook, never at
//     module scope: a preloaded module's top-level host construction freezes
//     broken (Rule 1 / gotcha 13). So `open()` calls importNow at CALL time.
//   * `new Message({ keys, onReadable })`:
//       - `keys` is an ARRAY of string NAMES; the host constructor maps it to
//         `new Map(keys.map((v, i) => [v, 10000 + i]))` (pebble-appmessage.js
//         :25-29) — so the FIRST key is AppMessage code 10000, the second
//         10001, and so on. Code 10000 is the one the pkjs bridge and the
//         config-page flow use (src/pkjs/index.ts): the config-drive.py driver
//         delivers inbound settings there, and a "spdev:"-marked string sent on
//         it shows up as a `pkjs>` log line (examples/devlog.tsx).
//       - `onReadable` fires on INBOUND traffic; the host invokes it with `this`
//         BOUND TO THE CHANNEL (pebble-appmessage.c:379 `xsCallFunction1(...,
//         pm->obj, ...)`), so the callback reads via `this.read()` — it is a
//         REGULAR function, never an arrow (an arrow's lexical `this` would miss
//         the channel). This is exactly examples/config.tsx's proven shape.
//   * `channel.read()` returns a `Map` whose numeric codes have already been
//     translated back to the string key NAMES (pebble-appmessage.js:35-46), so
//     `this.read().get("config")` works. `channel.write(map)` sends a `Map`
//     (values string | number | boolean). `channel.close()` tears it down.
//
// REACTIVITY (Rule 4): useMessage owns ONE `signal` (runtime/signals); the host
// `onReadable` callback WRITES it with `this.read()`. The callback fires OUTSIDE
// any effect, so a plain signal write is correct (no self-subscribe). Consumers
// read `last()` inside a jsx thunk / effect to subscribe — a fresh Map per
// message always notifies (two Maps are never ===). useAppMessage is the
// callback form: `onReadable` hands `this.read()` to the caller's `handler`
// instead of a signal (no reactive state — the caller owns the side effect).
//
// NOT A SINGLETON (contrast the sensor / battery hooks): a `Message` is
// MULTI-instance by design — config.tsx and devlog.tsx run concurrent channels,
// and the host routes each inbound dictionary to the matching instance by code
// (pebble-appmessage.c `match`). So every useMessage / useAppMessage call opens
// its OWN channel with its OWN cleanup; there is no shared instance, no refcount.
//
// CLEANUP (Rule 5): `open()` registers `onCleanup(() => channel.close())`, so
// the channel closes when the owning screen / root is disposed — no leak on
// navigate-away. The hook MUST therefore be called inside a reactive owner (the
// render() build / a component body); called at module scope, onCleanup is a
// no-op and the channel simply lives for the app's life (the config.tsx pattern).
//
// SEND SAFETY: `send()` wraps `channel.write(...)` in try/catch — a FULL OUTBOX
// must never take the app down (examples/devlog.tsx:24). A dropped send is
// silent by design; the caller sees no throw.
import { onCleanup, signal } from "runtime/signals";

// `importNow` is the bare Pebble compartment global (host/main.js wraps
// Modules.importNow into the app compartment). It is NOT in the runtime-build
// host typings (only the .tsx globals.d.ts declares it), so declare it
// module-locally here — ambient, so it ERASES from the emit, leaving the proven
// bare `importNow("pebble/message")` call (examples/config.tsx). Mirrors
// jsx-runtime.ts's module-local `declare const __SP_CRASH_UI__`.
declare function importNow(specifier: string): unknown;

// The subset of the host `Message` instance this module touches (read / write /
// close). Named to match the LOCAL `MessageChannel` interface in config.tsx and
// devlog.tsx (Rule 11) — this is the host surface, not the hook's return.
interface MessageChannel {
	read(): Map<string, unknown>;
	write(map: Map<string, string | number | boolean>): void;
	close(): void;
}

// Constructor options for `new Message(...)`: the string key NAMES plus the
// inbound callback (a regular function — the host binds `this` to the channel).
interface ChannelInit {
	keys: string[];
	onReadable: (this: MessageChannel) => void;
}

// The host `Message` class as reached through importNow — a `{ default: ctor }`
// namespace. A named alias keeps `open()`'s cast one readable line.
type MessageModule = { default: new (o: ChannelInit) => MessageChannel };

/**
 * A guarded outbound sender — the `send` on {@link Messenger} / {@link
 * AppMessenger}. Serializes `obj` to a `Map` and `channel.write`s it; a throwing
 * write (a full outbox) is SWALLOWED, so a failed send never crashes the app
 * (examples/devlog.tsx). Values must be `string | number | boolean`.
 */
export type MessageSender = (obj: Record<string, string | number | boolean>) => void;

/**
 * What {@link useMessage} returns: a reactive INBOUND `last` plus an outbound
 * `send`.
 */
export interface Messenger {
	/**
	 * The most recently RECEIVED message as a `Map` of key NAME -> value, or
	 * `undefined` before the first inbound message. REACTIVE — read it inside a
	 * jsx thunk / effect (`() => last()?.get("config")`) to repaint on arrival.
	 */
	last: () => Map<string, unknown> | undefined;
	/** Send an outbound message (see {@link MessageSender}). */
	send: MessageSender;
}

/**
 * What {@link useAppMessage} returns: just an outbound `send`. Inbound messages
 * are delivered to the `handler` you passed, NOT surfaced here — hence no `last`
 * (contrast {@link Messenger}).
 */
export interface AppMessenger {
	/** Send an outbound message (see {@link MessageSender}). */
	send: MessageSender;
}

// Shared opener (a `const` arrow — never a top-level `function` / `class`,
// gotcha 13): construct the channel via importNow INSIDE the hook (Rule 1),
// register its cleanup, and return the guarded `send`. Each hook supplies its
// own `onReadable` (a regular function that reads through `this`).
const open = (keys: string[], onReadable: (this: MessageChannel) => void): MessageSender => {
	// importNow INSIDE the hook (Rule 1) — a module-scope host construction would
	// freeze broken in the preload. Inline cast per config.tsx's proven shape.
	const Message = (importNow("pebble/message") as MessageModule).default;
	const channel = new Message({ keys, onReadable });
	// Rule 5 — close with the owning screen / root (no leak on navigate-away).
	onCleanup(() => channel.close());
	return (obj) => {
		try {
			channel.write(new Map(Object.entries(obj)));
		} catch {
			// a full outbox must never take the app down (examples/devlog.tsx:24)
		}
	};
};

/**
 * useMessage(keys) — open a reactive AppMessage channel on the given key NAMES.
 *
 *   const { last, send } = useMessage(["config"]);
 *   <Label string={() => "in: " + String(last()?.get("config") ?? "…")} />
 *   // from a button: send({ config: "spdev: hi from the watch" });
 *
 * The first key is AppMessage code 10000, the second 10001, … (host mapping).
 * Each inbound message writes the reactive `last` signal (read it in a thunk to
 * repaint); `send` serializes an object to a `Map` and writes it, swallowing a
 * throwing write. The channel is `close()`d when the owning screen is disposed,
 * so CALL THIS INSIDE THE render() BUILD / a component body (Rule 5) — at module
 * scope onCleanup is a no-op and the channel lives for the app's life.
 *
 * @param keys the string key NAMES to open on (index -> code 10000 + i)
 * @returns a {@link Messenger} — `{ last, send }`
 */
export function useMessage(keys: string[]): Messenger {
	const s = signal<Map<string, unknown> | undefined>(undefined);
	// regular function (not arrow): the host binds `this` to the channel, so
	// `this.read()` is the inbound Map (config.tsx). The write is outside any
	// effect — a plain signal set is correct (Rule 4).
	const send = open(keys, function (this: MessageChannel) {
		s.value = this.read();
	});
	return { last: () => s.value, send };
}

/**
 * useAppMessage(keys, handler) — the CALLBACK form of {@link useMessage}: every
 * inbound message is passed to `handler` (a `Map` of key NAME -> value) instead
 * of into a reactive signal.
 *
 *   const { send } = useAppMessage(["cmd"], (msg) => runCommand(msg.get("cmd")));
 *
 * Same code mapping (first key -> 10000), same guarded `send`, same dispose-time
 * `close()` (call inside a reactive owner — Rule 5) as useMessage. Use this when
 * inbound traffic should DO something (an imperative side effect) rather than be
 * rendered; use {@link useMessage} when you want to render it.
 *
 * @param keys the string key NAMES to open on (index -> code 10000 + i)
 * @param handler invoked with `this.read()` on every inbound message
 * @returns an {@link AppMessenger} — `{ send }`
 */
export function useAppMessage(
	keys: string[],
	handler: (msg: Map<string, unknown>) => void,
): AppMessenger {
	const send = open(keys, function (this: MessageChannel) {
		handler(this.read());
	});
	return { send };
}
