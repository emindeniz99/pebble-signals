// PKJS phone-side glue: lets the watch's fetch() proxy HTTP through the phone
// (@moddable/pebbleproxy — see signal-piu's docs/packaging.md, gotcha 18).
var moddableProxy = require("@moddable/pebbleproxy");
moddableProxy.log = true;
Pebble.addEventListener("ready", moddableProxy.readyReceived);
Pebble.addEventListener("appmessage", moddableProxy.appMessageReceived);

// Config-page bridge — the phone half of the `useConfig` hook. Without these
// two listeners the settings page can never open and a saved page never
// reaches the watch, so a scaffolded app that adopts the documented hook was
// dead on arrival: the package's own src/pkjs/index.ts carries them, but that
// file is NOT part of a consumer build.
//
// The flow: the Pebble app asks for the settings page (showConfiguration), the
// user saves, and the RAW response string is forwarded to the watch under
// AppMessage key 10000 — the code the watch-side `pebble/message` Message
// assigns its FIRST declared key (`new Message({ keys: ["config"] })`). The
// watch owns parsing. Clay slots in unchanged: its generated page URL goes in
// openURL and its response arrives the same way.
Pebble.addEventListener("showConfiguration", function () {
	// Replace this with YOUR hosted (or Clay-generated) settings page. On the
	// emulator the placeholder is fine: tools/config-drive.py catches the
	// openURL broadcast and answers directly, no browser involved.
	Pebble.openURL("https://example.invalid/settings.html");
});
Pebble.addEventListener("webviewclosed", function (e) {
	if (!e.response) return; // cancelled — keep the current settings
	Pebble.sendAppMessage({ 10000: decodeURIComponent(e.response) });
});

// Dev-log bridge: watch-side strings sent under key 10000 with the "spdev:"
// marker are logged HERE, phone-side — the one channel that shows up in
// `pebble logs` on RELEASE firmware (JS trace on the watch is a no-op there).
// The marker keeps ordinary AppMessage traffic (fetch proxy, config) out of
// the tap.
Pebble.addEventListener("appmessage", function (e) {
	var v = e.payload && e.payload["10000"];
	if (typeof v === "string" && v.indexOf("spdev:") === 0) console.log(v);
});
