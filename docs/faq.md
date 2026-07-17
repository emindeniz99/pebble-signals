# FAQ

Short answers, deep links. If a question isn't here, the
[docs index](README.md) groups everything by audience.

**Is this React?**
No — Solid-model fine-grained reactivity with React-flavored comfort
(`useState`, JSX). Components run ONCE; there is no re-render, no VDOM, no
diffing. [Core concepts](concepts.md) · [API parity](api-parity.md).

**Why does my label show nothing?**
The three classics: an invalid font string renders BLANK (the build's
fontcheck catches it), a `computed`/`signal` read with `()` instead of
`.value` (lint-reads catches it), or a width-less container measuring 0.
[Debugging](debugging.md) has the full symptom table.

**Why did my app die at boot with no error?**
One of the three silent budgets: 32KB arena, ~150-symbol boot floor, or the
384-slot value stack. Read the abort line (`memory full` vs `stack
overflow`), then [the playbook](xs-heap-playbook.md). The flagship `pulse`
died twice on the way to shipping — its lessons are written down.

**Can I pass a setter (or getter) to another module / callback table?**
Wrap it: `boot({ setName: (v) => setName(v) })`. A bare `{ setName }`
escape costs the pair its packed lowering, and that exact shape once killed
the flagship on device — the build now fails loud with the wrap in the
message (`[setter-as-value]`).
[Debugging](debugging.md#typeerror-call-not-a-function-an-escaped-usestate-accessor).

**Can I use `fetch` / talk to the internet?**
Yes, through the phone: the pkjs proxy ships with every build. A full
`fetch()` from the watch works (with arena-sized responses);
[README gotcha 18](../README.md).

**How do I make a settings page?**
The Clay-style config flow is device-proven end to end — phone webview →
AppMessage → signals. [`config` example](examples.md) and
[tutorial part 4](../tutorials/complete-watchface/part4-settings.md).

**How do I persist data?**
Three proven paths: `localStorage` (small state), the byte store
(`createStore` — record lists as BYTES, the unbounded-list trick), and
`device.keyValue` (typed). [Tutorial part 5](../tutorials/complete-watchface/part5-persistence.md).

**Custom fonts?**
Drop a TTF at `<app>/fonts/<Family>-<Suffix>.ttf`, write
`font: "bold 32px <Family>"` — the build does the rest.
[Tutorial part 2](../tutorials/complete-watchface/part2-custom-fonts.md).

**How big can my app get?**
Code: effectively unbounded via lazy screen modules (bytecode stays in
flash; a cold `importNow` of a screen module measured **2ms**). Live UI: one
screen at a time (`Navigator`), recycled rows (`VirtualList`). What you
CANNOT exceed: the boot budgets above. [Playbook](xs-heap-playbook.md).

**Can I see logs from the watch?**
On release firmware JS `console.log` is a no-op — use the dev-log bridge
(`devlog` example): watch strings arrive as visible `pkjs>` lines. Errors
already paint an on-watch crash screen by default. [Debugging](debugging.md).

**Does it run on both watch shapes?**
Yes — the full 14-app smoke catalog is green on gabbro (round) AND emery
(rect) with zero platform-specific code; adapt via `screen.width` /
`screen.round`. [Device smokes](device-smokes.md).

**Can I preview without the emulator?**
`pnpm run preview -- <app>` runs the REAL compiled runtime in a browser
against DOM stubs — instant feedback, approximate layout; QEMU stays the
truth.

**Can I migrate an existing Piu/Alloy app gradually?**
Yes — signal-piu nodes ARE Piu nodes; hand-built content mounts next to JSX
(`coexist` example, device-verified). [Migration guide](migration.md).
