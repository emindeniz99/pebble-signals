// ⚠️ DEVICE-GATED (2026-07-31, honest — Rule 12): this face does NOT yet boot
// on gabbro QEMU — two clean reset+install cycles reached the empty launcher
// (crash-to-launcher class), the Column-box fix did not recover it, and the
// session's pebble-logs transport was too rotted to capture the fxAbort reason
// (0 heartbeats). Node gates are green (typecheck/lint/fontcheck). NEXT SESSION:
// fresh-emulator log capture -> read the abort -> fix -> receipt. Do not list
// on the store until then; mono/fuel share this gate (same sprint, unverified).
// fuel — a STORE-READY BATTERY face.  CATEGORY: Watchfaces / Battery.
// PITCH: "Time on top, charge underneath — the one number you check before you
// leave the house, in a colour you can read from arm's length."
//
// WHY THIS ONE: battery insight is a top-hearted utility category (Battery+ 6.4K
// — docs/market-notes.md calls battery "THE purchase driver"), and it is fully in
// reach today: useBattery is a device-receipted hook (screenshots/battery-gabbro
// .png) and the dial is one `runtime/draw` Canvas. `battery.tsx` stays the
// two-Label mechanism receipt; fuel is the submittable face built on it.
//
// THE READING (runtime/battery): ONE shared host Battery, SEEDED at construction
// — the battery host supports an immediate probe (unlike accel/compass), so the
// FIRST paint shows the true charge, never a placeholder. `percent` is 0..100
// (an integer, Rule 7 — not a 0..1 fraction), `charging` is is_charging, and
// `plugged` can be true with `charging` false (full, still on the cable). Read
// the HOOK's getter, never the host `sample()` — that one is a one-shot gate.
// Drive it headlessly, no wrist needed:
//   pebble emu-battery --percent 72                # the normal frame
//   pebble emu-battery --percent 15                # the LOW colour shift
//   pebble emu-battery --percent 15 --charging     # the CHARGING colour shift
//
// THE COLOUR SHIFT IS THE FACE: charge state is carried by COLOUR AND POSITION
// (arc length), never colour alone — the arc, and the percent inside it, turn
// green while charging, red at or below 20%, and sit calm blue otherwise, so the
// state reads at a glance on an always-on panel and still reads without colour.
//
// WHY A RAW `Canvas` AND NOT `Gauge` (Rule 1 — the tradeoff, stated): the
// catalog's Gauge is exactly this — a square Canvas painting a track arc, a
// value arc and a centred label — but its `fill` is a plain `Color` captured at
// construction, and a charge-state colour SHIFT is the whole point of this face.
// Painting the two arcs here keeps the colour inside `paint`, where the Canvas
// effect tracks it (a `battery()` read in `paint` auto-subscribes: state change
// -> effect -> invalidate -> repaint, no bind wiring), and costs one module LESS
// than Gauge, which composes the same `runtime/draw` anyway. The centring
// heuristic below is Gauge's, on purpose — same font, same numbers.
//
// ARENA (Rule 4): three Styles, one Skin, ONE Port (never one per shape —
// gotcha 16), no retained geometry. The Canvas-inside-a-Column layout is the
// shape meter.tsx has a receipt for on both panels; the Column is NOT moveBy'd,
// which is the case gotcha 24 warns about. Colours are palette-EXACT (each
// channel from {00,55,aa,ff}) so nothing dithers on the 64-colour panel.
import { render, screen } from "runtime/jsx-runtime";
import { Canvas } from "runtime/draw";
import { useBattery } from "runtime/battery";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
const timeStyle = new Style({ font: "bold 42px Bitham", color: "white" });
// The dial's centred percent. `g.text(str, style, COLOR, x, y)` passes the
// colour EXPLICITLY (Piu's drawString colour arg overrides the Style's), so this
// ONE Style backs all three states — a Style per colour is arena RAM we do not
// have to spend (ultraface's lesson).
const pctStyle = new Style({ font: "bold 24px Gothic", color: "white" });
const stateStyle = new Style({ font: "18px Gothic", color: "#aaaaaa" });

// Palette-exact state colours. Green = charging, red = low, blue = the calm
// default (a data colour, deliberately not the white the type wears).
const CHARGING = "#55ff55";
const LOW = "#ff5555";
const OK = "#55aaff";
const TRACK = "#555555";
// 20% is the firmware's own low-battery threshold — the same line the wearer
// already knows from the system warning, so the face never disagrees with it.
const LOW_AT = 20;
// A bottom-gap dial: 135° (0 = 3 o'clock, clockwise) through 270°, the same
// sweep the catalog's Gauge defaults to.
const START = 135;
const SWEEP = 270;
// Gauge's centring heuristic for one line of "24px Gothic" — ~7px per glyph
// half-width, ~12px font half-height. draw.ts's `text` positions from the
// top-left, so subtracting these from the dial centre lands "72%" on it. Good
// enough for a percent string; no per-string measure exists on this port.
const HALF_CHAR_W = 7;
const FONT_HALF = 12;

const two = (n: number) => (n < 10 ? "0" : "") + n;

render(
	() => {
		// Both hooks INSIDE the build so their onCleanup binds to the render root
		// (Rule 5): the shared host Battery is close()d and the tick listener
		// removed on teardown. ONE useBattery serves the dial AND the state line —
		// N readers share one instance and one signal.
		const battery = useBattery();
		// "minute", not "second": the face shows HH:MM, so the coarser host
		// boundary is both cheaper and exact (runtime/clock, one shared timer).
		const now = useClock("minute");
		// Read INSIDE the build — `screen` is only valid once render() has started.
		// The dial is the widest element; it stays inside the round panel's centre
		// band and grows a little on the taller rect one.
		const dial = screen.round ? 108 : 96;
		const thickness = screen.round ? 9 : 8;
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column width={screen.width} height={screen.height}>
					<Label
						style={timeStyle}
						string={() => two(now().getHours()) + ":" + two(now().getMinutes())}
					/>
					<Canvas
						top={4}
						width={dial}
						height={dial}
						fill="black"
						paint={(g) => {
							// ONE read of the hook per frame: `paint` re-runs in a
							// non-drawing tracking pass on every reactive change, so this
							// read is what subscribes the canvas to the battery.
							const b = battery();
							const c = dial / 2;
							const pct = b.percent;
							const col = b.charging ? CHARGING : pct <= LOW_AT ? LOW : OK;
							// track first, value arc over it — a 0% charge draws track only
							g.arc(c, c, c, START, START + SWEEP, thickness, TRACK);
							if (pct > 0) g.arc(c, c, c, START, START + SWEEP * (pct / 100), thickness, col);
							const s = pct + "%";
							g.text(s, pctStyle, col, c - s.length * HALF_CHAR_W, c - FONT_HALF);
						}}
					/>
					{/* the same three states battery.tsx names, in the face's voice */}
					<Label
						top={2}
						style={stateStyle}
						string={() =>
							battery().charging ? "CHARGING" : battery().plugged ? "ON POWER" : "ON BATTERY"
						}
					/>
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: stateStyle },
);
