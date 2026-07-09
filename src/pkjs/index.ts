// PKJS (phone-side) entry — wires @moddable/pebbleproxy to the Pebble app
// events so the WATCH's fetch() can proxy HTTP through the phone (README
// gotcha 18). Runs in the Pebble mobile app's CommonJS sandbox — build.mts
// compiles this to index.js with tsconfig.pkjs.json. Types live in pkjs.d.ts;
// keep this file logic-free glue.
import moddableProxy = require("@moddable/pebbleproxy");

moddableProxy.log = true;
Pebble.addEventListener("ready", moddableProxy.readyReceived);
Pebble.addEventListener("appmessage", moddableProxy.appMessageReceived);

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
	Pebble.openURL("https://example.invalid/signal-piu-config.html");
});
Pebble.addEventListener("webviewclosed", (e) => {
	if (!e.response) return; // cancelled — keep current settings
	Pebble.sendAppMessage({ 10000: decodeURIComponent(e.response) });
});
