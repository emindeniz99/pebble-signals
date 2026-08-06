[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [scrollable](../README.md) / ContentIndicator

# Function: ContentIndicator()

> **ContentIndicator**(`props`): `Content`

Defined in: [scrollable.ts:109](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/scrollable.ts#L109)

ContentIndicator — a one-line Label showing ONE chevron ("^" for up,
"v" for down) while `show()` is true, else blank: Pebble's ContentIndicator,
the "more content this way" hint.

  <ContentIndicator edge="down" show={() => off() < max} width={140} />

It is a GUTTER band, placed in FLOW above/below the content (that is how
[Scrollable](Scrollable.md) composes it). It is a Label — NOT a draw Canvas — ON
PURPOSE: a Canvas Port beside/over a moveBy'd content Column wedges the
firmware (gotcha 24, MEASURED on gabbro). `show` is a boolean THUNK: an
`effect` reads it and writes the Label's `string` (the bind path's own
mechanism), so the chevron appears/vanishes for free when the scroll position
changes. Returns a single Piu Label. See the module header.

## Parameters

### props

[`ContentIndicatorProps`](../type-aliases/ContentIndicatorProps.md)

## Returns

`Content`
