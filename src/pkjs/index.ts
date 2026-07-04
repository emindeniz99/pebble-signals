// PKJS (phone-side) entry — wires @moddable/pebbleproxy to the Pebble app
// events so the WATCH's fetch() can proxy HTTP through the phone (README
// gotcha 18). Runs in the Pebble mobile app's CommonJS sandbox — build.mts
// compiles this to index.js with tsconfig.pkjs.json. Types live in pkjs.d.ts;
// keep this file logic-free glue.
import moddableProxy = require("@moddable/pebbleproxy");

moddableProxy.log = true;
Pebble.addEventListener("ready", moddableProxy.readyReceived);
Pebble.addEventListener("appmessage", moddableProxy.appMessageReceived);
