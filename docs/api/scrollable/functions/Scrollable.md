[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [scrollable](../README.md) / Scrollable

# Function: Scrollable()

> **Scrollable**(`props`): `Content`

Defined in: scrollable.ts:161

Scrollable — a free-form scrolling viewport for ARBITRARY content: RN's
<ScrollView> on a watch. DISPLAY-ONLY — the app owns the scroll position and
drives `offset` (buttons / a rotary); the widget shifts the content and, with
`indicator`, shows how far it can still travel.

  const [y, setY] = useState(0);
  <Scrollable height={140} offset={() => y()} indicator>
    <Label ... /> <Label ... /> ...
  </Scrollable>

Hand-builds an outer clipping Container over an inner Column of the children
(menu.ts's idiom); ONE effect scrolls the Column via the device-proven moveBy
DELTA (flow.ts's Move — rounded, guarded), and an optional overlay
[ContentIndicator](ContentIndicator.md) paints the chevrons. Unlike Menu /
VirtualList (fixed-shape rows), the content is anything and its height is
MEASURED, not declared. See the module header for the composition + scroll +
indicator contract.

## Parameters

### props

[`ScrollableProps`](../type-aliases/ScrollableProps.md)

## Returns

`Content`
