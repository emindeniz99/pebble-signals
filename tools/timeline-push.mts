// Timeline pin pusher for a SERVER — the half of the timeline story that has no
// phone in it. `src/pkjs/timeline.ts` pushes from the wearer's phone with a
// token minted by `Pebble.getTimelineToken`; a backend that already HAS a
// wearer's token (the app sent it there once) pushes the identical request from
// anywhere, which is what makes a timeline populate while the watch is asleep.
// Same endpoint, same headers, same validation — this file imports the pin
// contract and the pure request builders from the pkjs module rather than
// restating them, so a change to the API surface lands in both pushers at once.
//
// Usage:
//   node tools/timeline-push.mts insert <pin.json> --token <token> [--api <root>] [--dry-run]
//   node tools/timeline-push.mts delete <pin-id>   --token <token> [--api <root>] [--dry-run]
//
// `--dry-run` prints the exact request (with the token REDACTED — a dry run's
// output is the thing people paste into an issue or a CI log, and a leaked
// timeline token is a leaked wearer) and sends nothing. It is the only mode
// that needs no network, so it is also how the tests exercise the CLI end to
// end.
//
// Endpoint, headers and pin limits are documented and cited in
// src/pkjs/timeline.ts; docs/timeline.md explains where a token comes from.
import { readFileSync } from "node:fs";
import {
	badPin,
	badPinId,
	pinHeaders,
	TIMELINE_API_ROOT,
	type TimelinePin,
	type TimelineResponse,
	userPinUrl,
} from "../src/pkjs/timeline.ts";

/** One HTTP request, fully built — the unit both `--dry-run` and `send` take. */
export interface PinRequest {
	method: "PUT" | "DELETE";
	url: string;
	headers: Record<string, string>;
	body: string | null;
}

/** Parsed command line. `api` is resolved here so `main` never re-defaults it. */
export interface PushArgs {
	cmd: "insert" | "delete";
	/** insert: path to the pin JSON. delete: the pin id. */
	target: string;
	token: string;
	api: string;
	dry: boolean;
}

/** Seams the tests replace: no file system, no network, no stdout. */
export interface PushDeps {
	send?: (req: PinRequest) => Promise<TimelineResponse>;
	read?: (path: string) => string;
	log?: (line: string) => void;
	/** `Date.now()` stand-in, so the pin time window is testable. */
	now?: number;
}

const USAGE =
	"usage: node tools/timeline-push.mts insert <pin.json> --token <t> [--api <root>] [--dry-run]\n" +
	"       node tools/timeline-push.mts delete <pin-id>   --token <t> [--api <root>] [--dry-run]";

/**
 * Parse argv (already sliced past `node <script>`). Throws with the usage text
 * on anything it does not understand — an unknown flag is a typo'd `--token`
 * often as not, and silently pushing with a missing token would spend a real
 * API call to learn that. Pure.
 */
export function parseArgs(argv: readonly string[]): PushArgs {
	const [cmd, target, ...rest] = argv;
	if (cmd !== "insert" && cmd !== "delete") throw new Error(`unknown command "${cmd}"\n${USAGE}`);
	if (!target || target.startsWith("--"))
		throw new Error(`${cmd} needs a ${cmd === "insert" ? "pin JSON path" : "pin id"}\n${USAGE}`);
	let token = "";
	let api = TIMELINE_API_ROOT;
	let dry = false;
	for (let i = 0; i < rest.length; i++) {
		const flag = rest[i];
		if (flag === "--dry-run") dry = true;
		else if (flag === "--token") token = rest[++i] ?? "";
		else if (flag === "--api") api = rest[++i] ?? "";
		else throw new Error(`unknown option "${flag}"\n${USAGE}`);
	}
	if (!token) throw new Error(`--token is required\n${USAGE}`);
	if (!api) throw new Error(`--api needs a value\n${USAGE}`);
	return { cmd, target, token, api, dry };
}

/**
 * The request as a human reads it, token replaced. Not `JSON.stringify` of the
 * headers: the point of a dry run is to SEE the wire shape, and the point of the
 * redaction is that this text is safe to paste anywhere. Pure.
 */
export function describeRequest(req: PinRequest): string {
	const lines = [`${req.method} ${req.url}`];
	for (const name of Object.keys(req.headers))
		lines.push(`${name}: ${name === "X-User-Token" ? "<redacted>" : req.headers[name]}`);
	if (req.body !== null) lines.push("", req.body);
	return lines.join("\n");
}

/** The real transport. Node's global fetch — no dependency, no agent to leak. */
const httpSend = async (req: PinRequest): Promise<TimelineResponse> => {
	const res = await fetch(req.url, {
		method: req.method,
		headers: req.headers,
		body: req.body === null ? undefined : req.body,
	});
	return { status: res.status, body: await res.text() };
};

/**
 * The CLI body, exported so the tests drive it in-process with `send`/`read`
 * stubbed instead of only through a child process. Returns the request it built
 * (sent, or printed under `--dry-run`); throws on a bad pin, an unreadable file
 * or a non-2xx status — nothing is "mostly pushed".
 */
export async function main(argv: readonly string[], deps: PushDeps = {}): Promise<PinRequest> {
	const { cmd, target, token, api, dry } = parseArgs(argv);
	const read = deps.read ?? ((path: string) => readFileSync(path, "utf8"));
	const log = deps.log ?? ((line: string) => console.log(line));
	const send = deps.send ?? httpSend;

	let req: PinRequest;
	if (cmd === "insert") {
		let pin: TimelinePin;
		try {
			pin = JSON.parse(read(target)) as TimelinePin;
		} catch (err) {
			// the path AND the reason: "unexpected token }" alone has cost hours
			throw new Error(`timeline-push: cannot read pin ${target}: ${(err as Error).message}`);
		}
		const problems = badPin(pin, deps.now);
		if (problems.length > 0)
			throw new Error(`timeline-push: ${target} is not a valid pin:\n  ${problems.join("\n  ")}`);
		req = {
			method: "PUT",
			url: userPinUrl(pin.id, api),
			headers: pinHeaders(token, true),
			body: JSON.stringify(pin),
		};
	} else {
		// the id rule insert enforces, enforced here too: an id the API cannot have
		// stored names no pin, so the DELETE would spend a call to learn nothing —
		// and the two halves of this tool must not disagree about what an id is
		const problem = badPinId(target);
		if (problem) throw new Error(`timeline-push: ${problem}`);
		req = {
			method: "DELETE",
			url: userPinUrl(target, api),
			headers: pinHeaders(token, false),
			body: null,
		};
	}

	if (dry) {
		log(describeRequest(req));
		log("dry run — nothing sent");
		return req;
	}
	const res = await send(req);
	// 2xx or it did not happen. The API's error code (INVALID_USER_TOKEN,
	// RATE_LIMIT_EXCEEDED, …) is in the body, so the body IS the message.
	if (res.status < 200 || res.status >= 300)
		throw new Error(`timeline-push: ${req.method} ${req.url} -> ${res.status} ${res.body}`);
	log(`timeline-push: ${req.method} ${req.url} -> ${res.status}`);
	return req;
}

/* node:coverage disable */
// CLI shim only: `import.meta.main` is false under the test runner, so this
// branch can never be taken in-process. main() above is covered directly, and
// tests/timeline.test.mts additionally SPAWNS this file to prove the shim.
if (import.meta.main)
	main(process.argv.slice(2)).then(undefined, (e: Error) => {
		console.error(e.message);
		process.exit(1);
	});
/* node:coverage enable */
