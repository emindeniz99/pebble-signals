# Staged issue templates (not live yet)

These are signal-piu's issue templates, parked **inside the project** because
GitHub will not read them from here.

signal-piu currently lives in the `emindeniz99/playground` monorepo, and GitHub
only honours issue templates from a repository's **root** `.github/` directory.
The root already has its own set (`playground/.github/ISSUE_TEMPLATE/`, aimed at
the flatbuffers projects), and overwriting it with watch-specific questions
would be wrong for every other project in the repo. So these live beside the
code they describe, and are used two ways today:

- **As a checklist** — the CONTRIBUTING page points reporters here, and the
  fields are the minimum needed to act on a device bug (the four budgets,
  which platform, a screenshot receipt).
- **As the move-in kit** — when signal-piu gets its own repository, this
  directory moves wholesale.

## When the project gets its own home

```sh
mkdir -p .github
git mv .github-templates/ISSUE_TEMPLATE .github/ISSUE_TEMPLATE
```

Then, in the new repo:

1. **Check `config.yml`'s links.** Every URL in it points at
   `blob/main/projects/signal-piu/…` paths that only exist while the project is
   inside the monorepo. Re-point them at the new repo's own paths.
2. **Check the labels.** `bug` and `enhancement` are GitHub defaults and exist
   in a fresh repo; anything else in a `labels:` line has to be created first
   or it is silently dropped.
3. **Decide on blank issues.** `config.yml` sets `blank_issues_enabled: false`,
   which forces every reporter through a template. That is deliberate — a bug
   report with no platform and no receipt costs a full round-trip to make
   actionable — but it is a maintainer's call to make at the time.
4. **Add `PULL_REQUEST_TEMPLATE.md` if you want one.** There is none here; the
   PR expectations live in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

Until that move happens, file issues at
<https://github.com/emindeniz99/playground/issues> and fill in the relevant
fields by hand.

## Files

| File | What it is |
|---|---|
| `bug_report.md` | Wrong render, boot death, `fxAbort`, or a doc number that does not reproduce. Asks for platform, the four budgets, and a screenshot receipt. |
| `feature_request.md` | A new component/hook or a behavior change. Asks where it lands (opt-in module vs always-shipped core) and what it costs. |
| `config.yml` | Turns off blank issues and offers the read-this-first links. |
