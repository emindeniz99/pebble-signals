[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [scrollable](../README.md) / ContentIndicator

# Function: ContentIndicator()

> **ContentIndicator**(`props`): `Content`

Defined in: scrollable.ts:110

ContentIndicator — a transparent Canvas overlay painting an up chevron
(top-center) while `canUp()` and a down chevron (bottom-center) while
`canDown()`: Pebble's ContentIndicator, the "more content this way" hint.

  <ContentIndicator canUp={() => off() > 0} canDown={() => off() < max}
    width={140} height={140} />

`canUp`/`canDown` are boolean THUNKS: reading them inside [Canvas](../../draw/functions/Canvas.md)'s
`paint` auto-subscribes to whatever signals they touch, so the chevrons
repaint for free when the scroll position changes (the dots.ts idiom — no
bind path, no manual invalidate). BOTH thunks are evaluated every frame (each
gates one chevron), so both stay subscribed regardless of which arrow draws.
There is no `fill`, so the port composites over the content beneath it.
Returns a single Piu Port. See the module header.

## Parameters

### props

[`ContentIndicatorProps`](../type-aliases/ContentIndicatorProps.md)

## Returns

`Content`
