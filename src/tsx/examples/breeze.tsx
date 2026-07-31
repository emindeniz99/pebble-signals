// ⚠️ DEVICE-GATED (2026-07-31, honest — Rule 12): this face does NOT yet boot
// on gabbro QEMU — two clean reset+install cycles reached the empty launcher
// (crash-to-launcher class), the Column-box fix did not recover it, and the
// session's pebble-logs transport was too rotted to capture the fxAbort reason
// (0 heartbeats). Node gates are green (typecheck/lint/fontcheck). NEXT SESSION:
// fresh-emulator log capture -> read the abort -> fix -> receipt. Do not list
// on the store until then; mono/fuel share this gate (same sprint, unverified).
// breeze — a STORE-READY WEATHER face.  CATEGORY: Watchfaces / Weather.
// PITCH: "Your city, your temperature, your sky — one calm screen you can read
// without stopping."
//
// WHY THIS ONE: weather is the store's #1 category by hearts (YWeather 18.8K,
// Real Weather 15.9K, TimeStyle 15.4K — docs/market-notes.md), and the gap that
// note names is ADOPTION EVIDENCE — faces a wearer can actually install, not
// more mechanism probes. So this is a FACE first: `weather.tsx` proved the
// channel (screenshots/weather-gabbro.png) and stays the minimal receipt for it;
// breeze is the submittable one — accent typography, a hero temperature with its
// unit on the same baseline, and a rule that carries the only colour.
//
// THE CHANNEL — REUSED, NOT REINVENTED. `useConfig` (runtime/config) is the
// device-proven Clay round-trip: pkjs relays the payload JSON on AppMessage code
// 10000 (src/pkjs/index.ts) and useConfig MERGES it over the current value and
// PERSISTS it. Three properties this face is designed around, all free:
//   * PARTIAL payloads MERGE — a temp-only refresh leaves city/cond alone.
//   * LAST-KNOWN weather survives a reboot (the value is seeded from flash),
//     which is exactly what a real face wants when the phone is out of range.
//   * a malformed payload is IGNORED (try/catch around JSON.parse), never a crash.
// HONEST SCOPE (Rule 12): the phone-side FETCH is a PHONE-SIDE edit — swap the
// driver for an XHR in src/pkjs/index.ts and send the same JSON on the same code;
// nothing below changes. Do NOT reach for watch-side `fetch()` instead: its
// Response/Headers allocations OOM the 32KB arena (gotcha 18a).
//
// DRIVE IT (headless, no browser; pypkjs must be ALIVE — i.e. right after a
// `pebble install`, do NOT pkill it):
//   tools/config-drive.py gabbro \
//     '{"city":"BERLIN","temp":"18","unit":"°C","cond":"Partly cloudy"}'
// Before the first payload every field reads its LABELLED fallback ("--" /
// "no data yet"), so a dead channel is visibly dead rather than blank. That
// fallback frame is only reproducible on a FLASH-CLEAN emulator (useConfig
// persists) — capture it BEFORE the first drive, or after tools/reset-emulator.sh.
// A settings PAGE for these keys is one command away — the worked example is
// `node tools/config-page.mts src/tsx/examples/weather/config-schema.mts`.
//
// DEGREE GLYPH (gotcha 20 — a missing glyph is SILENT): "°" is device-proven in
// Gothic (screenshots/compass-gabbro.png) but NOT in bold 42px Bitham. So the
// hero is DIGITS ONLY and the unit rides beside it in its own 18px Gothic Label —
// a `<Row>`, the same one-baseline idiom sloth.tsx has a receipt for. That is
// also why `unit` is its own payload key: one face serves "°C" and "°F" without
// the watch doing any unit maths (the phone pre-formats every string).
//
// KEEP `cond` SHORT (~16 chars — "Partly cloudy", not "Thunderstorms with hail"):
// a Piu Label does NOT wrap on this port, so a long condition runs into the
// round panel's bezel. Shortening it is a phone-side format decision, which is
// where every other string on this face is already decided; wrapping it would
// cost a `runtime/textflow` module AND a fixed-height box (see its ⚠️ note).
//
// ARENA (Rule 4): four Styles, two Skins, no Canvas, no retained state of our
// own — the lean end of the face budget. Colours are palette-EXACT (each channel
// from {00,55,aa,ff}), so nothing dithers on the 64-colour panel.
import { render, screen } from "runtime/jsx-runtime";
import { useConfig } from "runtime/config";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
// The ONE accent: a sky blue, palette-exact. It carries the city, the unit and
// the rule — nothing else on the face is coloured (that restraint IS the design).
const ACCENT = "#55aaff";
const accentBar = new Skin({ fill: ACCENT });

// One Style per LINE, and the accent Style is SHARED by the city and the unit —
// each live Style is arena RAM, so the count is the budget, not a palette
// (ultraface's per-colour Style set fxAbort'd at boot). Fonts from the verified
// table (gotcha 20): 42px is the ONLY bold Bitham cut.
const accentStyle = new Style({ font: "18px Gothic", color: ACCENT });
const tempStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const condStyle = new Style({ font: "18px Gothic", color: "white" });
const timeStyle = new Style({ font: "bold 24px Gothic", color: "#aaaaaa" });

// The payload contract — four strings, ALL pre-formatted phone-side. The watch
// renders them verbatim and converts nothing (see the header's unit note).
interface Weather {
	city: string;
	temp: string;
	unit: string;
	cond: string;
}

const two = (n: number) => (n < 10 ? "0" : "") + n;

render(
	() => {
		// BOTH hooks INSIDE the build so their onCleanup binds to the render root
		// (Rule 5): useConfig close()s the AppMessage channel, useClock removes its
		// tick listener. The seed doubles as the labelled no-data frame.
		const w = useConfig<Weather>({ city: "--", temp: "--", unit: "", cond: "no data yet" });
		// "minute", not "second": the face shows HH:MM, so the coarser host boundary
		// is both cheaper and exact (one shared firmware timer — runtime/clock).
		const now = useClock("minute");
		// Read INSIDE the build — `screen` is only valid once render() has started.
		// The rule is the widest element, so it is what has to clear the bezel: on
		// the round panel it stays inside the centre band, on rect it can run wider.
		const rule = screen.round ? 104 : 132;
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column width={screen.width} height={screen.height}>
					<Label style={accentStyle} string={() => w().city} />
					{/* hero temperature + its unit on ONE baseline (sloth.tsx's Row idiom) */}
					<Row>
						<Label style={tempStyle} string={() => w().temp} />
						<Label style={accentStyle} string={() => w().unit} />
					</Row>
					{/* the accent rule — the only non-type element on the face */}
					<Content top={6} width={rule} height={2} skin={accentBar} />
					<Label top={6} style={condStyle} string={() => w().cond} />
					<Label
						top={10}
						style={timeStyle}
						string={() => two(now().getHours()) + ":" + two(now().getMinutes())}
					/>
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: condStyle },
);
