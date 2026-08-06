# Security Policy

## Reporting a vulnerability

Report privately via **GitHub Security Advisories**:
<https://github.com/emindeniz99/pebble-signals/security/advisories/new>.
Do not open a public issue for anything where disclosure would put users at
risk before a fix lands.

You can expect an acknowledgement within a few days — this is a pre-1.0,
single-maintainer project, so response latency is days, not hours. There is
no bug bounty.

## Supported versions

| Version | Supported |
|---|---|
| latest 0.x release | yes |
| anything older | no |

Pre-1.0, only the latest published 0.x release receives fixes; upgrade to it
before reporting.

## Scope notes

pebble-signals ships code that runs on the watch (the runtime), on the phone
(pkjs), and on the developer's machine (build tooling and the scaffold CLI).
All three are in scope. The vendored compile-time typings under
`types/moddable/` never execute and are out of scope — report issues in them
upstream to Moddable.
