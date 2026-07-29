// ticks() / elapsed() / useHostTimer() — the host `time` and `timer` modules,
// the opt-in `runtime/hosttime` module. OPT-IN & ZERO-COST: an app that never
// imports it never ships it (the manifest prunes to the import closure — README
// tree-shaking), and it constructs NOTHING at load time (no importNow, no host
// object, no module-scope state), so it adds nothing to the boot floor for
// anyone.
//
// SUBSTRATE (verified against the on-disk 4.17 host). Both modules are in the
// DEVICE manifest, not merely the tree: build/devices/pebble/manifest.json lists
// `$(MODULES)/base/time/*` + `/time/pebble/*` and `$(MODULES)/base/timer/*` +
// `/timer/pebble/*` under `modules`, AND names both in `preload` — so they are
// HOST-PRELOADED (zero mod-manifest cost, like pebble/vibes) and reached with
// `importNow("time")` / `importNow("timer")`, which the host's loadNowHook maps
// straight through to the host namespace (host/main.js — only "pebble/button" is
// blocked, and only in a watchface).
//   * `Time` (modules/base/time/time.js) — ALL-STATIC. `Time.ticks` is
//     `xs_time_ticks` -> `xsmcSetInteger(xsResult, modMilliseconds())`, and on
//     this platform `modMilliseconds()` is `((uint32_t)(rtc_get_ticks()))`
//     (xs/platforms/pebble/xsHost.h) — MONOTONIC milliseconds since boot, which
//     `Date.now()` is not. `Time.delta(start, end?)` is `xs_time_delta`
//     (end defaults to now). `set` / `timezone` / `dst` are left UNBOUND on
//     purpose: every one of them is `xsUnknownError("unimplemented")` in the
//     Pebble native (modules/base/time/pebble/modTime.c), so binding them would
//     ship nothing but a throw (Rule 2).
//   * `Timer` (modules/base/timer/timer.js) — ALL-STATIC. `set(cb, delay,
//     repeat)` returns an opaque host OBJECT (a host-data slot), never an
//     integer id. `schedule(id, delay, repeat)` is `modTimerReschedule` — it
//     rewrites `triggerTime`/`repeatInterval` IN PLACE and clears the
//     unscheduled flag; `schedule(id)` with NO delay is `modTimerUnschedule`
//     (pause — sets the flag, keeps the record). `clear(id)` frees it.
//
// WHY THIS EXISTS AT ALL — what the globals cannot do. The host's timer globals
// ARE this module's `Timer`, thinly wrapped: main.js defines `setInterval(cb,d)`
// as `Timer.repeat(cb, d)`, `setTimeout(cb, d)` as `Timer.set(cb, d)`, and
// `clearInterval`/`clearTimeout`/`clearImmediate` all as `Timer.clear`. So the
// ids `runtime/timers` juggles are already these host objects — but the globals
// expose only create and destroy. The two operations they omit are exactly the
// ones worth binding:
//   1. RESCHEDULE. Changing a delay through the globals is clear + create: a
//      c_free plus a c_malloc, a new host object, a new XS slot, a new
//      xsRemember root — every time. `Timer.schedule` mutates the existing
//      record instead, so a variable-delay poller (backoff, a countdown that
//      speeds up) re-arms for ZERO allocation on the arena that is always the
//      binding constraint (Rule 4 of the project rules).
//   2. PAUSE. `schedule(id)` stops the timer WITHOUT destroying it, so a
//      resume is one more `schedule(id, ms, ms)` rather than a rebuild.
// Everything else the globals already do well — this module deliberately does
// NOT re-wrap setInterval/setTimeout. `runtime/timers` remains the ergonomic,
// reactive-delay path; this is the low-level escape hatch under it.
//
// ALWAYS REPEATING (the one-shot trap, from the host source). `xs_timer_callback`
// FORGETS a fired timer whose `repeatInterval` is 0: it xsForget()s the handle
// and NULLs its host data (modTimer.c). A one-shot handle is therefore DEAD the
// instant it fires, and `Timer.schedule` on it throws
// (`xsmcGetHostDataValidate`) — so a re-schedulable timer must be created
// REPEATING. useHostTimer always passes `repeat = delay` for that reason. A
// caller who wants a re-armable ONE-shot pauses from inside the callback
// (`t.pause()`), which leaves the record alive to be scheduled again.
//
// ERROR CONTRACT — asymmetric, the same split runtime/files makes (Rule 12).
// The two READS are total: `ticks()`/`elapsed()` answer 0 on a host with no
// `importNow` at all, because a measurement that cannot be taken is not an app
// failure and a throw at every call site would be noise. `useHostTimer` THROWS
// there instead: a timer that silently never fires is work the app believes it
// scheduled. A genuine host failure (the module missing behind a live
// `importNow`) is left to PROPAGATE from all three — the host's message is the
// only diagnostic there is, and a try/catch here would swallow it.
//
// DEVICE STATUS: source-proven present and preloaded in the device manifest;
// the on-watch receipt is the `timeprobe` example (docs/components.md).
import { track } from "runtime/signals";

// `importNow` is a bare compartment global on device (host/main.js wraps
// Modules.importNow) and is injected by the test sandbox; it is not in the
// runtime typing surface, so declare it module-locally (erases at emit).
declare function importNow(specifier: string): unknown;

// The host `Time` class, typed inline (Rule 1 — all-static, no instance). Only
// the two members PebbleOS actually implements are named; see the header.
type TimeHost = {
	readonly ticks: number;
	delta(start: number, end?: number): number;
};

// The host `Timer` class, typed inline. `set` hands back an opaque host object;
// it is only ever passed back in, never inspected, so `object` is the honest type.
type TimerHost = {
	set(callback: () => void, delay: number, repeat: number): object;
	schedule(id: object, delay?: number, repeat?: number): void;
	clear(id: object): void;
};

// Resolve a host module's default export at CALL time — never at module scope: a
// preloaded module that touched a host module at load time would freeze broken
// (gotcha 13 / Rule 1). `importNow` is typeof-probed because a bare reference to
// an absent global is a ReferenceError, not `undefined` (the watchinfo /
// localstorage guard idiom); each caller then decides whether absence degrades
// or throws (module header, error contract).
function host<T>(specifier: string): T | undefined {
	if (typeof importNow === "undefined") return undefined;
	return (importNow(specifier) as { default: T }).default;
}

/** The control surface {@link useHostTimer} returns — one host timer, re-aimed in place. */
export interface HostTimer {
	/**
	 * Re-aim the SAME host timer at `delay` ms and keep repeating at that
	 * interval (`Timer.schedule`) — no free, no malloc, no new slot. Also the
	 * resume for a {@link HostTimer.pause}d timer. A no-op after `cancel()`.
	 */
	reschedule(delay: number): void;
	/**
	 * Stop firing but KEEP the timer (`Timer.schedule` with no delay —
	 * `modTimerUnschedule`); `reschedule()` resumes it. A no-op after `cancel()`.
	 */
	pause(): void;
	/** Destroy the timer (`Timer.clear`). Idempotent; also fired on owner dispose. */
	cancel(): void;
}

/**
 * Monotonic milliseconds since boot — the host `Time.ticks`.
 *
 *   const t0 = ticks();
 *   buildScreen();
 *   <Label string={`${elapsed(t0)} ms`} />
 *
 * The clock `Date.now()` is not: wall time can jump when the phone resyncs it,
 * which makes a `Date.now()` difference an unusable duration. This one only ever
 * counts up (`rtc_get_ticks()`).
 *
 * BEWARE the raw number: the host returns it through `xsmcSetInteger`, an INT32,
 * so once uptime passes 2^31 ms (~24.9 days) `ticks()` reads NEGATIVE, and it
 * wraps entirely at 2^32 ms (~49.7 days). Never subtract two of these by hand —
 * use {@link elapsed}, which does the subtraction where the wrap cancels.
 *
 * @returns ms since boot, or `0` on a host with no `importNow` (never throws)
 */
export function ticks(): number {
	const T = host<TimeHost>("time");
	return T ? T.ticks : 0;
}

/**
 * Milliseconds between two {@link ticks} readings — the host `Time.delta`.
 *
 *   const t0 = ticks();
 *   parse(payload);
 *   const ms = elapsed(t0);            // t0 -> now
 *   const span = elapsed(t0, t1);      // an explicit end
 *
 * Prefer this over `ticks() - start` ALWAYS: `xs_time_delta` converts both ends
 * with `xsmcToUnsigned` and subtracts in uint32, so the INT32 sign flip and the
 * 49.7-day wrap that corrupt a hand-written subtraction cancel out here.
 *
 * @param start an earlier {@link ticks} reading
 * @param end optional later reading; omitted means NOW (the host's own default)
 * @returns the elapsed ms, or `0` on a host with no `importNow` (never throws)
 */
export function elapsed(start: number, end?: number): number {
	const T = host<TimeHost>("time");
	if (!T) return 0;
	// Pass NO second argument when the caller passed none: xs_time_delta branches
	// on `xsmcArgc > 1`, and a literal `delta(start, undefined)` would coerce to
	// an `end` of 0 and report a garbage span (the same arity care as
	// listFiles()'s scan() and watchinfo's backlight()).
	return end === undefined ? T.delta(start) : T.delta(start, end);
}

/**
 * A repeating host timer you can RE-AIM instead of rebuilding — `Timer.set` +
 * `Timer.schedule`, the two operations `setInterval`/`clearInterval` do not
 * expose.
 *
 *   const t = useHostTimer(poll, 1000);
 *   t.reschedule(5000);   // same timer, new interval — no free/malloc
 *   t.pause();            // stop firing, KEEP the timer
 *   t.reschedule(1000);   // resume
 *
 * Reach for this only when the delay CHANGES often (backoff, a countdown that
 * accelerates): re-arming through the globals is clear + create — a c_free, a
 * c_malloc, a fresh host object and XS slot every time — while `reschedule()`
 * rewrites the existing record for zero allocation. For a fixed delay, or for a
 * delay driven by a signal, `useInterval` from `runtime/timers` is the better
 * fit and stays on the proven global.
 *
 * The timer is created REPEATING (`repeat = delay`) and stays that way: the host
 * forgets a one-shot handle the moment it fires, which would make every later
 * `reschedule()` throw (module header). For a re-armable one-shot, call
 * `pause()` from inside `callback`.
 *
 * Cancelled automatically when the owning screen is disposed (`track`), so a
 * navigate-away never leaves it running — call inside a render root / component
 * body so that binds. After `cancel()` the handle is gone and `reschedule()` /
 * `pause()` are no-ops rather than a host throw.
 *
 * THROWS when the compartment has no `importNow` (module header, error
 * contract): unlike a missing measurement, a timer that never fires is work the
 * app believes it scheduled.
 *
 * @param callback fired every `delay` ms until paused or cancelled
 * @param delay the initial interval in ms
 * @returns a {@link HostTimer} — `reschedule` / `pause` / `cancel`
 */
export function useHostTimer(callback: () => void, delay: number): HostTimer {
	const T = host<TimerHost>("timer");
	if (!T) throw new Error("no host timer");
	// ONE host record for the life of the hook, held in this call's closure —
	// created lazily at runtime (Rule 5), never at module scope. `null` once
	// cancelled, which is what makes the two mutators safe afterwards: clear()
	// NULLs the host data, so a later schedule() on the dead handle would abort
	// the app (xsmcGetHostDataValidate throws).
	let id: object | null = T.set(callback, delay, delay);
	// Idempotent, so it serves as both the owner cleanup and the manual cancel.
	const cancel = (): void => {
		if (id === null) return;
		T.clear(id);
		id = null;
	};
	// This, not disposing an effect, is what stops the timer when the screen that
	// created it is torn down (mirrors runtime/timers' `track(clear)`).
	track(cancel);
	return {
		// delay AND repeat, so the timer stays repeating and stays re-schedulable
		reschedule: (ms: number): void => {
			if (id !== null) T.schedule(id, ms, ms);
		},
		// ONE argument on purpose — xs_timer_schedule branches on `1 === argc` to
		// unschedule; passing a delay would re-arm instead of pausing.
		pause: (): void => {
			if (id !== null) T.schedule(id);
		},
		cancel,
	};
}
