# Issue templates

These are pebble-signals's issue templates, live from this repository's root
`.github/ISSUE_TEMPLATE/` directory. They exist because a device bug on this
platform is unactionable without receipts: the fields are the minimum needed
to act on one (the four budgets, which platform, a screenshot receipt) — see
CONTRIBUTING.md ("Rule 2 — measured numbers or it didn't happen").

Maintainer notes:

1. **Labels.** `bug` and `enhancement` are GitHub defaults and exist in a
   fresh repo; anything else in a `labels:` line has to be created first or
   it is silently dropped.
2. **Blank issues are off.** `config.yml` sets `blank_issues_enabled: false`,
   which forces every reporter through a template. That is deliberate — a bug
   report with no platform and no receipt costs a full round-trip to make
   actionable.
3. **No `PULL_REQUEST_TEMPLATE.md`.** The PR expectations live in
   [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Files

| File | What it is |
|---|---|
| `bug_report.md` | Wrong render, boot death, `fxAbort`, or a doc number that does not reproduce. Asks for platform, the four budgets, and a screenshot receipt. |
| `feature_request.md` | A new component/hook or a behavior change. Asks where it lands (opt-in module vs always-shipped core) and what it costs. |
| `config.yml` | Turns off blank issues and offers the read-this-first links. |
