# FAQ

Short answers, deep links. If a question isn't here, the
[docs index](README.md) groups everything by audience.

**Is this React?**
No — Solid-model fine-grained reactivity with React-flavored comfort
(`useState`, JSX). Components run ONCE; there is no re-render, no VDOM, no
diffing. [Core concepts](concepts.md) · [API parity](api-parity.md).

**Do React's Rules of Hooks apply? Can I call `useState` conditionally?**
The ORDER rule does not apply — it exists to serve machinery we don't have.
In React every hook is a node in a linked list on the fiber
(`ReactFiberHooks.js`: the `Hook` type is `{memoizedState, …, next}`;
`mountWorkInProgressHook` appends via `.next`), and a re-render matches each
call to its state purely BY POSITION (`updateWorkInProgressHook` — miscount
and you get "Rendered more hooks than during the previous render"). Here a
component runs ONCE, `useState` creates a standalone packed-core cell, and
there is no second pass to mismatch — a conditional `useState` is legal.
What replaces the order rule is the OWNERSHIP rule: hooks that subscribe
(`useClock`, `useAccel`, timers…) register cleanup with the CURRENT OWNER,
so call them inside a component body / the render build — never at module
scope (nothing would ever clean them up). [Lifecycle](lifecycle.md) ·
[Migrating from React](migration.md#from-react--react-native).

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

**What happens when a cleanup function throws?** Contained, by contract: the
error is logged via `report()` and the REMAINING cleanups still run — a
throwing cleanup never orphans its siblings and is never routed to an
ErrorBoundary (boundaries protect builds and bindings, not teardown). If
cleanup-to-boundary routing is ever added it will be a documented change,
not silent drift.

**Why does an exported `signal` build fine when an exported setter fails the
build?** Asymmetry by design. An exported `useState` accessor has a strictly
better spelling (the wrap above) and its escape shape was once device-fatal,
so rule 5 hard-fails. An exported `signal`/`computed` IS the designed
cross-module state pattern — modules share the one object and read
`.value` — so it builds; its only cost is that an exported binding skips the
packed lowering and stays a heap object (~2x slots for that signal, Rule 4).
Keep state module-local when nothing else reads it.

**Can I use `fetch` / talk to the internet?**
Yes, through the phone: the pkjs proxy ships with every build. The
`fetch()` mechanism is in place (arena-sized responses only), but a live
round-trip hasn't been verified in the emulator sandbox — see
[handbook gotcha 18](handbook.md#xs--piu-gotchas-actually-hit).

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
`font: "bold 32px <Family>"` — the build does the rest. To ship only the
glyphs you draw, add a `fonts.json` beside it
(`{"<Family>-<Suffix>": {"characters": "0123456789:"}}` or `characterRegex`):
370KB → 9KB on the `fontface` clock, and a character the face lacks fails the
build instead of rendering a box.
[Tutorial part 2](../tutorials/complete-watchface/part2-custom-fonts.md),
[packaging](packaging.md).

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
Yes — pebble-signals nodes ARE Piu nodes; hand-built content mounts next to JSX
(`coexist` example, device-verified). [Migration guide](migration.md).
