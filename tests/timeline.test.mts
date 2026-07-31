// timeline suite — the pin contract (src/pkjs/timeline.ts) and the server-side
// pusher (tools/timeline-push.mts). Neither half can be proven on the watch:
// there is no timeline JS surface in the mod sandbox at all, and the phone half
// only runs inside the Pebble app's PKJS engine. So what is pinned here is
// everything that is decidable off-device — the pin VALIDATION, the URL, and the
// HEADERS — plus the transport driven against stubbed globals, because those
// three are exactly what a wrong push gets wrong: the API answers a bad body
// with a flat `400 INVALID_JSON`, and the expensive failures (an over-long
// title, an unpaired heading, a 4th reminder) are not errors at all, they are
// silent truncation on the wearer's wrist.
//
// The transport tests install a fake `Pebble` / `XMLHttpRequest` on globalThis:
// timeline.ts declares those two module-locally (see its header) and reads them
// as free identifiers, so in Node they resolve to whatever the test put there.
// No network is touched anywhere except the ONE localhost round trip that
// exercises the CLI's real `fetch` transport — the same port-0 receipt pattern
// tests/phonefetch.test.mts uses for tools/fetch-server.mts.
//
// Run: node --test tests/timeline.test.mts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	badPin,
	badPinId,
	deleteUserPin,
	insertUserPin,
	pinHeaders,
	TIMELINE_API_ROOT,
	type TimelinePin,
	type TimelineResponse,
	userPinUrl,
	utf8Len,
} from "../src/pkjs/timeline.ts";
import {
	describeRequest,
	main,
	parseArgs,
	type PinRequest,
	type PushDeps,
} from "../tools/timeline-push.mts";

const ROOT = join(import.meta.dirname, "..");
const TOOL = join(ROOT, "tools/timeline-push.mts");

// An hour out, on the REAL clock: `badPin` windows `time` against `Date.now()`
// by default, and the transport helpers do not take a clock — so the fixture has
// to be genuinely valid now, not at some pinned instant.
const soon = (): string => new Date(Date.now() + 3600_000).toISOString();
const validPin = (): TimelinePin => ({
	id: "sp-test-1",
	time: soon(),
	layout: { type: "genericPin", title: "Standup", tinyIcon: "system://images/NOTIFICATION_FLAG" },
});

// ---------------------------------------------------------------- pure core --

test("timeline: userPinUrl is the documented /v1/user/pins/<id> path", () => {
	assert.equal(
		userPinUrl("sp-test-1"),
		"https://timeline-api.rebble.io/v1/user/pins/sp-test-1",
		"the default root is Rebble's host, not the dead getpebble.com one",
	);
	// the id is caller data in a PATH SEGMENT: unescaped it addresses a different
	// (or malformed) resource, which is a 404 that looks like a missing pin
	assert.equal(userPinUrl("a/b #1"), "https://timeline-api.rebble.io/v1/user/pins/a%2Fb%20%231");
	// a trailing slash on the root must not become a doubled slash in the path
	assert.equal(userPinUrl("x", "http://127.0.0.1:9/"), "http://127.0.0.1:9/v1/user/pins/x");
	assert.equal(userPinUrl("x", "http://127.0.0.1:9"), "http://127.0.0.1:9/v1/user/pins/x");
});

test("timeline: pinHeaders carries the token always, Content-Type only with a body", () => {
	assert.deepEqual(pinHeaders("tok", true), {
		"X-User-Token": "tok",
		"Content-Type": "application/json",
	});
	// the documented DELETE carries the token alone
	assert.deepEqual(pinHeaders("tok", false), { "X-User-Token": "tok" });
});

test("timeline: utf8Len counts BYTES, which is what the firmware budgets", () => {
	assert.equal(utf8Len("abc"), 3);
	assert.equal(utf8Len("a b"), 3, "a space is one byte, not the %20 escape");
	assert.equal(utf8Len("é"), 2);
	assert.equal(utf8Len("⌚"), 3);
	assert.equal(utf8Len("🎉"), 4, "an astral emoji is 4 bytes of a 63-byte budget");
});

test("timeline: badPinId enforces the documented 64-char id", () => {
	assert.equal(badPinId("sp-1"), null);
	assert.equal(badPinId(""), "id: must be a non-empty string");
	assert.equal(badPinId(undefined), "id: must be a non-empty string");
	assert.equal(badPinId(7), "id: must be a non-empty string");
	assert.equal(badPinId("x".repeat(65)), "id: 65 chars, max 64");
});

test("timeline: a well-formed pin has no problems", () => {
	assert.deepEqual(badPin(validPin()), []);
	// the full-fat shape too: reminders, notifications and both action types
	const rich: TimelinePin = {
		...validPin(),
		duration: 30,
		createNotification: { layout: { type: "genericNotification", title: "Added" } },
		reminders: [
			{ time: soon(), layout: { type: "genericReminder", title: "Soon" } },
			{ time: soon(), layout: { type: "genericReminder", title: "Sooner" } },
		],
		actions: [
			{ type: "openWatchApp", title: "Open", launchCode: 1 },
			{ type: "http", title: "Ack", url: "https://example.invalid/ack", method: "POST" },
		],
		layout: {
			type: "genericPin",
			title: "Standup",
			headings: ["Where", "Who"],
			paragraphs: ["Room 2", "Everyone"],
		},
	};
	assert.deepEqual(badPin(rich), []);
});

test("timeline: badPin reports EVERY problem at once (a 400 names none of them)", () => {
	const NOW = Date.parse("2026-07-31T12:00:00Z");
	const problems = badPin(
		{
			id: "",
			time: "not a date",
			layout: { type: "sparklePin" as never, title: "", headings: ["only one"] },
			reminders: [1, 2, 3, 4].map(() => ({
				time: new Date(NOW).toISOString(),
				layout: { type: "genericReminder", title: "r" } as const,
			})),
			actions: [{ type: "wave" as never, title: "" }],
		},
		NOW,
	);
	assert.deepEqual(problems, [
		"id: must be a non-empty string",
		"time: must be an ISO 8601 date-time string",
		'layout.type: "sparklePin" is not a firmware layout',
		"layout.title: required (a pin with no title renders an empty row)",
		"layout.headings/paragraphs: 1 vs 0, must match",
		"reminders: 4, max 3 (the rest are dropped)",
		'actions: "wave" is not an action type',
		"actions: every action needs a title",
	]);
});

test("timeline: badPin windows `time` to -2 days / +1 year, as the API does", () => {
	const NOW = Date.parse("2026-07-31T12:00:00Z");
	const at = (ms: number): TimelinePin => ({
		...validPin(),
		time: new Date(NOW + ms).toISOString(),
	});
	const DAY = 24 * 60 * 60 * 1000;
	assert.deepEqual(badPin(at(-3 * DAY), NOW), ["time: more than 2 days in the past"]);
	assert.deepEqual(badPin(at(-DAY), NOW), [], "yesterday is inside the window");
	assert.deepEqual(badPin(at(366 * DAY), NOW), ["time: more than a year in the future"]);
	assert.deepEqual(badPin(at(300 * DAY), NOW), [], "ten months out is inside the window");
});

test("timeline: badPin catches the SILENT failures — truncation and layout gaps", () => {
	// 64-byte budget, minus the NUL the phone appends => 63 usable bytes
	const long = badPin({ ...validPin(), layout: { type: "genericPin", title: "x".repeat(64) } });
	assert.deepEqual(long, ["layout.title: 64 bytes, truncated at 63"]);
	assert.deepEqual(
		badPin({ ...validPin(), layout: { type: "genericPin", title: "x".repeat(63) } }),
		[],
	);
	// bytes, not characters: 16 emoji are 64 bytes of a 63-byte budget
	assert.deepEqual(
		badPin({ ...validPin(), layout: { type: "genericPin", title: "🎉".repeat(16) } }),
		["layout.title: 64 bytes, truncated at 63"],
	);
	// body has its own, larger budget (512) — and a non-string attribute is not
	// this rule's business (the type checker owns that)
	assert.deepEqual(
		badPin({
			...validPin(),
			layout: { type: "genericPin", title: "t", body: "b".repeat(512), subtitle: 7 as never },
		}),
		["layout.body: 512 bytes, truncated at 511"],
	);
	// paragraphs without headings is the mirror mismatch
	assert.deepEqual(
		badPin({ ...validPin(), layout: { type: "genericPin", title: "t", paragraphs: ["a"] } }),
		["layout.headings/paragraphs: 0 vs 1, must match"],
	);
});

test("timeline: badPin survives junk where a pin was expected", () => {
	// `JSON.parse("null")` is a file a CLI user really does hand us
	assert.deepEqual(badPin(null as unknown as TimelinePin), [
		"id: must be a non-empty string",
		"time: must be an ISO 8601 date-time string",
		"layout: required",
	]);
	// a layout that is not an object at all
	assert.deepEqual(badPin({ ...validPin(), layout: "genericPin" as never }), ["layout: required"]);
	// an http action with no url reaches the phone and does nothing
	assert.deepEqual(badPin({ ...validPin(), actions: [{ type: "http", title: "Ack" }] }), [
		"actions: an http action needs a url",
	]);
});

// ------------------------------------------------------------ pkjs transport --

interface Reply {
	status?: number;
	statusText?: string;
	responseText?: unknown;
}
let token: string | null = "tok-1";
let reply: Reply = { status: 200, responseText: '{"ok":true}' };
let openThrows = false;
const sent: FakeXHR[] = [];

/** The PKJS sandbox's XHR, faked: records the request, then answers `reply`. */
class FakeXHR {
	onloadend: (() => void) | null = null;
	timeout = 0;
	status = 0;
	statusText = "";
	responseText: unknown = "";
	headers: Record<string, string> = {};
	method = "";
	url = "";
	body: string | undefined;
	open(method: string, url: string): void {
		if (openThrows) throw new Error("blocked by the sandbox");
		this.method = method;
		this.url = url;
	}
	setRequestHeader(name: string, value: string): void {
		this.headers[name] = value;
	}
	send(body?: string): void {
		this.body = body;
		sent.push(this);
		Object.assign(this, reply);
		this.onloadend?.();
	}
}
const g = globalThis as unknown as Record<string, unknown>;
g.XMLHttpRequest = FakeXHR;
g.Pebble = {
	getTimelineToken(success: (t: string) => void, failure: (e: string) => void): void {
		if (token === null) failure("no token available");
		else success(token);
	},
};

/** Drive one call and return whichever callback fired, so both are asserted. */
function drive(run: (ok: (r: TimelineResponse) => void, no: (e: string) => void) => void): {
	res?: TimelineResponse;
	err?: string;
} {
	const out: { res?: TimelineResponse; err?: string } = {};
	run(
		(r) => {
			out.res = r;
		},
		(e) => {
			out.err = e;
		},
	);
	return out;
}

test("timeline: insertUserPin PUTs the pin with the token header", () => {
	sent.length = 0;
	const pin = validPin();
	const out = drive((ok, no) => insertUserPin(pin, ok, no));
	assert.equal(sent.length, 1);
	const xhr = sent[0];
	assert.equal(xhr.method, "PUT");
	assert.equal(xhr.url, `${TIMELINE_API_ROOT}/v1/user/pins/sp-test-1`);
	assert.deepEqual(xhr.headers, {
		"X-User-Token": "tok-1",
		"Content-Type": "application/json",
	});
	assert.deepEqual(JSON.parse(xhr.body as string), pin, "the body is the pin, verbatim");
	// a hung push must still answer — the timeout is set between open() and send()
	assert.equal(xhr.timeout, 15000);
	assert.deepEqual(out.res, { status: 200, body: '{"ok":true}' });
	assert.equal(out.err, undefined);
});

test("timeline: an invalid pin fails BEFORE the network, naming every problem", () => {
	sent.length = 0;
	const out = drive((ok, no) => insertUserPin({ ...validPin(), id: "" }, ok, no));
	assert.equal(sent.length, 0, "no request may be spent learning what badPin already knows");
	assert.equal(out.err, "invalid pin: id: must be a non-empty string");
});

test("timeline: a non-2xx status surfaces the API's own error body", () => {
	reply = { status: 410, responseText: '{"errorCode":"INVALID_USER_TOKEN"}' };
	const out = drive((ok, no) => insertUserPin(validPin(), ok, no));
	assert.equal(out.res, undefined);
	assert.equal(out.err, 'PUT sp-test-1: 410 {"errorCode":"INVALID_USER_TOKEN"}');
	// an empty body falls back to statusText — never an unexplained bare number
	reply = { status: 503, statusText: "Service Unavailable", responseText: "" };
	assert.equal(
		drive((ok, no) => insertUserPin(validPin(), ok, no)).err,
		"PUT sp-test-1: 503 Service Unavailable",
	);
	// pypkjs leaves status/responseText UNSET when the request never completed
	reply = { status: undefined, statusText: "connection failed", responseText: undefined };
	assert.equal(
		drive((ok, no) => insertUserPin(validPin(), ok, no)).err,
		"PUT sp-test-1: no response connection failed",
	);
	reply = { status: 200, responseText: '{"ok":true}' };
});

test("timeline: a request the sandbox refuses answers, it does not vanish", () => {
	openThrows = true;
	const out = drive((ok, no) => insertUserPin(validPin(), ok, no));
	openThrows = false;
	assert.equal(out.err, "PUT sp-test-1: request rejected: Error: blocked by the sandbox");
});

test("timeline: no timeline token, no push — and the reason says so", () => {
	token = null;
	const out = drive((ok, no) => insertUserPin(validPin(), ok, no));
	token = "tok-1";
	assert.equal(out.err, "timeline token unavailable: no token available");
	assert.equal(out.res, undefined);
});

test("timeline: deleteUserPin needs only the id (the server half knows no more)", () => {
	sent.length = 0;
	const out = drive((ok, no) => deleteUserPin("sp-test-1", ok, no, "http://127.0.0.1:9/"));
	const xhr = sent[0];
	assert.equal(xhr.method, "DELETE");
	assert.equal(xhr.url, "http://127.0.0.1:9/v1/user/pins/sp-test-1", "the root override applies");
	assert.deepEqual(xhr.headers, { "X-User-Token": "tok-1" }, "no Content-Type without a body");
	assert.equal(xhr.body, undefined);
	assert.deepEqual(out.res, { status: 200, body: '{"ok":true}' });
});

test("timeline: deleteUserPin rejects a bad id with the same rule as insert", () => {
	sent.length = 0;
	const out = drive((ok, no) => deleteUserPin("", ok, no));
	assert.equal(sent.length, 0);
	assert.equal(out.err, "invalid pin: id: must be a non-empty string");
});

// ------------------------------------------------------------------- the CLI --

test("timeline-push: parseArgs reads both verbs and every flag", () => {
	assert.deepEqual(parseArgs(["insert", "pin.json", "--token", "t"]), {
		cmd: "insert",
		target: "pin.json",
		token: "t",
		api: TIMELINE_API_ROOT,
		dry: false,
	});
	assert.deepEqual(
		parseArgs(["delete", "sp-1", "--token", "t", "--api", "http://h", "--dry-run"]),
		{
			cmd: "delete",
			target: "sp-1",
			token: "t",
			api: "http://h",
			dry: true,
		},
	);
});

test("timeline-push: parseArgs refuses what it does not understand", () => {
	// a typo'd verb, a missing target, a missing token and an unknown flag are
	// all cheaper to catch here than as a spent API call
	assert.throws(() => parseArgs(["push", "pin.json"]), /unknown command "push"/);
	assert.throws(() => parseArgs([]), /unknown command "undefined"/);
	assert.throws(() => parseArgs(["insert", "--token", "t"]), /insert needs a pin JSON path/);
	assert.throws(() => parseArgs(["delete"]), /delete needs a pin id/);
	assert.throws(() => parseArgs(["insert", "p.json"]), /--token is required/);
	assert.throws(() => parseArgs(["insert", "p.json", "--token"]), /--token is required/);
	assert.throws(
		() => parseArgs(["insert", "p.json", "--token", "t", "--api"]),
		/--api needs a value/,
	);
	assert.throws(() => parseArgs(["insert", "p.json", "--token", "t", "-n"]), /unknown option "-n"/);
});

test("timeline-push: a dry run prints the wire shape and REDACTS the token", () => {
	const lines: string[] = [];
	const req: PinRequest = {
		method: "PUT",
		url: "https://timeline-api.rebble.io/v1/user/pins/sp-1",
		headers: { "X-User-Token": "s3cret", "Content-Type": "application/json" },
		body: '{"id":"sp-1"}',
	};
	const text = describeRequest(req);
	assert.equal(
		text,
		"PUT https://timeline-api.rebble.io/v1/user/pins/sp-1\n" +
			"X-User-Token: <redacted>\n" +
			"Content-Type: application/json\n" +
			"\n" +
			'{"id":"sp-1"}',
	);
	assert.doesNotMatch(text, /s3cret/, "a dry run is what people paste into issues");
	// no body, no blank line + payload
	assert.equal(
		describeRequest({
			...req,
			method: "DELETE",
			body: null,
			headers: { "X-User-Token": "s3cret" },
		}),
		"DELETE https://timeline-api.rebble.io/v1/user/pins/sp-1\nX-User-Token: <redacted>",
	);
	assert.equal(lines.length, 0);
});

/** A CLI run with no file system and no network: everything is a seam. */
const run = (argv: string[], deps: PushDeps = {}) => {
	const lines: string[] = [];
	const requests: PinRequest[] = [];
	const send = async (req: PinRequest): Promise<TimelineResponse> => {
		requests.push(req);
		return { status: 200, body: "" };
	};
	return {
		lines,
		requests,
		out: main(argv, { log: (l) => lines.push(l), send, ...deps }),
	};
};

test("timeline-push: insert builds the PUT from the pin file", async () => {
	const pin = validPin();
	const r = run(["insert", "pin.json", "--token", "t", "--api", "http://h"], {
		read: () => JSON.stringify(pin),
	});
	const req = await r.out;
	assert.deepEqual(r.requests, [req], "exactly one request, and it is the one returned");
	assert.equal(req.method, "PUT");
	assert.equal(req.url, "http://h/v1/user/pins/sp-test-1");
	assert.deepEqual(req.headers, { "X-User-Token": "t", "Content-Type": "application/json" });
	assert.deepEqual(JSON.parse(req.body as string), pin);
	assert.deepEqual(r.lines, ["timeline-push: PUT http://h/v1/user/pins/sp-test-1 -> 200"]);
});

test("timeline-push: --dry-run sends nothing", async () => {
	const r = run(["insert", "pin.json", "--token", "t", "--dry-run"], {
		read: () => JSON.stringify(validPin()),
	});
	await r.out;
	assert.deepEqual(r.requests, [], "a dry run must not touch the network");
	assert.match(r.lines[0], /^PUT https:\/\/timeline-api\.rebble\.io\/v1\/user\/pins\/sp-test-1$/m);
	assert.equal(r.lines[1], "dry run — nothing sent");
});

test("timeline-push: delete needs no pin file at all", async () => {
	const r = run(["delete", "sp-test-1", "--token", "t"]);
	const req = await r.out;
	assert.equal(req.method, "DELETE");
	assert.equal(req.body, null);
	assert.deepEqual(req.headers, { "X-User-Token": "t" });
	assert.deepEqual(r.lines, [
		"timeline-push: DELETE https://timeline-api.rebble.io/v1/user/pins/sp-test-1 -> 200",
	]);
});

test("timeline-push: every failure is loud — bad JSON, bad pin, bad status", async () => {
	await assert.rejects(
		run(["insert", "broken.json", "--token", "t"], {
			read: () => "{ not json",
		}).out,
		/cannot read pin broken\.json:/,
		"the path AND the parser's reason, or the next hour goes to finding the file",
	);
	await assert.rejects(
		run(["insert", "stale.json", "--token", "t"], {
			read: () => JSON.stringify({ ...validPin(), time: "2020-01-01T00:00:00Z" }),
			now: Date.parse("2026-07-31T12:00:00Z"),
		}).out,
		/stale\.json is not a valid pin:\n {2}time: more than 2 days in the past/,
	);
	await assert.rejects(
		main(["delete", "sp-1", "--token", "t"], {
			log: () => {},
			send: async () => ({ status: 429, body: '{"errorCode":"RATE_LIMIT_EXCEEDED"}' }),
		}),
		/-> 429 \{"errorCode":"RATE_LIMIT_EXCEEDED"\}/,
	);
	// delete answers to the SAME id rule as insert — the halves must not disagree
	const r = run(["delete", "x".repeat(65), "--token", "t"]);
	await assert.rejects(r.out, /timeline-push: id: 65 chars, max 64/);
	assert.deepEqual(r.requests, [], "no call spent on an id the API cannot have stored");
});

test("timeline-push: the DEFAULT transport really speaks HTTP (localhost receipt)", async () => {
	// The only network in this suite, and it never leaves the loopback: this is
	// what proves `fetch` + real `readFileSync` + real `console.log` — the three
	// defaults every other test replaces — are wired correctly.
	const seen: { method?: string; url?: string; token?: string; body: string }[] = [];
	const server = createServer((req: IncomingMessage, res) => {
		let body = "";
		req.on("data", (c) => {
			body += c;
		});
		req.on("end", () => {
			seen.push({
				method: req.method,
				url: req.url,
				token: req.headers["x-user-token"] as string,
				body,
			});
			res.writeHead(200, { "content-type": "application/json" });
			res.end('{"ok":true}');
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const dir = mkdtempSync(join(tmpdir(), "sp-timeline-"));
	const file = join(dir, "pin.json");
	writeFileSync(file, JSON.stringify(validPin()));

	const printed: string[] = [];
	const realLog = console.log;
	console.log = (line: string) => printed.push(line);
	try {
		await main(["insert", file, "--token", "tok-live", "--api", api]);
		await main(["delete", "sp-test-1", "--token", "tok-live", "--api", api]);
	} finally {
		console.log = realLog;
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}

	assert.equal(seen.length, 2);
	assert.equal(seen[0].method, "PUT");
	assert.equal(seen[0].url, "/v1/user/pins/sp-test-1");
	assert.equal(seen[0].token, "tok-live");
	assert.equal(JSON.parse(seen[0].body).layout.title, "Standup");
	assert.equal(seen[1].method, "DELETE");
	assert.equal(seen[1].body, "", "a DELETE carries no body");
	assert.deepEqual(printed, [
		`timeline-push: PUT ${api}/v1/user/pins/sp-test-1 -> 200`,
		`timeline-push: DELETE ${api}/v1/user/pins/sp-test-1 -> 200`,
	]);
});

test("timeline-push: the CLI shim runs and exits 1 on failure", () => {
	const dir = mkdtempSync(join(tmpdir(), "sp-timeline-cli-"));
	const file = join(dir, "pin.json");
	writeFileSync(file, JSON.stringify(validPin()));
	const out = execFileSync(
		process.execPath,
		[TOOL, "insert", file, "--token", "s3cret", "--dry-run"],
		{ encoding: "utf8", stdio: "pipe" },
	);
	assert.match(out, /^PUT https:\/\/timeline-api\.rebble\.io\/v1\/user\/pins\/sp-test-1$/m);
	assert.match(out, /^X-User-Token: <redacted>$/m);
	assert.doesNotMatch(out, /s3cret/, "the shim prints the same redacted text main() built");
	assert.match(out, /dry run — nothing sent/);

	// a usage error must exit non-zero, or a CI push "succeeds" having done nothing
	assert.throws(
		() =>
			execFileSync(process.execPath, [TOOL, "insert", file], { encoding: "utf8", stdio: "pipe" }),
		(e: { status?: number; stderr?: string }) =>
			e.status === 1 && /--token is required/.test(e.stderr ?? ""),
	);
});
