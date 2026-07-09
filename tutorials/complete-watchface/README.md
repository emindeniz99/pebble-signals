# The complete watchface — from empty folder to installable .pbw

The second, longer tutorial series. The
[3-part intro](../build-a-watchface/README.md) teaches the reactive core
(signals, bindings, computed); this series covers everything AROUND it that a
real, shippable watchface needs — the same arc the official Alloy tutorial
walks, written originally for signal-piu. Every mechanic here is
**device-verified**: each part points at a shipped example in
`src/tsx/examples/` and a screenshot receipt in `screenshots/`.

| part | you build | proven by |
|---|---|---|
| [1 — setup & time](part1-setup-and-time.md) | a project + a ticking face | `watchface`, `clock` |
| [2 — custom fonts](part2-custom-fonts.md) | your own TTF on the watch | `fontface` + `fontface-gabbro.png` |
| [3 — images](part3-images.md) | bitmaps (and vectors) that animate | `imgwatch`, `slothvec` |
| [4 — a settings page](part4-settings.md) | phone-side config → watch signals | `config` + `config-roundtrip-gabbro.png` |
| [5 — persistence](part5-persistence.md) | state that survives relaunch | `list` (persisted store) |
| [6 — package & install](part6-package.md) | the installable `.pbw` | every build in this repo |

Prerequisites: the repo set up per the top-level README (Pebble SDK 4.17,
emulator working — `npm run smoke:device` green is the proof), and part 1-3
of the intro tutorial for the reactive concepts this series leans on.

One rule carried through every part, because it is the platform's rule: the
JS arena is 32KB and FLASH is the cheap place — fonts, images, and record
data all live there. When a part says "this costs flash, not arena," that is
the difference between a face that ships and one that dies at boot
(`docs/xs-heap-playbook.md` is the full ledger).
