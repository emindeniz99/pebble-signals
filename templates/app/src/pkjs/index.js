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

// Fetch-over-message bridge — the phone half of the `usePhoneFetch` /
// `usePhoneFetchText` hooks (runtime/phonefetch). Without it a scaffolded app
// that adopts the documented hook is dead on arrival, exactly like the config
// bridge above. The watch sends "<id> <url>" on AppMessage code 10100; we run
// the HTTP HERE and answer "<id> <status> <body>" on 10101, so nothing but a
// string ever enters the watch's 32KB arena (unlike watch-side fetch()).
// Failures are answered, never swallowed: status 0 carries the reason, an
// oversized body is clipped LOUD, and an undeliverable reply is retried short
// so the watch's promise always settles.
var SP_FETCH_BODY_MAX = 1024; // chars — AppMessage dictionaries are small
function spFetchReply(id, status, body) {
	var keep = SP_FETCH_BODY_MAX - 24; // room for the marker, so the field stays <= the cap
	if (body.length > keep) body = body.slice(0, keep) + "...[+" + (body.length - keep) + " chars cut]";
	Pebble.sendAppMessage({ 10101: id + " " + status + " " + body }, undefined, function (err) {
		console.log("phonefetch: reply " + id + " undeliverable (" + err + ")");
		Pebble.sendAppMessage({ 10101: id + " 0 reply undeliverable" }); // cannot recurse
	});
}
Pebble.addEventListener("appmessage", function (e) {
	var req = e.payload && e.payload["10100"];
	if (typeof req !== "string") return; // not a fetch request
	var sp = req.indexOf(" ");
	if (sp < 0) return console.log('phonefetch: malformed request "' + req + '"');
	var id = req.slice(0, sp);
	var xhr = new XMLHttpRequest();
	// `loadend` fires for EVERY outcome — and pypkjs (the emulator's PKJS) does
	// not fire `error` at all on a connection failure, so an onerror-shaped
	// handler would go silent exactly where it matters.
	xhr.onloadend = function () {
		var status = Number(xhr.status) || 0;
		var body = typeof xhr.responseText === "string" ? xhr.responseText : "";
		if (!status && !body) body = "request failed: " + (xhr.statusText || "no response");
		spFetchReply(id, status, body);
	};
	try {
		xhr.open("GET", req.slice(sp + 1), true);
		xhr.timeout = 15000; // after open(), before send() — a hung request must still answer
		xhr.send();
	} catch (err) {
		spFetchReply(id, 0, "request rejected: " + err);
	}
});
