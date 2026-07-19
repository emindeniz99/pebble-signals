[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [actionbar](../README.md) / ActionBar

# Function: ActionBar()

> **ActionBar**(`props`): `Content`

Defined in: actionbar.ts:79

ActionBar — Pebble's right-edge button-hint strip, on ONE Piu Container.

  const [n] = useState(0);
  <ActionBar up="+" select="OK" down="-" />           // static
  <ActionBar up={() => String(n())} select="OK" />    // reactive up hint

A narrow Container pinned to the RIGHT edge holds a Column of three Labels
(up top, select center, down bottom). Reactive slots are `() => string`
thunks driven by per-slot effects (idiom 5b); static strings work too. See
the module header for the preload/lazy-construction gotchas.

## Parameters

### props

[`ActionBarProps`](../type-aliases/ActionBarProps.md)

## Returns

`Content`
