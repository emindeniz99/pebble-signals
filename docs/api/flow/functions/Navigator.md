[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / Navigator

# Function: Navigator()

> **Navigator**(`props`): `Container`

Defined in: flow.ts:483

Navigator({ root }) — a screen STACK for infinitely-deep navigation on the
32KB heap. Only the TOP screen is ever BUILT: pushing a child disposes the
current screen's nodes+effects and builds the child; popping disposes the
child and REBUILDS the parent from its stored builder. So the arena holds
exactly ONE screen regardless of stack depth — you can drill 100 levels and
the heap stays flat (the stack itself is just an array of small builder
closures). This is #13's lazy-swap generalized into a back-stack.

`root` is a builder (nav) => node|thunk. Every screen builder receives the
same `nav` handle:
  nav.push(build)  push a child screen (build is (nav) => node)
  nav.pop()        pop to the parent (no-op at the root)
  nav.depth()      reactive current depth (1 = root)
  nav.canPop()     reactive: is there a parent to pop to
Parent screen state does NOT survive a pop+rebuild — keep anything that must
persist in a signal OUTSIDE the screen builder (the standard swap tradeoff).

GOTCHAS (measured):
 - do NOT make a Navigator the DIRECT child of a focused Container — the piu
   port crashes at mount resolving focus into a dynamically-built direct
   child. Wrap it in a Column (like Show).
 - screen builders may return any node — the swap wraps EVERY screen in a
   concrete-sized Container before mounting (the same wrapper Show uses),
   which is what the old "must return a Container element" rule guarded
   against: pre-wrapper, a bare Label added straight to the host crashed
   the swap (measured, multilazy era). The wrapper path is pinned in the
   Node suite; a fresh ON-DEVICE probe of a bare-Label screen through the
   wrapper is still pending (Rule 2), so prefer a Column screen root until
   that receipt lands.
 - the host is given a CONCRETE width AND height (full screen unless the
   caller passes them). multilazy's host is 180x140 for a reason: a host
   with no height gives a multi-child column no vertical box and the port
   crashes laying it out (measured — 1 label survived, 2+ died).
Buttons go on the outer focused Container and drive nav via the handle
screens hand back.

## Parameters

### props

[`NavigatorProps`](../type-aliases/NavigatorProps.md)

## Returns

`Container`
