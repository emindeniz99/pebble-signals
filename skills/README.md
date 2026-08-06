# Agent skills

Skills that teach an AI coding agent (Claude Code, Cursor, anything that
reads the `SKILL.md` format) how to build Pebble apps with pebble-signals —
the same distribution channel as Core Devices' official
`pebble-watchface-agent-skill`, but targeting the Alloy/JS stack this
library lives on instead of legacy C.

The point: pebble-signals's depth (measured budgets, 24 gotchas, font rules,
emulator recipes) is a lot for a HUMAN to read before their first
watchface — but it is exactly what an AGENT needs to get a build right on
the first try. The skill is that knowledge, distilled.

## Install

Copy the skill folder into your project's agent config, e.g. for Claude
Code:

```bash
mkdir -p .claude/skills
cp -r node_modules/pebble-signals/skills/pebble-signals-watchface .claude/skills/
```

Then ask your agent: *"make me a Pebble watchface with pebble-signals"* — it
will pick up the skill automatically (or invoke it as
`/pebble-signals-watchface`).

## Contents

- `pebble-signals-watchface/` — build/verify loop, the four memory budgets,
  valid fonts, read-syntax + ownership rules, component catalog, round-
  screen rules, phone-data pattern, deep links into `docs/`.
