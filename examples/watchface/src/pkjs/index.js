// PKJS phone-side glue: lets the watch's fetch() proxy HTTP through the phone
// (@moddable/pebbleproxy — see signal-piu's docs/packaging.md, gotcha 18).
var moddableProxy = require("@moddable/pebbleproxy");
moddableProxy.log = true;
Pebble.addEventListener("ready", moddableProxy.readyReceived);
Pebble.addEventListener("appmessage", moddableProxy.appMessageReceived);
