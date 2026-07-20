// runtime/fetch receipt — a reactive HTTP GET on the watch itself via useFetch,
// which composes createResource over the host `fetch` global. The single status
// Label binds a thunk over res.loading()/res.error()/res.data(), so it repaints
// through loading -> data (or -> error) on its own. SELECT re-fetches.
//
// ================= LEAN ON PURPOSE — this is the arena-tight combo =============
// This app uses the SIGNAL RUNTIME (render + useFetch pull in signals /
// createResource) TOGETHER WITH `fetch` — the exact pairing README gotcha 18a
// measured OOMing the firmware-fixed 32KB arena ("fxAbort memory full"): watch-side
// fetch proxies through the phone (@moddable/pebbleproxy) and a live Response is a
// heavy transient. It fits here ONLY because the app is minimal — ONE resource, a
// handful of Labels, ONE reactive binding (loading/error/data are folded into a
// single thunk to hold the effect count, hence the arena pressure, down). Do NOT
// grow it: more signals + a fetch is how you tip it over.
//
// For anything beyond a tiny payload on a bare screen, prefer FETCH-OVER-MESSAGE:
// do the XHR PHONE-SIDE in pkjs (src/pkjs), send the decoded result back as a
// STRING AppMessage, and feed createResource from useMessage (runtime/message) —
// no Response is ever allocated in the arena. See examples/fetchtest.tsx for the
// BARE (no-runtime) fetch demo that gives fetch the whole arena.
//
// Buttons only — QEMU touch crashes the firmware (gotcha 2): SELECT = re-fetch.
// The endpoint/shape below are ILLUSTRATIVE; as with fetchtest.tsx a live
// round-trip could not be completed in this dev sandbox (unstable emulator/pypkjs)
// — the wiring is the documented-correct approach; verify on steadier emu or real
// hardware. Build: APP=fetch ./build.sh
// ==============================================================================
import { render } from "runtime/jsx-runtime";
import { useFetch } from "runtime/fetch";

// the small JSON we expect back, e.g. { "value": "..." } (illustrative shape)
interface Thing {
	value: string;
}

const bg = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "bold 24px Gothic", color: "white" });
const bodyStyle = new Style({ font: "18px Gothic", color: "white" });
const hintStyle = new Style({ font: "18px Gothic", color: "#AAAAAA" });

render(
	() => {
		// one reactive resource; default parse decodes JSON into `Thing`. Fetches
		// immediately on launch; SELECT calls refetch().
		const res = useFetch<Thing>("https://api.example.com/thing.json");
		return (
			<Container left={0} right={0} top={0} bottom={0} focus={true} onPressSelect={() => res.refetch()}>
				<Column>
					<Label style={titleStyle} string="useFetch" />
					{/* ONE binding covers all three states (leanness — see header) */}
					<Label
						style={bodyStyle}
						string={() =>
							res.loading()
								? "loading…"
								: res.error()
									? "error: " + String(res.error())
									: "value: " + String(res.data()?.value ?? "(empty)")
						}
					/>
					<Label style={hintStyle} string="SELECT = re-fetch" />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: bodyStyle },
);
