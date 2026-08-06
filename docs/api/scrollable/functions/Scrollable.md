[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [scrollable](../README.md) / Scrollable

# Function: Scrollable()

> **Scrollable**(`props`): `Content`

Defined in: [scrollable.ts:163](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/scrollable.ts#L163)

Scrollable — a free-form scrolling viewport for ARBITRARY content: RN's
<ScrollView> on a watch. DISPLAY-ONLY — the app owns the scroll position and
drives `offset` (buttons / a rotary); the widget shifts the content and, with
`indicator`, shows how far it can still travel.

  const [y, setY] = useState(0);
  <Scrollable height={140} offset={() => y()} indicator>
    <Label ... /> <Label ... /> ...
  </Scrollable>

Hand-builds a clipping Container over an inner Column of the children
(menu.ts's idiom); ONE effect scrolls the Column via the device-proven moveBy
DELTA (flow.ts's Move — rounded, guarded). With `indicator`, the viewport is a
Column of THREE non-overlapping bands — "^" gutter, clip window, "v" gutter —
whose chevrons are [ContentIndicator](ContentIndicator.md) Labels (NOT draw Canvases: a Canvas
beside a moveBy'd Column wedges the firmware — gotcha 24, MEASURED). Unlike
Menu / VirtualList (fixed-shape rows), the content is anything and its
height is MEASURED, not declared. See the module header for the composition +
scroll + indicator contract.

## Parameters

### props

[`ScrollableProps`](../type-aliases/ScrollableProps.md)

## Returns

`Content`
