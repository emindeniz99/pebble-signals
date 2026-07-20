// Reactive current-time hooks — the opt-in `runtime/clock` module. The
// React-Native `useClock` analog for Pebble: `useClock()` is a reactive Date
// getter that ticks; `useTimeParts()` splits it into per-field getters.
// OPT-IN & ZERO-COST: an app that never imports `runtime/clock` never ships it
// (the manifest prunes to the import closure — README tree-shaking), so this
// module costs non-users nothing. It constructs NO host module and calls NO
// importNow (Rule 1 is moot here) — it rides the bare `watch` global (Rule 2).
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/global/global.js — `class Pebble`, installed as
// the bare `watch` compartment global like `screen`/`Skin`; typed in
// types/moddable/pebble/global.d.ts):
//   * watch.addEventListener("secondchange"|"minutechange", cb) — the NATIVE
//     tick service. For a time event the host:
//       1. fires the callback ALMOST IMMEDIATELY — `Timer.set(() =>
//          cb({date: new Date}))` (deferred ONE turn, NOT synchronous), then
//       2. arms ONE shared repeat timer: `#timeChange ??= Timer.repeat(id =>
//          #tick(id), 1000)`, then `Timer.schedule(id, offset + interval -
//          (now % interval), interval)` — BOUNDARY-ALIGNED to the wall clock
//          with `offset = 50`ms of late-guard so an early firmware Timer still
//          lands in the next interval. `#tick` fires "secondchange" every tick
//          and "minutechange" only when the minute rolls over. Payload is
//          `{ date: Date }` — a FRESH Date each fire.
//   * ONE TIMER FOR ALL LISTENERS: `#schedule()` shares the single `#timeChange`
//     repeat across every time listener and picks the FINEST subscribed
//     interval; `removeEventListener` splices the callback and, when the last
//     time listener leaves, `#schedule()` clears the shared timer.
//     => NO manual singleton/refcount is needed here (contrast the sensor /
//     battery hooks, whose C wrapper throws on a 2nd construction — Rule 3):
//     the host already coalesces listeners onto one timer and reclaims it. Each
//     hook just add/removeEventListener's its OWN callback; N useClock /
//     useTimeParts calls cost ONE firmware timer, not N.
//
// WHY THE NATIVE SERVICE, NOT setInterval (Rule 6): a `setInterval(fn, 1000)`
// fires 1000ms after the LAST callback, so it DRIFTS (accumulating error — a
// face that updates at :00.4 then :01.4 looks wrong), and every hook would arm
// its OWN timer. The native secondchange/minutechange is wall-clock
// boundary-aligned on ONE shared timer with the +50ms guard — better accuracy
// AND battery. So this module ships NO setInterval fallback; watchface.tsx's
// setInterval pattern predates these hooks and is exactly the thing they fix.
//
// REACTIVITY (Rule 4): `useClock` SEEDS a useState signal with `new Date()` at
// call time so the getter returns a valid Date SYNCHRONOUSLY (the host's
// immediate fire is deferred one turn — without the seed the first paint would
// be blank/stale). The watch callback then WRITES the signal via the setter; it
// fires OUTSIDE any effect, so a plain setter write is correct (no self-
// subscribe). Consumers read the getter -> reactive. Every fire delivers a NEW
// Date object (always !== the previous -> always notifies), so each tick
// repaints with the fresh time.
//
// CLEANUP (Rule 5 — mandatory): `onCleanup(() => watch.removeEventListener(...))`
// disposes the listener with the owning screen/root, so navigating away leaks
// nothing and (via the host) stops the shared timer once the last listener
// goes. Call these hooks INSIDE a reactive owner (the render() build / a
// component body) so onCleanup binds — a module-scope call has no owner.
//
// NO typeof-`watch` GUARD (contrast watchinfo.ts, same batch): `watch` is
// ALWAYS present on device and is referenced DIRECTLY (Rule 2 — bare
// compartment global, no import, no importNow). watchinfo guards because it
// returns STATIC data that degrades sensibly to zeros; a clock's entire value
// IS the live subscription, so a frozen fallback clock would be WORSE than a
// loud failure — we let an (impossible) absent `watch` throw into render()'s
// crash screen rather than silently freeze.
import { onCleanup, useState } from "runtime/signals";

/** Tick granularity for {@link useClock} / {@link useTimeParts}: per-second or per-minute. */
export type ClockGranularity = "second" | "minute";

/**
 * A reactive current-time getter — the RN `useClock` analog.
 *
 *   const now = useClock();                                     // ticks every second
 *   <Label string={() => now().toTimeString().slice(0, 8)} />  // reactive HH:MM:SS
 *   const slow = useClock("minute");                           // ticks on the minute
 *
 * Subscribes to the host's native tick service (`watch.addEventListener` on
 * "secondchange" / "minutechange"): ONE shared, wall-clock-aligned firmware
 * timer that fires immediately on subscribe then on each boundary (see the
 * module header). The returned getter reads a signal SEEDED with `new Date()`,
 * so it holds a valid Date synchronously; each tick writes a fresh Date and the
 * getter's readers repaint. Auto-cleans on owner dispose via {@link onCleanup} —
 * MUST be called inside a reactive owner (the render build / a component), not
 * at module scope.
 *
 * @param granularity `"second"` (default) subscribes to "secondchange";
 *   `"minute"` subscribes to "minutechange" (cheaper — use it for a display that
 *   only changes each minute, e.g. a date line).
 * @returns a getter `() => Date`; call it inside a binding thunk to subscribe.
 */
export function useClock(granularity: ClockGranularity = "second"): () => Date {
	const [now, setNow] = useState(new Date());
	// The finer "secondchange" is the default; "minute" maps to the coarser
	// "minutechange" (host #schedule coalesces both onto the one shared timer).
	const event: "secondchange" | "minutechange" =
		granularity === "minute" ? "minutechange" : "secondchange";
	// The host callback fires OUTSIDE any effect — a plain setter write is correct
	// (Rule 4). e.date is a fresh Date every fire, so the write always notifies.
	const onTick = (e: { date: Date }): void => setNow(e.date);
	watch.addEventListener(event, onTick);
	// Rule 5: dispose the listener with the owning screen/root (the host stops the
	// shared timer once its last time listener is removed).
	onCleanup(() => watch.removeEventListener(event, onTick));
	return now;
}

/** Per-field reactive time getters returned by {@link useTimeParts}. */
export interface TimeParts {
	/** Reactive getter for the hour (0–23). */
	hours: () => number;
	/** Reactive getter for the minute (0–59). */
	minutes: () => number;
	/** Reactive getter for the second (0–59). */
	seconds: () => number;
}

/**
 * Split the current time into per-field reactive getters, derived from one
 * {@link useClock} Date.
 *
 *   const { hours, minutes, seconds } = useTimeParts();
 *   <Label string={() => two(hours()) + ":" + two(minutes()) + ":" + two(seconds())} />
 *
 * Each field is a PLAIN PROJECTION getter over the shared clock Date
 * (`() => now().getHours()`), NOT a `computed()` memo. Rationale (project Rule 4
 * — recompute, don't cache; and conformance Law 23 — signal-piu's `computed`
 * does NOT equality-dedupe its notifications): a clock is ONE Date signal that
 * changes every tick, so a memo per field would still re-notify every tick (no
 * repaint saved) while costing three forward effects — a plain getter is
 * strictly cheaper with identical behavior. HONEST LIMIT: because every field
 * reads the same one Date signal, EVERY bound field re-evaluates each tick; for
 * a Label that must repaint ONLY when its own field changes, use separate
 * equal-write `useState` signals fed from one tick (the watchface.tsx pattern —
 * `setHh(d.getHours())` skips via S.set's Object.is when the hour is unchanged).
 * Composes {@link useClock}, so it subscribes / cleans up exactly like it.
 *
 * @param granularity forwarded to {@link useClock} (`"second"` default).
 * @returns `{ hours, minutes, seconds }` — three reactive `() => number` getters.
 */
export function useTimeParts(granularity: ClockGranularity = "second"): TimeParts {
	const now = useClock(granularity);
	return {
		hours: () => now().getHours(),
		minutes: () => now().getMinutes(),
		seconds: () => now().getSeconds(),
	};
}
