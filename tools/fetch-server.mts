// The RECEIPT server for fetch-over-message (examples/fetchdemo.tsx,
// runtime/phonefetch): a real HTTP round trip with NO external egress.
//
// Why localhost works: the phone side of the channel is pypkjs, a process on
// THIS host (pebble-tool spawns it beside qemu), so its 127.0.0.1 is this
// server's. pypkjs only refuses loopback/RFC-1918 targets when it is started
// with --block-private-addresses — it mounts the blocking HTTP adapter behind
// that flag alone (pypkjs/javascript/xhr.py `prepare_xhr`) — and pebble-tool's
// emulator launcher never passes it (pebble_tool/sdk/emulator.py `_spawn_pypkjs`).
//
// Usage: node tools/fetch-server.mts [port]        (default 8787)
//   GET /hello -> 200 "hello from http <n>"  (n counts requests, so a second
//                                             press is visibly a second trip)
//   anything else -> 404 "not found"
import { createServer, type Server } from "node:http";

/** Build the receipt server (not listening yet — the CLI shim below binds it). */
export function makeServer(): Server {
	let n = 0; // request counter: the body changes per trip, so a stale frame shows
	return createServer((req, res) => {
		if (req.url === "/hello") {
			n++;
			res.writeHead(200, { "content-type": "text/plain" });
			res.end(`hello from http ${n}`);
			return;
		}
		res.writeHead(404, { "content-type": "text/plain" });
		res.end("not found");
	});
}

// CLI shim only: `import.meta.main` is false under the test runner, so importing
// makeServer() never binds a port (tests/phonefetch.test.mts binds port 0).
if (import.meta.main) {
	const port = Number(process.argv[2] ?? 8787);
	makeServer().listen(port, "127.0.0.1", () =>
		console.log(`fetch-server: http://127.0.0.1:${port}/hello`),
	);
}
