# Claude Rules — signal-piu

Project-specific rules for AI assistants working in `projects/signal-piu/`.
Root `CLAUDE.md` still applies.

## Rule 1 — Read the official docs FIRST, then verify against source

**Before debugging any Pebble/Alloy/Piu/Moddable behavior, read the official
docs at <https://developer.repebble.com> (guides + examples) properly — the
EXAMPLES especially — and only then cross-check the SDK source.**

This is a hard rule with a receipt: the SVGImage/PDC "invisible circle" bug
burned many debugging rounds (bytes diffed, bundling probed, validation
proved, color/positioning/transform-trigger all guessed at) when the docs'
examples already showed the answer implicitly — every official example
applies transforms POST-mount inside behavior callbacks. Reading the docs
example first and asking "why does theirs differ from ours?" would have
found `PiuSVGImageBind` clobbering `cx/cy` in minutes, not hours.

Method, in order:
1. Find the relevant guide AND a working example on developer.repebble.com
   (or Moddable-OpenSource/pebble-examples).
2. Mirror the example's exact usage pattern first; make it work unchanged.
3. Only then diverge, one variable at a time.
4. Use the SDK source (`$SDK/toolchain/moddable/`) to explain *why* the
   pattern is required — source explains docs, it does not replace them.

## Rule 2 — Measured numbers or it didn't happen

Every claim about memory/limits in README must come from an on-device (QEMU)
measurement, and say so. When a prior conclusion is overturned (it happens —
see gotcha 16, the fetch correction, the SVGImage saga), correct the README
explicitly rather than silently.

## Rule 3 — The XS heap is the scarcest resource

The JS heap ("arena") is firmware-fixed at 32KB and every design decision
bends around it. Trade CPU for RAM freely — recompute, don't cache; bytes,
not objects; indices, not references. See README "gotchas" and
`docs/xs-heap-playbook.md` for the current trick inventory.
