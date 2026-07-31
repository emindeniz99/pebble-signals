# Timeline — pushing pins from the phone and from a server

A timeline pin is the one Pebble surface a watch app **cannot** create from the
watch. Everything here runs off-device:

| Where | File | Use it when |
|---|---|---|
| Phone (PebbleKit JS) | `src/pkjs/timeline.ts` | the wearer's phone knows the pin (a settings change, a local calculation, a reply to an AppMessage from the watch) |
| Server (Node) | `tools/timeline-push.mts` | your backend knows the pin (a match starts, a delivery moves, a cron fires) and the phone may be asleep |
| Watch | — | never. See "the watch gap" below |

Both halves import the same pin contract and the same request builders from
`src/pkjs/timeline.ts`, so the endpoint, the headers and the validation cannot
drift apart between them.

## The watch gap (this is a platform fact, not a TODO)

The Moddable/Piu mod sandbox on the watch has **no timeline JS API at all** —
no pin insert, no subscription, no token. That is firmware-side and nothing in
this library can change it: `docs/components.md` lists `useTimelinePin` among
the hooks with "no Moddable JS getter/binding" (C-SDK, phone/pkjs, or dead
surface), `docs/market-notes.md` records "Populated Timeline" as infeasible
*on-port* for the same reason, and `docs/catalog-plan.md` therefore scoped the
Timeline web API as a **server-side** item from the start. This page is that
item; the watch-side hook remains a documented platform gap.

Two consequences worth internalising:

- **Nothing in this page costs the watch a byte.** `src/pkjs/timeline.ts` is
  phone-side code; it is not a `runtime/*` module, has no `manifest.base.json`
  or `typedoc.json` line, and never enters the 32 KB XS arena or the
  ~150-symbol boot budget. It is wired NOWHERE by default — `src/pkjs/index.ts`
  does not import it, so an app that does not opt in ships exactly what it
  shipped before.
- **A watch app that wants a pin has to ask.** The composition that works
  today: the watch sends a message (`runtime/message`, or the
  fetch-over-message channel in `runtime/phonefetch`), the pkjs entry receives
  it and calls `insertUserPin`. The watch never sees the token or the HTTP.

## Getting a token

The timeline token is per **user per app**, and only PebbleKit JS can mint one
(`Pebble.getTimelineToken`) — it is not in PebbleKit iOS/Android and not on the
watch. Prerequisites, both real failure modes:

1. the app is **timeline-enabled** in the developer portal, and
2. the wearer is **signed in** on the phone.

If either is false the token call fails and `insertUserPin` reports
`timeline token unavailable: …` rather than pushing. The phone half calls
`getTimelineToken` for you on every request. **The server half cannot** — a
backend gets the token only if the app sent it there once:

```js
// pkjs: hand the token to your backend, once, so the server can push later
Pebble.getTimelineToken(
	function (token) {
		var xhr = new XMLHttpRequest();
		xhr.open("POST", "https://your-backend.example/timeline-token", true);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.send(JSON.stringify({ token: token }));
	},
	function (e) {
		console.log("no timeline token: " + e);
	},
);
```

Treat a timeline token like a password: it authorises writing to that wearer's
timeline. That is why `--dry-run` prints it as `<redacted>`.

## Phone-side push (pkjs)

Opt in from your own pkjs entry — the helper exports plain CommonJS, which is
what the mobile app's bundler expects:

```js
var timeline = require("./timeline");

timeline.insertUserPin(
	{
		id: "standup-2026-08-03",       // your own id, <= 64 chars, unique per app
		time: "2026-08-03T09:30:00Z",   // ISO 8601, UTC
		layout: {
			type: "genericPin",
			title: "Standup",
			tinyIcon: "system://images/NOTIFICATION_FLAG",
		},
	},
	function (res) {
		console.log("pin pushed: " + res.status);
	},
	function (reason) {
		console.log("pin failed: " + reason);   // pkjs> lines DO reach `pebble logs`
	},
);

timeline.deleteUserPin("standup-2026-08-03", onOk, onFail);
```

`insertUserPin` validates before it opens a socket: a pin with a problem fails
with `invalid pin: …` and spends no API call. Retracting needs only the id, so
a phone can delete a pin the server created.

## Server-side push (CLI)

```sh
# see the exact request without sending it (no network, token redacted)
node tools/timeline-push.mts insert pin.json --token "$TIMELINE_TOKEN" --dry-run

# for real
node tools/timeline-push.mts insert pin.json --token "$TIMELINE_TOKEN"
node tools/timeline-push.mts delete standup-2026-08-03 --token "$TIMELINE_TOKEN"

# against a local stand-in instead of Rebble
node tools/timeline-push.mts insert pin.json --token t --api http://127.0.0.1:8787
```

`--dry-run` prints:

```
PUT https://timeline-api.rebble.io/v1/user/pins/standup-2026-08-03
X-User-Token: <redacted>
Content-Type: application/json

{"id":"standup-2026-08-03","time":"2026-08-03T09:30:00Z","layout":{…}}
```

A pin that will not fly says so before any socket opens, and says everything
that is wrong with it at once:

```
timeline-push: bad.json is not a valid pin:
  time: more than 2 days in the past
  layout.title: required (a pin with no title renders an empty row)
```

Exit code is 1 on anything that did not fully succeed — a usage error, an
unreadable/invalid pin, or a non-2xx status (the API's error body is printed
verbatim, because that is where its error code lives). Nothing is "mostly
pushed". The module also exports `main(argv, deps)` if you would rather push
from your own Node process than shell out; `deps` lets you replace the
transport, the file read and the logger.

**In-repo tool, run from source.** `tools/timeline-push.mts` is excluded from
the `dist/` build (`tsconfig.dist.json`, with the measurement in its comment):
it imports the pin contract from a `.ts` — the pkjs half has to emit CommonJS —
and compiling that dependency into `dist/` produces ESM syntax in a `.js` file
inside a package with no `"type"` field, which Node then refuses to import.
A backend that wants this should run it from a checkout, or lift the ~60 lines
of `main()`; publishing it would need `src/pkjs/` in package.json `files` plus a
dual-emit story for the contract.

## The pin, typed

`TimelinePin` mirrors the web API's object. Limits are the API's own, and the
attribute names are the firmware's own — an unknown attribute is **dropped**
by the phone's serializer with only a log line, so the interface is closed on
purpose.

| Field | Notes |
|---|---|
| `id` | required, ≤ 64 chars, unique per app, cannot be reused |
| `time` | required, ISO 8601; not more than 2 days in the past or 1 year in the future |
| `duration` | minutes, not milliseconds |
| `layout` | required: `type` + attributes (see below) |
| `reminders` | max **3**; the 4th is dropped silently |
| `actions` | `openWatchApp` (with `launchCode`) or `http` (with `url`) |
| `createNotification` / `updateNotification` | shown when the pin arrives / changes |

Layout types: `genericPin`, `calendarPin`, `genericReminder`,
`genericNotification`, `commNotification`, `weatherPin`, `sportsPin`.

Common attributes: `title`, `shortTitle`, `subtitle`, `shortSubtitle`, `body`,
`tinyIcon` / `smallIcon` / `largeIcon` (`system://images/…` or `app://images/…`
URIs), `primaryColor` / `secondaryColor` / `backgroundColor` (`#RRGGBB` or a
Pebble colour name), `headings` + `paragraphs`, `lastUpdated`, `locationName`,
`sender`, `displayTime`, `displayRecurring`, plus the sports fields
(`nameHome`, `scoreAway`, `sportsGameState`, …).

## What `badPin` catches, and why it bothers

The API answers a malformed body with a flat `400 INVALID_JSON` that names
nothing, and the **expensive** failures are not errors at all — they are silent
on the wearer's wrist. `badPin(pin)` returns every problem at once:

- **id** missing / over 64 chars.
- **time** unparseable, or outside the API's ±window.
- **layout** missing, or a `type` the firmware does not have.
- **`layout.title`** missing — a pin with no title renders an empty row.
- **string attributes over budget**, counted in UTF-8 **bytes**: the phone
  truncates `title`-class attributes at 63 bytes and `body` at 511 and says
  nothing, so 16 emoji are already over a 63-byte title budget while
  `"🎉".repeat(16).length` still reads 16.
- **`headings` / `paragraphs` length mismatch** — renders a heading with
  nothing under it.
- **more than 3 reminders**, an action with no title, an `http` action with no
  url.

## Errors the API returns

| Status | Code | Usually means |
|---|---|---|
| 400 | `INVALID_JSON` | the pin body — run `--dry-run` and re-read it |
| 403 | `INVALID_API_KEY` | shared-pin key (not used by this module) |
| 410 | `INVALID_USER_TOKEN` | the wearer signed out, or the app was removed |
| 429 | `RATE_LIMIT_EXCEEDED` | back off; a pin can take up to 30 min to land anyway |
| 503 | `SERVICE_UNAVAILABLE` | Rebble side; retry later |

## Deliberately not here

- **Shared pins** (`PUT /v1/shared/pins/<id>` with `X-API-Key` + `X-Pin-Topics`)
  — a broadcast surface with a different auth model and a subscription story;
  add it when something needs it, not before.
- **Subscriptions** — `Pebble.timelineSubscribe` / `timelineUnsubscribe` /
  `timelineSubscriptions` already exist in the PKJS sandbox; call them
  directly, there is nothing to wrap.
- **The sync side** (`/v1/sync`, the phone's pin database) — that is the mobile
  app's job, not an app's.
- **A watch-side hook** (`useTimelinePin`) — see the watch gap; there is
  nothing to bind to.

## Verifying

```sh
node --test tests/timeline.test.mts

# 100% of both new files, gates on
node --test --experimental-test-coverage \
  --test-coverage-include='tools/timeline-push.mts' \
  --test-coverage-include='src/pkjs/timeline.ts' \
  --test-coverage-lines=100 --test-coverage-branches=100 \
  --test-coverage-functions=100 tests/timeline.test.mts
```

The suite touches the network exactly once, on loopback (port 0), to prove the
CLI's real `fetch` transport; everything else runs against a fake `Pebble` /
`XMLHttpRequest` pair installed on `globalThis`.

**Expect one warning**, and do not chase it: Node prints
`MODULE_TYPELESS_PACKAGE_JSON … Reparsing as ES module` for
`src/pkjs/timeline.ts`. The package has no `"type"` field (the pkjs build emits
CommonJS on purpose), so Node detects the module syntax and reparses. It is a
performance note about one small file, not a failure.

## Sources (verified 2026-07-31)

- `developer.rebble.io/guides/pebble-timeline/timeline-public/` — endpoints,
  headers, the `time` window, the error table.
- `.../pin-structure/` — pin fields, the 64-char id, max 3 reminders,
  headings/paragraphs pairing, layout types, action types.
- `.../timeline-js/` — `Pebble.getTimelineToken` and the subscription calls are
  **PebbleKit JS only**.
- SDK 4.17 `sdk-core/pebble/<platform>/qemu/layouts.json` — the firmware's own
  layout ids, attribute names and per-attribute `max_length`.
- pypkjs (the emulator's PKJS): `javascript/pebble.py` (`getTimelineToken`,
  the `X-User-Token` header), `timeline/urls.py` (its default root is still the
  dead `timeline-api.getpebble.com` — which is why the root is a parameter
  here), `timeline/attributes.py` (unknown attributes skipped; strings
  truncated to `max_length - 1`), `timeline/model.py` (`web_reminders[:3]`),
  `javascript/xhr.py` (`setRequestHeader` and arbitrary methods really are
  proxied, and `onerror` never fires — hence `onloadend`).
