[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / Show

# Function: Show()

> **Show**(`props`): `Container`

Defined in: flow.ts:235

Show({ when, children, fallback, keepAlive }) — `when` is a thunk;
children/fallback are thunks returning nodes. The host is sized by the
caller via coordinate props (an unconstrained Piu container measures at
zero when empty, so pass width/height or left/right/top/bottom for
stable layout).

Each side is automatically wrapped in a Container sized like the host
before it is swapped in: the piu Pebble port crashes the firmware when a
bare Label is swapped as a container's direct child (measured — both
fresh rebuilds and prebuilt re-binds die), while Container-wrapped
subtrees swap and re-bind indefinitely.

Two modes:
 - default: Solid semantics — swap subtrees, disposing the outgoing root
   (heap returns to its floor; verified in M5). The swap allocates the
   incoming subtree, which on the firmware-fixed 32KB arena can be the
   difference between running and "fxAbort memory full".
 - keepAlive: build children AND fallback once at mount and swap them by
   reference with the atomic replace() — zero allocation per toggle.
   (Not `visible`: setting visible on bound content crashes the port;
   not remove-now/re-add-later either: the re-add crashes.) A missing
   side becomes an empty placeholder wrapper so every transition still
   goes through replace(). Both subtrees stay live — their effects keep
   running while off-screen. The right default when memory is tighter
   than update cost.

PERF: Show is the most expensive control-flow node — a host container plus a
per-side wrapper subtree. For a one-widget toggle prefer a reactive string
(`string={() => cond() ? a : b}`) — no subtree. Reach for `keepAlive` when
the same two sides toggle often (builds both once, swaps by reference — zero
allocation per toggle) and for the default rebuild mode when memory is
tighter than update cost (only one side is ever allocated).

## Parameters

### props

[`ShowProps`](../type-aliases/ShowProps.md)

## Returns

`Container`
