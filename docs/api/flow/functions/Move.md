[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [flow](../README.md) / Move

# Function: Move()

> **Move**(`props`): `Container`

Defined in: flow.ts:663

Move({ x, y, children }) — reactive POSITION for a mounted subtree.
Coordinate props are construction-time statics on this port (jsx-runtime
rejects bind-time coordinate writes), but `content.moveBy(dx,dy)`
post-mount is device-proven safe (2026-07 probe: a box stepped across
gabbro for 6 heartbeats, 0 aborts — unlike `visible` writes, which crash
the port). Move wraps its children in a host container at the
construction-time base position (left/top/width/height props), then ONE
effect tracks the x()/y() offset thunks and applies the DELTA between the
last applied offset and the new one via moveBy. Offsets are rounded to
whole pixels BEFORE diffing, so float sources (an animate() tween) never
accumulate sub-pixel drift. The children build once at mount and never
rebuild — only their position changes (recycling, not reconcile).
  const x = animate(0, 80, 1200);
  <Move left={20} top={40} width={40} height={40} x={x}>
    <Label ... />
  </Move>
Size the host explicitly like any moving widget (makeHost's screen-width
default applies when you don't — fine for a marquee row, wrong for a
sprite). Offsets are RELATIVE to the base position, not absolute
coordinates: x/y = 0 means "at rest where you were constructed".

## Parameters

### props

[`MoveProps`](../type-aliases/MoveProps.md)

## Returns

`Container`
