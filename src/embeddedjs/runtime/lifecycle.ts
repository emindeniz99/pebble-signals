// App-lifecycle hooks — the opt-in `runtime/lifecycle` module: why the app
// LAUNCHED (a one-shot), reactive FOCUS state, and the WAKEUP scheduler + its
// last-fired event. OPT-IN & ZERO-COST: an app that never imports it never ships
// it (the manifest prunes to the import closure — README tree-shaking); it
// constructs NOTHING at module scope, so it adds nothing to the boot floor.
//
// SUBSTRATE (verified against the on-disk watch host, SDK 4.17 —
// build/devices/pebble/modules/global/{global.js,pebble-global.c} and
// modules/wakeup/{wakeup.js,wakeup.c}):
//   * `watch` is the BARE Pebble compartment global (global.js `class Pebble`
//     installed as `watch`, like `screen`/`Skin`). Referenced DIRECTLY — no
//     import, no importNow (the importNow below is ONLY for pebble/wakeup).
//   * watch.launch  (get launch() -> xs_global_launch_get, pebble-global.c:195)
//     builds a FRESH { reason, arguments } each read: `reason` =
//     app_launch_reason() (the AppLaunchReason for why this run started),
//     `arguments` = app_launch_get_args() (an unsigned launch arg). A ONE-SHOT —
//     there is NO launch event, so useLaunchReason takes no listener, no cleanup.
//   * watch.wake  (get wake() -> xs_global_wake_get, :205) returns the
//     { id, cookie } of the wakeup that LAUNCHED the app, or undefined when the
//     app was not launched by a wakeup (the C returns early, leaving the result
//     undefined). A ONE-SHOT — used to SEED useWakeup's `last`.
//   * watch.addEventListener("didFocus"|"willFocus", cb) (global.js events[7] and
//     events[6]) subscribe the native app_focus_service; the host dispatches
//     didFocus(bool in_focus) -> watch.do("didFocus", in_focus) and
//     willFocus(bool in_focus) -> watch.do("willFocus", in_focus)
//     (pebble-global.c:99-123 — the SAME xsCall2-with-a-boolean shape), so BOTH
//     callbacks are FocusCallbacks: each takes ONE boolean. They differ only in
//     WHEN — will_focus fires as the focus change BEGINS, did_focus once it has
//     completed. ONE native subscription serves BOTH phases: xs_global_focus
//     (:125) keeps a per-phase handler flag (add -> focus(1) / focus(2); the LAST
//     remove of a phase -> focus(-1) / focus(-2)) and calls
//     app_focus_service_unsubscribe() only when NEITHER flag is left (:137) —
//     re-subscribing with the surviving handler otherwise. So each phase's
//     add/removeEventListener never disturbs the other's.
//   * watch.addEventListener("wakeup", cb) (events[8]) subscribes
//     app_wakeup_service; a fired wakeup dispatches wakeup(id, cookie) ->
//     watch.do("wakeup", { id, cookie }) (pebble-global.c:149-167 — xsCall2), so
//     the callback takes ONE { id, cookie } object.
//   * `pebble/wakeup`'s default export is the `Wakeup` CLASS (static
//     schedule/query/cancel), reached via importNow("pebble/wakeup").default. It
//     is HOST-PRELOADED (zero manifest cost) but MUST be imported INSIDE the hook
//     (Rule 1 — a preloaded module's top-level host use freezes broken). Each
//     static method binds straight to native: xsl rewrites `native("xs_...")
//     .call(this)` to forward the JS call's ACTUAL args (proven by global.js
//     reusing ONE connected() helper for both `connected()` and
//     `connected(true)`, which the C tells apart by xsmcArgc). So:
//       Wakeup.schedule(time, cookie, notifyIfMissed) -> WakeupId (wakeup.c:50):
//         `time` is JS epoch MS (the C divides by 1000 -> unix seconds), `cookie`
//         int32, `notifyIfMissed` boolean; returns the new id (THROWS on a
//         negative id). cookie/notifyIfMissed are OPTIONAL — the C reads
//         xsArg(1..2) unconditionally and coerces a missing arg to 0 / false.
//       Wakeup.query(id) -> { time, scheduled } (wakeup.c:35).
//       Wakeup.cancel(id) cancels ONE; Wakeup.cancel() with NO arg cancels ALL
//         (wakeup.c:27 branches on `xsmcArgc > 0`). => passing `undefined`
//         explicitly would cancel id 0, NOT all — so useWakeup's `cancel`
//         BRANCHES on `id === undefined` (a correctness requirement, not style).
//
// REACTIVITY (Rule 4): useAppFocus SEEDS a useState signal with `true` (an app is
// in focus at launch; the host's first focus fire is deferred, not
// synchronous) and the focus callback — EITHER phase — WRITES it via the setter.
// useWakeup SEEDS a `last` signal from watch.wake (undefined unless launched by
// a wakeup) and the "wakeup" callback WRITES it. Both fire OUTSIDE any effect, so
// a plain setter write is correct (no self-subscribe); consumers read the getter
// -> reactive. A fresh { id, cookie } per fire always differs (===), so each
// wakeup notifies.
//
// CLEANUP (Rule 5, MANDATORY): useAppFocus / useWakeup register
// onCleanup(() => watch.removeEventListener(ev, cb)) with the SAME cb reference
// they added — global.js removeEventListener does indexOf(cb), so a different
// closure would not match, leaking the listener AND the native subscription. They
// dispose with the owning render root / screen, so navigate-away never leaks.
// CALL THESE HOOKS INSIDE A REACTIVE OWNER (the render() build / a component
// body) so onCleanup binds — a module-scope call has no owner. useLaunchReason
// holds NO subscription, so it needs neither an owner nor cleanup.
//
// DEVICE-GATED (document loudly — these are NOT reproducible in the Node/vm test
// sandbox, and are emulator-uncertain; verify on hardware, Rule 2):
//   * useAppFocus: the focus EVENTS ("didFocus" / "willFocus") are
//     EMULATOR-UNCERTAIN. The native app_focus_service subscription is real, the
//     hook is correct and SUBSCRIBING to either phase is no-throw device-proven
//     (hostprobe receipt 2026-07-29), but QEMU may not DELIVER them — so the seed
//     (`true`) can stay put under the emulator. On a real watch, focus flips when
//     a notification / quick-launch overlay covers the app and back.
//   * useWakeup: DEVICE-FIRST. `last` only updates when a SCHEDULED wakeup
//     actually FIRES, which needs a real app_wakeup_schedule AND the watch to
//     reach that wall-clock time — usually AFTER the app has exited and been
//     relaunched (read `last` / watch.wake on the next launch). schedule / query
//     / cancel call real native services; exercise them on hardware.
//
// GUARD (useLaunchReason ONLY): a bare reference to an ABSENT global throws
// ReferenceError, so useLaunchReason typeof-probes `watch` and degrades to
// { reason: 0, arguments: 0 } on a host without it (Node / tests) — mirroring
// watchinfo / connection's static-read fallback. useAppFocus / useWakeup do NOT
// guard: like runtime/clock, their entire value IS a live subscription, so a
// frozen fallback would be WORSE than letting an (impossible) absent `watch`
// throw into render()'s crash screen.
import { onCleanup, useState } from "runtime/signals";

// `importNow` is the bare Pebble compartment global (host/main.js wraps
// Modules.importNow into the app compartment). It is NOT in the runtime-build
// typing surface, so declare it module-locally — ambient, so it ERASES from the
// emit, leaving the proven bare importNow("pebble/wakeup") call. Mirrors
// message.ts / accel.ts.
declare function importNow(specifier: string): unknown;

/** Why the app launched — a one-shot read of `watch.launch`, from {@link useLaunchReason}. */
export interface LaunchInfo {
	/** app_launch_reason() — the AppLaunchReason enum for why this run started. */
	reason: number;
	/** app_launch_get_args() — the unsigned launch argument (0 when none). */
	arguments: number;
}

/** A fired wakeup — {@link useWakeup}'s `last` value and the "wakeup" event payload. */
export interface WakeupInfo {
	/** The WakeupId of the wakeup that fired (matches a {@link Wakeup.schedule} return). */
	id: number;
	/** The int32 cookie that was scheduled with it. */
	cookie: number;
}

// The `pebble/wakeup` default export (the Wakeup CLASS) as reached through
// importNow — static schedule/query/cancel, typed inline (Rule 1 — no import from
// a vendored .d.ts). cookie / notifyIfMissed are OPTIONAL: the native reads
// xsArg(1..2) unconditionally and coerces a missing arg to 0 / false (wakeup.c),
// so a caller may omit them.
type WakeupHost = {
	schedule(time: number, cookie?: number, notifyIfMissed?: boolean): number;
	query(id: number): unknown;
	cancel(id?: number): void;
};

/** What {@link useWakeup} returns: the wakeup scheduler plus a reactive `last`. */
export interface Wakeup {
	/**
	 * Schedule a wakeup at `time` (JS epoch MS; the host converts to unix
	 * seconds). `cookie` (int32, default 0) is echoed back on the event;
	 * `notifyIfMissed` (default false) asks the system to still deliver it if the
	 * watch was off at `time`. Returns the new WakeupId (the host THROWS on a
	 * scheduling error).
	 */
	schedule: (time: number, cookie?: number, notifyIfMissed?: boolean) => number;
	/** Query a scheduled wakeup by id — the host `{ time, scheduled }` shape. */
	query: (id: number) => unknown;
	/** Cancel ONE wakeup by id, or — called with NO argument — cancel ALL of them. */
	cancel: (id?: number) => void;
	/**
	 * The most recently FIRED wakeup as `{ id, cookie }`, or `undefined`. Seeded
	 * from `watch.wake` (the wakeup that launched the app, if any) and updated on
	 * every "wakeup" event. REACTIVE — read inside a thunk / effect to repaint.
	 */
	last: () => WakeupInfo | undefined;
}

/**
 * useLaunchReason() — a ONE-SHOT read of why the app launched (`watch.launch`).
 *
 *   const { reason, arguments: arg } = useLaunchReason();
 *   <Label string={"launched: " + reason} />   // reason never changes at runtime
 *
 * No subscription, no cleanup: launch info is fixed for the run, so this is a
 * plain read — call it anywhere, it needs no reactive owner. Returns a fresh
 * `{ reason, arguments }` (the host mints a new object each read). On a host
 * WITHOUT the bare `watch` global (Node / tests) it degrades to
 * `{ reason: 0, arguments: 0 }` and never throws.
 *
 * @returns `{ reason, arguments }` — the AppLaunchReason and unsigned launch arg
 */
export function useLaunchReason(): LaunchInfo {
	// MISSING-`watch` guard (mirrors watchinfo / connection): a host without the
	// bare global degrades to a stable zero reading — never a ReferenceError.
	if (typeof watch === "undefined") return { reason: 0, arguments: 0 };
	// watch.launch is freshly minted per read (xs_global_launch_get) — return it
	// directly; a one-shot read has no shared host object to alias.
	return watch.launch;
}

/**
 * Which focus PHASE {@link useAppFocus} tracks. Both host events carry the SAME
 * boolean and share ONE app_focus_service subscription (global.js events[6]/[7]
 * — see the module header); they differ only in WHEN they fire: `"did"` once the
 * focus change has COMPLETED, `"will"` as it BEGINS — the EARLIER signal, for
 * stopping work before an overlay finishes covering the app.
 */
export type FocusPhase = "did" | "will";

/**
 * useAppFocus() — reactive app-focus state (true while the app owns the screen).
 *
 *   const focused = useAppFocus();
 *   <Label string={() => (focused() ? "focused" : "covered")} />
 *   const soon = useAppFocus("will");   // same boolean, fired EARLIER
 *
 * SEEDS `true` (an app is in focus at launch; the host's first focus fire is
 * deferred, not synchronous), then the host focus event (a boolean) writes it.
 * Uses the bare `watch` global directly; the listener is removed via onCleanup
 * when the owner is disposed, so CALL THIS INSIDE a render root / component body
 * (Rule 5). Want BOTH edges? Call it twice — the phases are independent
 * subscriptions on the host's one native service.
 *
 * DEVICE-GATED: the focus events are EMULATOR-UNCERTAIN — the native
 * app_focus_service subscription is real, the hook is correct and subscribing is
 * device-proven no-throw for both phases, but QEMU may not DELIVER them, so the
 * seed can stay put under the emulator. Verify on hardware.
 *
 * @param phase `"did"` (default) subscribes to "didFocus" — the change is done;
 *   `"will"` subscribes to "willFocus" — the change is starting.
 * @returns a getter `() => boolean` — reactive; call inside a thunk to subscribe
 */
export function useAppFocus(phase: FocusPhase = "did"): () => boolean {
	// Seed true: an app is focused at launch (the host's fire is deferred).
	const [focused, setFocused] = useState(true);
	// Both host events are `<phase>Focus`, so the string arithmetic is exact
	// (clock.ts's `granularity + "change"` idiom). The typings declare willFocus /
	// didFocus as SEPARATE addEventListener overloads, so a UNION-typed name
	// matches NEITHER — cast to one; both overloads take the identical
	// FocusCallback, so the cast narrows the name, not the contract.
	const event = (phase + "Focus") as "didFocus";
	// The host callback fires OUTSIDE any effect with ONE boolean — a plain setter
	// write is correct (Rule 4). Named so removeEventListener matches by reference.
	const onFocus = (inFocus: boolean): void => setFocused(inFocus);
	watch.addEventListener(event, onFocus);
	// Rule 5: remove the SAME reference on owner dispose (indexOf match); the host
	// drops this phase's handler once its last listener leaves, and unsubscribes
	// the native service only when the OTHER phase has no listener either.
	onCleanup(() => watch.removeEventListener(event, onFocus));
	return focused;
}

/**
 * useWakeup() — the wakeup scheduler plus a reactive `last`-fired event.
 *
 *   const wakeup = useWakeup();
 *   // from a button: schedule ~60s out with cookie 1
 *   const id = wakeup.schedule(Date.now() + 60000, 1);
 *   <Label string={() => "last woke by cookie " + (wakeup.last()?.cookie ?? "-")} />
 *
 * Wraps importNow("pebble/wakeup").default (the Wakeup class) for
 * schedule/query/cancel, and owns a `last` signal SEEDED from `watch.wake` and
 * fed by the host "wakeup" event. `cancel()` with no argument cancels ALL
 * wakeups; `cancel(id)` cancels one (the host branches on argc — passing
 * `undefined` would cancel id 0, so this hook branches too). The "wakeup"
 * listener is removed via onCleanup, so CALL THIS INSIDE a render root /
 * component body (Rule 5).
 *
 * DEVICE-FIRST: `last` only updates when a SCHEDULED wakeup actually FIRES (needs
 * a real schedule + the watch to reach that wall-clock time, usually on the NEXT
 * launch — inspect `last` / `watch.wake` then). schedule / query / cancel hit
 * real native services; exercise them on hardware.
 *
 * @returns a {@link Wakeup} — `{ schedule, query, cancel, last }`
 */
export function useWakeup(): Wakeup {
	// importNow INSIDE the hook (Rule 1) — a module-scope host use freezes broken
	// in the preload. Inline `as` cast (accel.ts / message.ts shape).
	const W = (importNow("pebble/wakeup") as { default: WakeupHost }).default;
	// Seed `last` from watch.wake — the { id, cookie } of the wakeup that launched
	// the app, or undefined when it wasn't launched by one (Rule 2 — seed the
	// one-shot; at t=0 the launch wakeup IS the most recent wakeup).
	const [last, setLast] = useState<WakeupInfo | undefined>(watch.wake);
	// The host "wakeup" event fires OUTSIDE any effect with ONE { id, cookie } —
	// plain setter write (Rule 4). Named for the removeEventListener match.
	const onWakeup = (e: WakeupInfo): void => setLast(e);
	watch.addEventListener("wakeup", onWakeup);
	// Rule 5: remove the SAME reference on owner dispose (indexOf match); the host
	// unsubscribes app_wakeup_service once its last "wakeup" listener leaves.
	onCleanup(() => watch.removeEventListener("wakeup", onWakeup));
	return {
		schedule: (time, cookie, notifyIfMissed) => W.schedule(time, cookie, notifyIfMissed),
		query: (id) => W.query(id),
		// BRANCH (correctness, see the header): cancel() with NO arg cancels ALL
		// (the host's argc check); forwarding `undefined` would cancel id 0. So
		// dispatch the no-arg vs one-arg host call explicitly.
		cancel: (id) => {
			if (id === undefined) W.cancel();
			else W.cancel(id);
		},
		last,
	};
}
