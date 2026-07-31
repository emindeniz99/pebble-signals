// fetchdemo — the fetch-over-message receipt: a REAL HTTP round trip driven
// from a normal reactive app. SELECT sends "<id> <url>" to the phone on
// AppMessage code 10100 (runtime/phonefetch); src/pkjs/index.ts performs the
// GET with XMLHttpRequest and answers "<id> <status> <body>" on 10101, which
// this screen renders verbatim. Nothing but that string ever enters the 32KB
// arena — which is the whole point: watch-side fetch() OOMs from a signal app
// (handbook gotcha 18a), so examples/fetchtest.tsx has to be BARE while this one
// is an ordinary reactive screen.
//
// THE SERVER (no external egress needed): run tools/fetch-server.mts on the
// SAME HOST as the emulator — pypkjs is a host process, so its 127.0.0.1 is
// this server's, and pebble-tool never starts pypkjs with
// --block-private-addresses, the flag that would reject loopback.
//   node tools/fetch-server.mts &          # GET /hello -> "hello from http N"
//   pnpm run build -- --app fetchdemo && pebble install --emulator gabbro
// pypkjs must be ALIVE (it is right after `pebble install`; do NOT pkill it —
// that is drive.py's requirement, not this one). Press SELECT with
// `pebble emu-button select`.
//
// Both fields read "--" until the first press — the LABELLED FALLBACK, so a
// dead channel is visibly dead rather than blank (Rule 12). A press shows "..."
// while in flight, then the status and body. A failure is never silent: an HTTP
// or network failure comes back as status 0 with the reason as the body, and a
// request that could not even be SENT (closed outbox) rejects and prints that
// instead. The imperative usePhoneFetchText is what a press-to-fetch screen
// wants; usePhoneFetch(url) is the reactive form and fires immediately.
//
// TIMING (expected, not a bug): the outbox is closed until the pkjs handshake
// completes and again between a write and its ack (pebble-appmessage.c), so a
// press in the first seconds after install — or a second press on top of an
// in-flight one — can show "0 / send failed: Error: not writable". Give it a
// few seconds and press once at a time; that message IS the loud-failure
// contract working (devlog.tsx delays its first send 500ms for the same reason).
// Buttons only — QEMU touch crashes the firmware (gotcha 2):
//   SELECT = fetch once.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { usePhoneFetchText } from "runtime/phonefetch";

const bg = new Skin({ fill: "black" });
const titleStyle = new Style({ font: "bold 24px Gothic", color: "white" });
const bodyStyle = new Style({ font: "18px Gothic", color: "white" });

// loopback on the HOST that runs pypkjs — see the header
const URL = "http://127.0.0.1:8787/hello";

const [status, setStatus] = useState("--");
const [body, setBody] = useState("--");

render(
	() => {
		// INSIDE the build so onCleanup(close) binds to the render root (Rule 5)
		const fetchText = usePhoneFetchText();
		return (
			<Container
				left={0}
				right={0}
				top={0}
				bottom={0}
				focus={true}
				onPressSelect={() => {
					setStatus("...");
					setBody("...");
					fetchText(URL).then(
						(r) => {
							setStatus(String(r.status));
							setBody(r.body);
						},
						// unsendable request (closed outbox / oversized URL): show it
						(e) => {
							setStatus("0");
							setBody(`send failed: ${e}`);
						},
					);
				}}
			>
				<Column>
					<Label style={titleStyle} string="phone fetch" />
					<Label style={bodyStyle} string={() => `status ${status()}`} />
					<Label style={bodyStyle} string={() => body()} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: bodyStyle },
);
