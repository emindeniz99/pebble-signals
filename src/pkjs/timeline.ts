// Rebble Timeline Web API — the PHONE-side (PKJS) half, plus the pin contract
// the SERVER-side pusher (tools/timeline-push.mts) shares. Timeline pins are the
// one Pebble surface a watch app cannot reach FROM the watch: the mod sandbox
// has no timeline JS API at all, so a pin is always pushed by something off the
// watch (docs/timeline.md — "the watch gap"). Both pushers build their request
// with the pure helpers below, so the two halves cannot drift apart.
//
// Wired NOWHERE by default: src/pkjs/index.ts does not import this file. A
// consumer's pkjs entry opts in with `var timeline = require("./timeline");`.
// That is also why there is no manifest.base.json / typedoc.json line for it —
// those list `runtime/*` WATCH modules, and not a byte of this one enters the
// 32KB arena or the boot-symbol budget.
//
// THE SURFACE, verified 2026-07-31 — do not "improve" it from memory:
//   * `PUT` / `DELETE https://timeline-api.rebble.io/v1/user/pins/<id>` with
//     `X-User-Token: <token>` (plus `Content-Type: application/json` on the
//     PUT) — developer.rebble.io/guides/pebble-timeline/timeline-public/.
//     Rebble's host replaced getpebble.com's; pypkjs still DEFAULTS to the dead
//     `timeline-api.getpebble.com` (pypkjs/timeline/urls.py `public_api_root`),
//     which is exactly why the root is a parameter here and not a constant a
//     caller cannot reach.
//   * The token is per user PER APP and only PebbleKit JS can mint one —
//     `Pebble.getTimelineToken(success, failure)`
//     (…/guides/pebble-timeline/timeline-js/: "the timeline APIs to subscribe
//     users to topics and retrieve user tokens are only available in
//     PebbleKit JS"). pypkjs implements it in `javascript/pebble.py`
//     (`getTimelineToken` → `_get_timeline_token`) and sends the very same
//     `X-User-Token` header for subscriptions at :239.
//   * Pin JSON, its limits, and the layout/attribute names come from
//     …/guides/pebble-timeline/pin-structure/ AND the firmware's own table,
//     SDK 4.17 `sdk-core/pebble/<platform>/qemu/layouts.json` — 7 layouts, 34
//     attributes, each string attribute with a `max_length`.
//   * PUT/DELETE with custom headers really do work from the PKJS sandbox:
//     pypkjs' XHR proxies `setRequestHeader` and builds
//     `requests.Request(method, url)` for ANY method
//     (pypkjs/javascript/xhr.py:48,103,111) — the same engine
//     `pebble install --emulator` runs.
//
// The two sandbox globals are declared MODULE-LOCALLY instead of being grown
// into src/pkjs/pkjs.d.ts, deliberately: tools/timeline-push.mts imports the
// PURE half of this file from Node, where pkjs.d.ts's global `declare const
// console` collides with @types/node. Module-scoped ambients keep ONE file
// type-checking in BOTH programs, and they keep pkjs.d.ts exactly as wide as
// its own consumer (index.ts) needs it — "grow deliberately".
declare const Pebble: {
	/** Mints the per-user, per-app timeline token. PKJS-only; the watch has none. */
	getTimelineToken(success: (token: string) => void, failure: (e: string) => void): void;
};
/** The sandbox XHR, with the `setRequestHeader` index.ts never needed. */
interface TimelineXHR {
	open(method: string, url: string, async?: boolean): void;
	setRequestHeader(header: string, value: string): void;
	send(body?: string): void;
	/** Fires for EVERY outcome — pypkjs does not fire `onerror` at all (gotcha: index.ts). */
	onloadend: (() => void) | null;
	timeout: number;
	readonly status: number;
	readonly statusText: string;
	readonly responseText: string;
}
declare const XMLHttpRequest: { new (): TimelineXHR };

/** Rebble's public timeline host. Override per call for a proxy or a test double. */
export const TIMELINE_API_ROOT = "https://timeline-api.rebble.io";

/** The seven firmware layouts (layouts.json `layouts`, SDK 4.17). */
export type TimelineLayoutType =
	| "genericPin"
	| "calendarPin"
	| "genericReminder"
	| "genericNotification"
	| "commNotification"
	| "weatherPin"
	| "sportsPin";

/**
 * A pin/reminder/notification layout: the firmware attribute table, typed.
 * Names and spellings are layouts.json's own (`attributes`) — an unknown key is
 * DROPPED by the phone's serializer with only a log line ("skipping unknown
 * attribute", pypkjs/timeline/attributes.py), so a typo is a silently missing
 * row on the watch. That is the whole reason this interface is closed.
 */
export interface TimelineLayout {
	type: TimelineLayoutType;
	title?: string;
	shortTitle?: string;
	subtitle?: string;
	shortSubtitle?: string;
	body?: string;
	/** `system://images/<NAME>` or `app://images/<name>` — a URI, not a file. */
	tinyIcon?: string;
	smallIcon?: string;
	largeIcon?: string;
	/** Six-digit hex (`#RRGGBB`) or a Pebble colour name — both are accepted. */
	primaryColor?: string;
	secondaryColor?: string;
	backgroundColor?: string;
	/** Paired with `paragraphs`, 1:1 — see `badPin`. */
	headings?: string[];
	paragraphs?: string[];
	lastUpdated?: string;
	locationName?: string;
	sender?: string;
	displayTime?: "none" | "pin";
	displayRecurring?: "none" | "recurring";
	sportsGameState?: "pre-game" | "in-game";
	rankAway?: string;
	rankHome?: string;
	nameAway?: string;
	nameHome?: string;
	recordAway?: string;
	recordHome?: string;
	scoreAway?: string;
	scoreHome?: string;
}

/** A pin action: launch the app, or fire an HTTP request from the phone. */
export interface TimelineAction {
	type: "openWatchApp" | "http";
	title: string;
	/** `openWatchApp`: handed to the app as the launch argument. */
	launchCode?: number;
	/** `http`: the request the PHONE performs when the wearer picks the action. */
	url?: string;
	method?: string;
	headers?: Record<string, string>;
	bodyText?: string;
	bodyJSON?: unknown;
	successTitle?: string;
	successIcon?: string;
	failureTitle?: string;
	failureIcon?: string;
}

/** A reminder fires before the pin's time; max 3 per pin. */
export interface TimelineReminder {
	time: string;
	layout: TimelineLayout;
}

/** create/updateNotification — shown when the pin arrives / changes. */
export interface TimelineNotification {
	time?: string;
	layout: TimelineLayout;
}

/** One timeline pin, as the web API takes it (PUT body) and returns it. */
export interface TimelinePin {
	/** Your own stable id, <= 64 chars. It is the URL, so it must be unique per app. */
	id: string;
	/** ISO 8601 UTC start time — `new Date().toISOString()` is the right shape. */
	time: string;
	/** Minutes, not ms. */
	duration?: number;
	createNotification?: TimelineNotification;
	updateNotification?: TimelineNotification;
	layout: TimelineLayout;
	reminders?: TimelineReminder[];
	actions?: TimelineAction[];
}

/** What a completed request reports back — the status is the whole diagnosis. */
export interface TimelineResponse {
	status: number;
	body: string;
}

/**
 * The pin URL for `id` under `root`. `encodeURIComponent` because the id is
 * caller data and lands in a path segment: an id with a `/` or `#` in it would
 * otherwise address a different (or malformed) resource. A trailing slash on
 * `root` is trimmed so `"https://host/"` and `"https://host"` are one URL and
 * not two — the API 404s on the doubled slash. Pure.
 */
export function userPinUrl(id: string, root: string = TIMELINE_API_ROOT): string {
	return `${root.replace(/\/+$/, "")}/v1/user/pins/${encodeURIComponent(id)}`;
}

/**
 * The request headers. `Content-Type` goes on the PUT only: the documented
 * DELETE carries the token alone, and sending a content type with no body is
 * how a proxy learns to expect one. Pure.
 */
export function pinHeaders(token: string, hasBody: boolean): Record<string, string> {
	const headers: Record<string, string> = { "X-User-Token": token };
	if (hasBody) headers["Content-Type"] = "application/json";
	return headers;
}

/**
 * UTF-8 BYTE length of `s`. The firmware attribute table budgets bytes, not
 * characters, and the phone truncates to `max_length - 1` silently
 * (`x.encode('utf-8')[:max-1] + b'\x00'`, pypkjs/timeline/attributes.py) — so a
 * 40-character emoji title is over budget while `s.length` still says 40.
 * `encodeURIComponent` emits one `%XX` per non-ASCII byte, which is exactly the
 * count we want, and it exists in every PKJS engine. Pure.
 */
export function utf8Len(s: string): number {
	return encodeURIComponent(s).replace(/%[0-9A-Fa-f]{2}/g, " ").length;
}

/** Firmware string budgets (layouts.json `max_length`); the serializer keeps max - 1. */
const STRING_MAX: Record<string, number> = {
	title: 64,
	shortTitle: 64,
	subtitle: 64,
	shortSubtitle: 64,
	locationName: 64,
	sender: 64,
	body: 512,
};

const LAYOUT_TYPES = [
	"genericPin",
	"calendarPin",
	"genericReminder",
	"genericNotification",
	"commNotification",
	"weatherPin",
	"sportsPin",
];

/** Two days back / one year forward, the API's documented `time` window, in ms. */
const PAST_MS = 2 * 24 * 60 * 60 * 1000;
const FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The problem with `id`, or `null` if there is none. Shared by `badPin` and
 * `deleteUserPin` so the two paths cannot disagree about what an id is.
 * 64 chars is the documented maximum (pin-structure guide). Pure.
 */
export function badPinId(id: unknown): string | null {
	if (typeof id !== "string" || id.length === 0) return "id: must be a non-empty string";
	if (id.length > 64) return `id: ${id.length} chars, max 64`;
	return null;
}

/**
 * Every problem with `pin`, as fixable sentences (empty = push it). A list, not
 * a throw, so one call reports ALL of them — the API answers a bad body with a
 * flat `400 INVALID_JSON` that names nothing, and the expensive failures here
 * are the SILENT ones: an over-long title is truncated by the phone, an unpaired
 * heading/paragraph renders as a blank row, a 4th reminder is dropped
 * (`web_reminders[:3]`, pypkjs/timeline/model.py). Runtime-checked even though
 * the parameter is typed: pkjs consumers are plain JS, and a server pushing
 * user-generated pins has no types either. `now` is a parameter so the time
 * window is testable without a clock. Pure.
 */
export function badPin(pin: TimelinePin, now: number = Date.now()): string[] {
	const problems: string[] = [];
	const idProblem = badPinId(pin?.id);
	if (idProblem) problems.push(idProblem);
	// `time` is REQUIRED and windowed: the public API refuses a pin more than two
	// days in the past or a year in the future (timeline-public guide).
	if (typeof pin?.time !== "string" || Number.isNaN(Date.parse(pin.time)))
		problems.push("time: must be an ISO 8601 date-time string");
	else {
		const t = Date.parse(pin.time);
		if (t < now - PAST_MS) problems.push("time: more than 2 days in the past");
		else if (t > now + FUTURE_MS) problems.push("time: more than a year in the future");
	}
	const layout = pin?.layout;
	if (!layout || typeof layout !== "object") problems.push("layout: required");
	else {
		if (LAYOUT_TYPES.indexOf(layout.type) < 0)
			problems.push(`layout.type: "${layout.type}" is not a firmware layout`);
		if (typeof layout.title !== "string" || layout.title.length === 0)
			problems.push("layout.title: required (a pin with no title renders an empty row)");
		for (const attr of Object.keys(STRING_MAX)) {
			const value = (layout as unknown as Record<string, unknown>)[attr];
			if (typeof value !== "string") continue;
			const max = STRING_MAX[attr] - 1; // the phone appends a NUL inside the budget
			const len = utf8Len(value);
			if (len > max) problems.push(`layout.${attr}: ${len} bytes, truncated at ${max}`);
		}
		// headings/paragraphs are two parallel arrays; a mismatch does not error
		// anywhere, it just renders a heading with nothing under it.
		const headings = layout.headings ? layout.headings.length : 0;
		const paragraphs = layout.paragraphs ? layout.paragraphs.length : 0;
		if (headings !== paragraphs)
			problems.push(`layout.headings/paragraphs: ${headings} vs ${paragraphs}, must match`);
	}
	if (pin?.reminders && pin.reminders.length > 3)
		problems.push(`reminders: ${pin.reminders.length}, max 3 (the rest are dropped)`);
	for (const action of pin?.actions ?? []) {
		if (action.type !== "openWatchApp" && action.type !== "http")
			problems.push(`actions: "${action.type}" is not an action type`);
		else if (action.type === "http" && !action.url)
			problems.push("actions: an http action needs a url");
		if (typeof action.title !== "string" || action.title.length === 0)
			problems.push("actions: every action needs a title");
	}
	return problems;
}

/**
 * PUT the pin for THIS wearer. Validates first and fails without a network trip
 * if the pin is bad — a 400 from the API names nothing, `badPin` names
 * everything. `success` gets the API's status + body; `failure` gets one line
 * saying which step failed (token, transport, or status), because in the PKJS
 * sandbox that line is the entire diagnosis available (`pebble logs`, `pkjs>`).
 */
export function insertUserPin(
	pin: TimelinePin,
	success: (res: TimelineResponse) => void,
	failure: (reason: string) => void,
	root: string = TIMELINE_API_ROOT,
): void {
	const problems = badPin(pin);
	if (problems.length > 0) {
		failure(`invalid pin: ${problems.join("; ")}`);
		return;
	}
	request("PUT", pin.id, JSON.stringify(pin), success, failure, root);
}

/**
 * DELETE this wearer's pin by id. The id is all the API needs, so no pin JSON is
 * required to retract one — that matters when the pin was pushed by the server
 * half and the phone only knows the id.
 */
export function deleteUserPin(
	id: string,
	success: (res: TimelineResponse) => void,
	failure: (reason: string) => void,
	root: string = TIMELINE_API_ROOT,
): void {
	const problem = badPinId(id);
	if (problem) {
		failure(`invalid pin: ${problem}`);
		return;
	}
	request("DELETE", id, null, success, failure, root);
}

/** Token → XHR → one callback, exactly once. Shared by both verbs. */
function request(
	method: "PUT" | "DELETE",
	id: string,
	body: string | null,
	success: (res: TimelineResponse) => void,
	failure: (reason: string) => void,
	root: string,
): void {
	Pebble.getTimelineToken(
		(token) => {
			const xhr = new XMLHttpRequest();
			// `onloadend`, never `onerror`: it is the one event that fires for every
			// outcome, and pypkjs does not fire `onerror` on a connection failure at
			// all (javascript/xhr.py `_do_send`) — the same trap index.ts documents.
			xhr.onloadend = () => {
				const status = Number(xhr.status) || 0;
				const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
				if (status >= 200 && status < 300) {
					success({ status: status, body: text });
					return;
				}
				// The API's own error codes (INVALID_USER_TOKEN on 410,
				// RATE_LIMIT_EXCEEDED on 429, …) travel in the body — pass it through
				// verbatim rather than mapping it to a friendlier lie.
				failure(`${method} ${id}: ${status || "no response"} ${text || xhr.statusText}`);
			};
			try {
				xhr.open(method, userPinUrl(id, root), true);
				const headers = pinHeaders(token, body !== null);
				for (const name of Object.keys(headers)) xhr.setRequestHeader(name, headers[name]);
				xhr.timeout = 15000; // after open(), before send() — a hung push must still answer
				xhr.send(body === null ? undefined : body);
			} catch (err) {
				failure(`${method} ${id}: request rejected: ${err}`);
			}
		},
		// No token, no push: the app must be timeline-enabled AND the wearer signed
		// in, and neither is something this module can fix (pypkjs raises exactly
		// this distinction in `_get_timeline_token`).
		(e) => failure(`timeline token unavailable: ${e}`),
	);
}
