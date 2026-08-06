// PKJS (phone-side) entry — wires @moddable/pebbleproxy to the Pebble app
// events so the WATCH's fetch() can proxy HTTP through the phone (handbook
// gotcha 18). Runs in the Pebble mobile app's CommonJS sandbox — build.mts
// compiles this to index.js with tsconfig.pkjs.json. Types live in pkjs.d.ts;
// keep this file logic-free glue.
import moddableProxy = require("@moddable/pebbleproxy");

moddableProxy.log = true;
Pebble.addEventListener("ready", moddableProxy.readyReceived);
Pebble.addEventListener("appmessage", moddableProxy.appMessageReceived);

// Dev-log bridge (examples/devlog.tsx): watch-side strings arriving under
// key 10000 with the "spdev:" marker are logged HERE, phone-side — the one
// channel that shows up in `pebble logs` on RELEASE firmware (JS trace on
// the watch is a no-op there). The marker keeps ordinary AppMessage traffic
// (fetch proxy, config) out of the tap.
Pebble.addEventListener("appmessage", (e) => {
	const v = e.payload && e.payload["10000"];
	if (typeof v === "string" && v.indexOf("spdev:") === 0) console.log(v);
});

// Config-page flow (Clay-style, generic): when the settings page closes, the
// RAW result string is forwarded to the watch under one well-known
// AppMessage key — 10000, the code the watch-side `pebble/message` Message
// assigns its FIRST declared key (`new Message({keys: ["config"]})`); the
// watch owns parsing (examples/config.tsx). Clay would slot in here
// unchanged: its generated page URL goes in openURL, its response arrives
// the same way. Headless emulator driving: tools/config-drive.py.
Pebble.addEventListener("showConfiguration", () => {
	// A real deployment opens its hosted (or Clay-generated) settings page.
	// The URL is a placeholder on the emulator: the headless driver catches
	// the openURL broadcast and answers directly, no browser involved.
	Pebble.openURL("https://example.invalid/pebble-signals-config.html");
});
Pebble.addEventListener("webviewclosed", (e) => {
	if (!e.response) return; // cancelled — keep current settings
	Pebble.sendAppMessage({ 10000: decodeURIComponent(e.response) });
});

// Fetch-over-message (runtime/phonefetch) — the PHONE does the HTTP. The watch
// sends "<id> <url>" on AppMessage code 10100; we run the request HERE with the
// sandbox's XMLHttpRequest and answer "<id> <status> <body>" on 10101. Dedicated
// codes, deliberately clear of 10000 (config / dev-log) and of the proxy's
// 15000+ range — see the runtime/phonefetch header for the routing reason.
// This is the load-bearing HTTP path: nothing but a string ever enters the
// watch's 32KB arena, unlike watch-side fetch() (handbook gotcha 18a).
const FETCH_REQ = "10100"; // inbound: e.payload is keyed by the code as a STRING
const FETCH_RES = 10101; // outbound: sendAppMessage keys are numeric
// Body cap, in CHARS, enforced here because only the phone has the whole body.
// AppMessage is small (the SDK guarantees only a 124-byte inbox; the host opens
// the real, larger runtime maximum) — so clip, and clip LOUD: a truncated body
// ENDS with the dropped count, never just stops (Rule 12).
const FETCH_BODY_MAX = 1024;
// One reply per request, always. If the watch cannot be given it (an oversized
// dictionary, a dead link), sendAppMessage's failure callback says so in
// `pebble logs` AND sends a short status-0 line instead — a watch promise that
// never settles is the one failure mode this channel must not have. The retry
// carries no failure callback, so it cannot recurse.
const fetchReply = (id: string, status: number, body: string) => {
	const keep = FETCH_BODY_MAX - 24; // room for the marker, so the field stays <= the cap
	if (body.length > keep) body = `${body.slice(0, keep)}...[+${body.length - keep} chars cut]`;
	Pebble.sendAppMessage({ [FETCH_RES]: `${id} ${status} ${body}` }, undefined, (e) => {
		console.log(`phonefetch: reply ${id} undeliverable (${e})`);
		Pebble.sendAppMessage({ [FETCH_RES]: `${id} 0 reply undeliverable` });
	});
};
Pebble.addEventListener("appmessage", (e) => {
	const req = e.payload && e.payload[FETCH_REQ];
	if (typeof req !== "string") return; // not a fetch request — leave it alone
	const sp = req.indexOf(" ");
	if (sp < 0) {
		// no id to answer with: the only honest move is to say it here
		console.log(`phonefetch: malformed request "${req}"`);
		return;
	}
	const id = req.slice(0, sp);
	const url = req.slice(sp + 1);
	const xhr = new XMLHttpRequest();
	// `loadend` (not `load` + `error`): it is the ONE event that fires for every
	// outcome — and pypkjs, the emulator's PKJS, does NOT fire `error` at all on a
	// connection failure (javascript/xhr.py `_do_send` sets status 0 / statusText
	// and only triggers loadend), so an onerror-shaped handler would go silent
	// exactly where the receipt matters.
	xhr.onloadend = () => {
		// status is 0 (or absent) when the request never completed; then the
		// reason lives in statusText — say that rather than send an empty body.
		const status = Number(xhr.status) || 0;
		let body = typeof xhr.responseText === "string" ? xhr.responseText : "";
		if (!status && !body) body = `request failed: ${xhr.statusText || "no response"}`;
		fetchReply(id, status, body);
	};
	try {
		xhr.open("GET", url, true);
		xhr.timeout = 15000; // after open(), before send() — a hung request must still answer
		xhr.send();
	} catch (err) {
		// a bad URL / a sandbox that refused the request: answer, do not swallow
		fetchReply(id, 0, `request rejected: ${err}`);
	}
});
