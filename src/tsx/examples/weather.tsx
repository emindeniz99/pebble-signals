// weather — a round-friendly weather FACE fed by the PHONE DATA CHANNEL. Market
// research (docs/market-notes.md) puts data-rich weather faces at #1 by hearts
// and names the phone data channel as the single missing unlock; this example
// IS that unlock, wired the already-proven way. Four Labels, four bindings, one
// effect each: city, a big temperature, a condition line, and a live HH:MM.
//
// THE CHANNEL — REUSED, not reinvented. `useConfig` (runtime/config) is the
// device-proven Clay round-trip (receipts: screenshots/config-roundtrip-gabbro
// .png, config-hook-gabbro.png). pkjs forwards the settings-page result string
// to the watch on AppMessage code 10000 (src/pkjs/index.ts) — the code
// `new Message({ keys: ["config"] })` assigns its FIRST key (host
// pebble-appmessage.js:28, `keys.map((v, i) => [v, 10000 + i])`) — and useConfig
// parses it, MERGES it over the current value and persists it. NO new protocol,
// NO pkjs change: that bridge is generic and already ships. Three properties
// this face leans on:
//   * PARTIAL payloads MERGE — drive only {"temp":"21°C"} and city/cond stay put.
//   * LAST-KNOWN weather survives a reboot (seeded from flash), which is exactly
//     what a real face wants when the phone is out of range.
//   * a malformed payload is IGNORED (try/catch around JSON.parse), never a crash.
//
// HONEST SCOPE — the phone-side weather FETCH is MOCK / DRIVEN. Nothing here
// calls a weather API: the driver hands pkjs the JSON and pkjs relays it. What
// this proves is the CHANNEL (phone -> watch -> reactive repaint), not a
// forecast. Productionizing is a PHONE-SIDE edit only — swap the driver for an
// XHR in src/pkjs/index.ts and send the same JSON on the same code 10000; the
// watch side below does not change. Do NOT reach for the watch-side `fetch()`
// instead: its Response/Headers allocations OOM the 32KB arena from a signal app
// (README gotcha 18a), so fetch-over-message — this shape — is the way.
//
// DRIVE IT (headless, no browser; pypkjs must be ALIVE, i.e. right after a
// `pebble install` — do NOT pkill it, that is drive.py's requirement, not this):
//   tools/config-drive.py gabbro '{"city":"Berlin","temp":"18°C","cond":"Partly cloudy"}'
// Until the first payload lands every field reads "--", the LABELLED FALLBACK —
// a dead channel is then visibly dead rather than blank (Rule 12). The three
// data Labels then repaint in place while the clock keeps ticking. NOTE: the
// fallback frame is only reproducible on a FLASH-CLEAN emulator, because
// useConfig PERSISTS — capture it BEFORE the first drive, or after
// tools/reset-emulator.sh.
//
// The unit rides in the PAYLOAD ("18°C" / "64°F" / "18") — the watch never
// converts, so one face serves both hemispheres. "°" is device-proven in Gothic
// (screenshots/compass-gabbro.png) but NOT in bold 42px Bitham; if the hero
// comes back digits-only, drive a bare "18" and carry the unit on the condition
// line — a missing glyph is SILENT (gotcha 20).
import { render } from "runtime/jsx-runtime";
import { useConfig } from "runtime/config";
import { useClock } from "runtime/clock";

const bg = new Skin({ fill: "black" });
// One Style per LINE (four) — each live Style is arena RAM, so this is the
// budget, not a palette (ultraface's per-colour Style set fxAbort'd at boot).
// Fonts from the verified table (gotcha 20): 42px is the ONLY bold Bitham cut.
const cityStyle = new Style({ font: "18px Gothic", color: "#aaaaaa" });
const tempStyle = new Style({ font: "bold 42px Bitham", color: "white" });
const condStyle = new Style({ font: "18px Gothic", color: "white" });
const timeStyle = new Style({ font: "bold 24px Gothic", color: "#ffaa55" });

// The payload contract — three strings, all pre-formatted phone-side (see the
// header): the watch renders them verbatim and does no unit maths.
interface Weather {
	city: string;
	temp: string;
	cond: string;
}

const two = (n: number) => (n < 10 ? "0" : "") + n;

render(
	() => {
		// BOTH hooks INSIDE the build so their onCleanup binds to the render root
		// (Rule 5): useConfig close()s the AppMessage channel, useClock removes its
		// tick listener. "--" is the fallback until the first payload arrives.
		const w = useConfig<Weather>({ city: "--", temp: "--", cond: "--" });
		// "minute", not "second": the face shows HH:MM, so the coarser host boundary
		// is both cheaper and exact (runtime/clock — one shared firmware timer).
		const now = useClock("minute");
		return (
			<Container left={0} right={0} top={0} bottom={0}>
				<Column>
					<Label style={cityStyle} string={() => w().city} />
					<Label style={tempStyle} string={() => w().temp} />
					<Label style={condStyle} string={() => w().cond} />
					<Label
						style={timeStyle}
						string={() => two(now().getHours()) + ":" + two(now().getMinutes())}
					/>
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: condStyle },
);
