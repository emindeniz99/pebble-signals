// useConfig — a reactive, PERSISTED Clay-settings store, the opt-in
// `runtime/config` module. It reduces the whole settings ROUND-TRIP (a hosted /
// Clay settings PAGE -> pkjs -> the watch) to ONE reactive getter: the current
// config object, seeded from flash on boot, updated LIVE when the wearer saves
// new settings, and persisted so the next boot starts where the last left off.
// OPT-IN & ZERO-COST: an app that never imports it never ships it (the manifest
// prunes to the import closure — README tree-shaking), and it constructs NOTHING
// at module scope, so it adds nothing to the boot floor either.
//
// SUBSTRATE — two proven pieces, composed:
//   1. PERSISTENCE via `useKVStorage("config", initial)` (runtime/kvstore): a
//      JSON-backed reactive [get, set] over the host flash key-value store. It
//      seeds `get()` from the stored "config" JSON on boot (falling back to
//      `initial` when the key is absent OR corrupt — kvstore's try/catch never
//      throws), and every set() mirrors JSON.stringify(v) back to flash. This IS
//      the reactive cell useConfig returns — there is NO second signal.
//   2. INBOUND via `pebble/message` (verified against the on-disk watch host,
//      build/devices/pebble/modules/message/pebble-appmessage.{js,c}, and the
//      PROVEN examples/config.tsx). The host `Message` class is reached through
//      `importNow("pebble/message").default` INSIDE the hook (Rule 1: a preloaded
//      module's top-level host construction freezes broken — so NEVER at module
//      scope). `new Message({ keys: ["config"], onReadable })` opens a channel;
//      the FIRST key maps to AppMessage code 10000 (pebble-appmessage.js:28,
//      `new Map(keys.map((v,i) => [v, 10000+i]))`) — exactly the code the pkjs
//      bridge forwards the settings string on (src/pkjs/index.ts) and the code
//      tools/config-drive.py delivers to. `onReadable` fires on INBOUND traffic
//      with `this` BOUND TO THE CHANNEL (pebble-appmessage.c:379 `xsCallFunction1
//      (xsReference(pm->onReadable), pm->obj, xsResult)`), so it reads via
//      `this.read()` (which returns a Map of key NAME -> value, pebble-appmessage
//      .js:35-46) — a REGULAR function, never an arrow (a lexical `this` would
//      miss the channel). This is examples/config.tsx's exact proven shape.
//
// THE MERGE (why merge, not replace): on each inbound message the JSON payload
// is MERGED over the current value — `set({ ...get(), ...parsed })` — so a
// settings page that sends only the keys it changed leaves the rest intact, and
// a full page just overwrites everything. `get()` reads the CURRENT stored
// object; that read does NOT self-subscribe because onReadable fires OUTSIDE any
// effect (Rule 4 — current effect is -1, so Signal.get takes no subscription).
// Because the merge builds a FRESH object every time, useKVStorage's
// same-reference Object.is skip never fires: an inbound message ALWAYS persists +
// notifies (kvstore's "a new object always writes through" contract).
//
// MALFORMED-PAYLOAD SAFETY: `JSON.parse` is wrapped in try/catch — a truncated
// or non-JSON payload (a flaky link, a bad settings page, an over-the-air
// glitch) must NOT crash the watch. On a parse failure we simply do NOT call
// set(), leaving the current value UNCHANGED. This is the one place the hook
// swallows rather than surfaces (Rule 12), because the input is UNTRUSTED
// external data and the alternative is a blank / crashed face.
//
// REACTIVITY (Rule 4): the returned getter IS useKVStorage's signal read —
// reading `config()` inside a jsx thunk / effect subscribes, and the onReadable
// set() (fired by the host, outside any effect) notifies. `<Label string={() =>
// config().text} />` and `skin={() => config().invert ? inv : normal}` repaint
// when the wearer saves settings.
//
// CLEANUP (Rule 5): the inbound channel is `close()`d via onCleanup when the
// owning screen / root is disposed — no leak on navigate-away. So CALL useConfig
// INSIDE the render() build / a component body; called at module scope onCleanup
// is a no-op and the channel simply lives for the app's life.
//
// NOT A SINGLETON (contrast the sensor / battery hooks): a `Message` is
// MULTI-instance by design (config.tsx and devlog.tsx run concurrent channels,
// the host routes each inbound dictionary to the matching instance by code). So
// useConfig opens its OWN channel with its OWN cleanup — no shared instance, no
// refcount. Intended to be called ONCE per app (a single config store); a second
// call opens a second channel on the same code 10000 with an independent signal.
//
// PKJS SIDE (app author owns it): the phone-side flow — showConfiguration ->
// Pebble.openURL(<your settings page>), webviewclosed -> sendAppMessage({10000:
// response}) — already exists in src/pkjs/index.ts and is GENERIC; the app author
// supplies their hosted / Clay-generated config-page URL in that openURL call.
// useConfig needs no change there. Drive it headlessly (no browser) with
// tools/config-drive.py <platform> '<settings json>'.
import { onCleanup } from "runtime/signals";
import { useKVStorage } from "runtime/kvstore";

// `importNow` is the bare Pebble compartment global (host/main.js wraps
// Modules.importNow into the app compartment). It is NOT in the runtime-build
// host typings, so declare it module-locally — ambient, so it ERASES from the
// emit, leaving the proven bare `importNow("pebble/message")` call
// (examples/config.tsx, runtime/message.ts). Mirrors jsx-runtime's module-local
// `declare const __SP_CRASH_UI__`.
declare function importNow(specifier: string): unknown;

// The subset of the host `Message` instance useConfig touches: read the inbound
// dictionary, close on teardown. Named `MessageChannel` to match the local
// interface in examples/config.tsx and runtime/message.ts (Rule 11) — this is
// the host surface, not the hook's return.
interface MessageChannel {
	read(): Map<string, unknown>;
	close(): void;
}

// The host `Message` class as reached through importNow — a `{ default: ctor }`
// namespace whose ctor takes the string key NAMES + the inbound callback (a
// regular function; the host binds `this` to the channel).
type MessageModule = {
	default: new (o: {
		keys: string[];
		onReadable: (this: MessageChannel) => void;
	}) => MessageChannel;
};

/**
 * useConfig(initial) — a reactive, persisted Clay-settings store.
 *
 *   interface Cfg { text: string; invert: number; }
 *   const config = useConfig<Cfg>({ text: "hi", invert: 0 });
 *   <Label string={() => config().text} />                        // reactive read
 *   <Container skin={() => (config().invert ? inv : normal)}>…     // reactive style
 *
 * Returns a single reactive GETTER for the current config object. On boot the
 * value is seeded from the persisted "config" JSON in flash (or `initial` when
 * absent / corrupt — never throws). When the wearer saves new settings, the
 * phone forwards the JSON to the watch (src/pkjs/index.ts, AppMessage code
 * 10000) and useConfig MERGES it over the current value (`{ ...current,
 * ...inbound }` — unspecified keys are PRESERVED), persists the result to flash,
 * and notifies subscribers so the UI repaints. A malformed inbound payload is
 * IGNORED (try/catch around JSON.parse) — it never crashes the app.
 *
 * The inbound channel is opened via `importNow("pebble/message")` INSIDE the hook
 * (Rule 1) and `close()`d on dispose (Rule 5), so CALL THIS INSIDE the render()
 * build / a component body — at module scope the cleanup is a no-op and the
 * channel lives for the app's life. Values must be JSON-serializable (the
 * kvstore contract — no functions / cycles). The app author supplies the
 * settings-PAGE URL in src/pkjs/index.ts's showConfiguration handler; useConfig
 * needs no change there. Call ONCE per app (a single config store).
 *
 * @param initial the config object used when flash has no stored value
 * @returns a reactive getter — call `config()` to read the current config (subscribes)
 */
export function useConfig<T extends object>(initial: T): () => T {
	// PERSISTENCE + the reactive cell: seeds from flash (or `initial`), and every
	// set() below mirrors JSON.stringify back to flash.
	const [get, set] = useKVStorage<T>("config", initial);
	// INBOUND channel — importNow INSIDE the hook (Rule 1): a module-scope host
	// construction would freeze broken in the preload. Inline cast per config.tsx.
	const Message = (importNow("pebble/message") as MessageModule).default;
	const channel = new Message({
		keys: ["config"], // first key -> AppMessage code 10000 (what pkjs sends)
		// regular function (not arrow): the host binds `this` to the channel, so
		// `this.read()` is the inbound Map (config.tsx). Fires outside any effect —
		// the merge's get() does not self-subscribe and set() is a plain write (Rule 4).
		onReadable(this: MessageChannel) {
			try {
				// MERGE the inbound payload over the current value so a PARTIAL
				// settings payload keeps the rest; a fresh object every time, so
				// kvstore always persists + notifies (no same-reference skip).
				set({
					...get(),
					...(JSON.parse(String(this.read().get("config") ?? "{}")) as Partial<T>),
				} as T);
			} catch {
				// malformed / non-JSON payload: leave the current value unchanged. The
				// ONE place we swallow — untrusted external input must never crash the face.
			}
		},
	});
	// Rule 5 — close with the owning screen / root (no leak on navigate-away).
	onCleanup(() => channel.close());
	return get;
}
