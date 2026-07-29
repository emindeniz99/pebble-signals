// watchInfo() + useDisplayBounds() — one-shot device + screen facts, the
// opt-in `runtime/watchinfo` module. The React-Native `Platform` /
// `useWindowDimensions` analog for Pebble. OPT-IN & ZERO-COST: an app that
// never imports it never ships it (the manifest prunes to the import closure —
// README tree-shaking), and it constructs NO host module and calls NO
// importNow, so it adds nothing to the boot floor for anyone.
//
// SUBSTRATE (verified against the on-disk watch host,
// build/devices/pebble/modules/global/):
//   * `watch` is the BARE Pebble compartment global (global.js — `class Pebble`
//     installed as `watch`, like `screen`/`Skin`). It is referenced DIRECTLY —
//     no import, no importNow. Its getters are backed by pebble-global.c:
//       - watch.model            (xs_global_model_get)          -> an INTEGER,
//         the WatchInfoModel enum as `(int)watch_info_get_model()`.
//       - watch.firmwareVersion  (xs_global_firmwareVersion_get)-> a FRESHLY
//         constructed { major, minor, patch } object on EVERY read
//         (`watch_info_get_firmware_version()` — a new xs object each call).
//       - watch.hour12           (xs_global_get_hour12)         -> a BOOLEAN,
//         the wearer's system clock style (`!clock_is_24h_style()`).
//   * `screen` is the jsx-runtime display record { width, height, round, color }
//     — render() fills width/height from the measured Application and
//     round/color from the host `screen` display global (pebble-display.js).
//
// ONE-SHOT, NOT REACTIVE (the whole point): every value here is CONSTANT for
// the life of the boot — model and firmware are fixed hardware/OS facts, the
// 12/24h setting and the panel geometry do not change while the app runs. So
// these return a PLAIN OBJECT, not a signal: there is nothing to subscribe to,
// no host callback to wire, and NOTHING TO CLEAN UP (contrast the sensor /
// battery / watch-event hooks, which DO subscribe and MUST onCleanup). Bind a
// Label to a field with a STATIC string, not a reactive thunk — a thunk would
// subscribe to nothing and could never re-fire.
//
// CALL INSIDE THE BUILD, NOT AT MODULE SCOPE: `screen` is only valid ONCE
// render() has started (jsx-runtime fills it from the Application's measured
// size — the same "after layout" caveat roundsafe documents). Call watchInfo()
// / useDisplayBounds() from a component body / the render() build callback, not
// at module top level, or the screen fields read 0.
//
// MISSING-`watch` GUARD: the device ALWAYS provides `watch`, but a bare
// reference to an ABSENT global throws ReferenceError, so watchInfo()
// typeof-probes it (mirroring localstorage's `typeof localStorage` guard) and
// degrades to zeros / false when it is absent — it never throws. The screen
// fields are always read (screen is a plain module object, present everywhere).
import { screen } from "runtime/jsx-runtime";

/**
 * The screen subset of {@link WatchInfo} — the static-per-boot display geometry,
 * read from the jsx-runtime `screen` record. What {@link useDisplayBounds} returns.
 */
export interface DisplayBounds {
	/** Display width in px (e.g. 260 on gabbro, 200 on emery). */
	width: number;
	/** Display height in px (e.g. 260 on gabbro, 228 on emery). */
	height: number;
	/** True on a CIRCULAR panel (gabbro) — inset content off the clipped corners. */
	round: boolean;
	/** True on a COLOR panel, false on a black/white one. */
	color: boolean;
}

/**
 * One-shot device + screen facts returned by {@link watchInfo} — the bare
 * `watch` global's getters merged with the {@link DisplayBounds} screen subset
 * into ONE flat object. Every field is constant for the life of the boot.
 */
export interface WatchInfo extends DisplayBounds {
	/** Hardware model id — the host WatchInfoModel enum as an integer. */
	model: number;
	/** Running firmware version, flattened once from `watch.firmwareVersion`. */
	firmware: {
		/** Major version component. */
		major: number;
		/** Minor version component. */
		minor: number;
		/** Patch version component. */
		patch: number;
	};
	/** True when the wearer's system clock is 12-hour style (`!24h`). */
	hour12: boolean;
	/** Wearer's system locale from `device.info.language` (e.g. "en_US"; "" when absent). */
	language: string;
	/**
	 * Hardware serial from `device.info.serialNumber` — "" when absent.
	 * QEMU reports it `undefined` (hostprobe receipt 2026-07-29), so expect a
	 * real value only on hardware.
	 */
	serialNumber: string;
}

/**
 * Read the display geometry — the RN `useWindowDimensions` analog.
 *
 *   const { width, height, round } = useDisplayBounds();
 *   <Label string={`${width}x${height}`} />
 *
 * A ONE-SHOT snapshot of the jsx-runtime `screen` record (width/height/round/
 * color), constant for the life of the boot — NOT a subscription, so there is
 * no cleanup and a STATIC Label string (not a reactive thunk) is correct. MUST
 * be called once render() has started (inside a component body / the build
 * callback), or the screen fields read 0 — see the module header.
 *
 * @returns the screen subset `{ width, height, round, color }` (a fresh object)
 */
export function useDisplayBounds(): DisplayBounds {
	return {
		width: screen.width,
		height: screen.height,
		round: screen.round,
		color: screen.color,
	};
}

/**
 * Read one-shot device + screen facts — the RN `Platform` analog.
 *
 *   const info = watchInfo();
 *   <Label string={`model ${info.model}`} />
 *   <Label string={`fw ${info.firmware.major}.${info.firmware.minor}.${info.firmware.patch}`} />
 *   <Label string={info.hour12 ? "12h" : "24h"} />
 *
 * Merges the bare `watch` global's getters (`model`, `firmwareVersion`,
 * `hour12`) with {@link useDisplayBounds}'s screen subset into ONE flat object.
 * Every field is constant per boot — this is a PURE one-shot: no subscription,
 * no cleanup (bind with a static Label string, not a thunk). `watch` is
 * typeof-probed: on the (device-impossible) absence of the global it degrades
 * to zeros / false instead of throwing. Call inside the render() build, not at
 * module scope (screen validity — see the module header).
 *
 * @returns the merged `{ model, firmware, hour12, width, height, round, color }`
 */
export function watchInfo(): WatchInfo {
	const bounds = useDisplayBounds();
	// device.info getters (language/serialNumber) — separately guarded from
	// `watch`: `device` is its own compartment global (typed only as the
	// "embedded:provider/builtin" module, so reach it via globalThis), and QEMU
	// serves serialNumber as undefined (hostprobe receipt) — coerce both to "".
	const di = (globalThis as { device?: { info?: { language?: string; serialNumber?: string } } })
		.device?.info;
	const language = (di && di.language) || "";
	const serialNumber = (di && di.serialNumber) || "";
	// typeof-probe the bare compartment global (mirrors localstorage's guard):
	// the device always provides `watch`, but an absent global must DEGRADE, not
	// ReferenceError. Single guard — when present, all three getters are present.
	if (typeof watch === "undefined")
		return {
			model: 0,
			firmware: { major: 0, minor: 0, patch: 0 },
			hour12: false,
			language,
			serialNumber,
			...bounds,
		};
	// firmwareVersion builds a FRESH object on every read (pebble-global.c) —
	// read it ONCE and flatten to a stable, self-owned { major, minor, patch }.
	const fw = watch.firmwareVersion;
	return {
		model: watch.model,
		firmware: { major: fw.major, minor: fw.minor, patch: fw.patch },
		hour12: watch.hour12,
		language,
		serialNumber,
		...bounds,
	};
}

/**
 * Pulse or force the backlight — `watch.light` (`xs_global_light`,
 * device-present per the hostprobe receipt 2026-07-29).
 *
 *   backlight();       // interaction pulse — lights up and times out on its
 *                      // own, exactly like a button press (app_light_enable_interaction)
 *   backlight(true);   // force ON until backlight(false) — drains the battery,
 *                      // use for short moments only
 *
 * No-op (never throws) when the `watch` global is absent.
 */
export function backlight(on?: boolean): void {
	if (typeof watch === "undefined") return;
	if (on === undefined) watch.light();
	else watch.light(on);
}

/**
 * Exit the app programmatically — `watch.exit` (`xs_global_exit`: optional
 * exit-reason int, then pops the whole window stack back to the launcher /
 * watchface). The "Quit" menu-item primitive. Device-present per the
 * hostprobe receipt (2026-07-29; presence-probed — calling it ends the app,
 * which is the point). No-op when the `watch` global is absent.
 */
export function exitApp(reason?: number): void {
	if (typeof watch === "undefined") return;
	if (reason === undefined) watch.exit();
	else watch.exit(reason);
}
