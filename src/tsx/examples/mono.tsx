// ⚠️ DEVICE-GATED (2026-07-31, honest — Rule 12): this face does NOT yet boot
// on gabbro QEMU — two clean reset+install cycles reached the empty launcher
// (crash-to-launcher class), the Column-box fix did not recover it, and the
// session's pebble-logs transport was too rotted to capture the fxAbort reason
// (0 heartbeats). Node gates are green (typecheck/lint/fontcheck). NEXT SESSION:
// fresh-emulator log capture -> read the abort -> fix -> receipt. Do not list
// on the store until then; mono/fuel share this gate (same sprint, unverified).
// mono — a STORE-READY MINIMALIST TYPOGRAPHY face.  CATEGORY: Watchfaces /
// Minimal.
// PITCH: "The time, set properly. One weight, one rule, nothing to read twice."
//
// WHY THIS ONE: minimalist type faces are the store's second-largest demand
// (Modern 11.9K hearts, DIN Time 5.4K — docs/market-notes.md) and they are this
// library's sweet spot: no assets, no sensors, no phone. What sells them is
// restraint executed exactly — one dominant weight, generous space around it, a
// single element that is not type.
//
// THE CHEAP-TICK DESIGN (the reason this face is also a granularity receipt):
// each line subscribes at the COARSEST boundary that can change it, so a tick
// only wakes the bindings that can actually move.
//   * time  -> useClock("minute")  — HH:MM cannot change faster than the minute,
//                                    so a "second" clock would be 59 wasted
//                                    repaints a minute on an always-on face.
//   * rule  -> useClock("hour")    — the daypart colour band below.
//   * date  -> useClock("day")     — repaints once, at midnight.
// Three subscriptions, ONE firmware timer: the host's tick service coalesces
// every listener onto a single wall-clock-aligned repeat and picks the finest
// subscribed interval (runtime/clock's header, host global.js `#schedule`), so
// the extra granularities cost listeners, not timers. The "hour"/"day" events
// are subscribe-proven on device (hostprobe receipt, 2026-07-29).
//
// THE SINGLE ACCENT: a 2px rule under the time whose colour follows the DAYPART
// (dawn amber -> midday white -> dusk orange -> night blue). It is the only
// non-type element and the only colour on the face; the type is pure white on
// black. BLACK/WHITE FIRST — point all four bands at `day` (or delete the
// three others' use) for a strictly monochrome face; that is a one-line edit,
// and nothing else on the face carries colour.
//
// ARENA (Rule 4): two Styles, five Skins, no Canvas, no sensors, no persistence
// — the leanest face in the catalog. Colours are palette-EXACT (each channel
// from {00,55,aa,ff}) so nothing dithers on the 64-colour panel. Fonts are from
// the verified table (gotcha 20 — an invalid font renders NOTHING, silently):
// `bold 49px Roboto` is the largest bold cut the firmware ships, which is why
// the hero is Roboto and not Bitham.
import { render, screen } from "runtime/jsx-runtime";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
// The daypart bands — the face's only colour. Palette-exact.
const dawn = new Skin({ fill: "#ffaa00" });
const day = new Skin({ fill: "#ffffff" });
const dusk = new Skin({ fill: "#ff5500" });
const night = new Skin({ fill: "#5555ff" });
// Boundaries, not a 24-slot table: comparisons cost no arena (Rule 4 — bytes,
// not objects). 05-10 dawn · 11-16 day · 17-21 dusk · 22-04 night.
const band = (h: number) => (h < 5 ? night : h < 11 ? dawn : h < 17 ? day : h < 22 ? dusk : night);

const timeStyle = new Style({ font: "bold 49px Roboto", color: "white" });
const dateStyle = new Style({ font: "14px Gothic", color: "#aaaaaa" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

render(
	() => {
		// All three hooks INSIDE the build so each onCleanup binds to the render
		// root and removes its tick listener on teardown (Rule 5).
		const now = useClock("minute");
		const hour = useClock("hour");
		const today = useClock("day");
		// Read INSIDE the build — `screen` is only valid once render() has started.
		// The rule is sized to sit just inside the hero's own width ("10:42" is
		// ~122px at 49px Roboto), a little tighter on the round panel.
		const rule = screen.round ? 112 : 124;
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column width={screen.width} height={screen.height}>
					<Label
						style={timeStyle}
						string={() => two(now().getHours()) + ":" + two(now().getMinutes())}
					/>
					{/* the one non-type element: a daypart-coloured rule (skin is a
					    REACTIVE prop, so the hour tick recolours it in place) */}
					<Content top={10} width={rule} height={2} skin={() => band(hour().getHours())} />
					<Label
						top={8}
						style={dateStyle}
						string={() => DAYS[today().getDay()] + " " + two(today().getDate())}
					/>
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: dateStyle },
);
