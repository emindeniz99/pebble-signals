---
name: Feature request
about: A new component or hook, or a change to how an existing one behaves
title: "[feat] "
labels: ["enhancement"]
assignees: ""
---

<!--
Worth a skim first, in case it is already answered:
- docs/components.md — the 52 components and hooks that exist today
- docs/catalog-plan.md — the per-item WILL / LATER / WON'T decisions, with
  reasons. If your idea is on the WON'T list, argue with the reason there
  rather than re-filing it.
- docs/api-parity.md — what React/Solid has that this deliberately skips
-->

## What do you want

<!-- One concrete sentence. "A `useHealth()` hook exposing today's step
count as a signal" beats "better health support". -->

## What problem does it solve

<!-- What were you building when you hit the gap, and what did you do
instead? Concrete scenarios decide priority here. -->

## Where would it land

- [ ] A **new opt-in module** (`runtime/<name>`) — the default, and the only
      shape that stays free for apps that do not import it
- [ ] A change to an **existing** opt-in module
- [ ] The **always-shipped core** (`runtime/signals`, `runtime/jsx-runtime`,
      `runtime/flow`) — this charges every app on the platform, forever, so
      say why it cannot live outside core
- [ ] Build tooling / docs / examples — no runtime cost

## What does it cost

<!--
The budgets are the design: 26,624 B usable arena, ~150 boot symbols, a
384-slot value stack. A feature is not judged on whether it is useful — it is
judged on whether it is useful AT THAT PRICE, and on whether apps that ignore
it still pay nothing.

If you have not measured, say so and leave this rough — an unmeasured guess
that is labelled as one is fine; an unlabelled one is not (Rule 2).
-->

- New top-level bindings / exported symbols it would add:
- Live Piu nodes or signals per instance (arena pressure):
- Does it need a new native/host module, a resource, or phone-side (pkjs) code?

## Prior art

<!-- Does the Pebble C SDK, Rocky, react-pebble, Solid or React have this?
What does theirs do, and what should ours do differently given that components
run ONCE and updates are single property assignments? -->

## Would you implement it

- [ ] Yes, with review
- [ ] Maybe, if pointed at the right files
- [ ] No — filing so it is tracked

<!-- Either answer is welcome. This is a single-maintainer, pre-1.0 project:
tracked-and-unbuilt is a normal, honest outcome for a good idea. -->
