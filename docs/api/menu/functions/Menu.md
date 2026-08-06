[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [menu](../README.md) / Menu

# Function: Menu()

> **Menu**(`props`): `Content`

Defined in: [menu.ts:113](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/menu.ts#L113)

Menu — a reactive vertical scrolling, selectable list, display-only.

  const [sel] = useState(0);
  <Menu items={["Alarms", "Timers", "Stopwatch"]} selected={sel} />  // reactive
  <Menu items={rows} selected={2} height={120} rowHeight={24} />     // static

DISPLAY-ONLY — the app owns `selected` and drives it; Menu highlights the row
and scrolls (via the inner Column's `moveBy` — the device-proven Move idiom) to
keep it inside the clipping viewport. Hand-builds an outer clipping Container
over an inner Column of Label rows; the active row is restyled + skinned, and
the list scrolled, by ONE effect when `selected` is a thunk (idiom 5b). See the
module header for the composition + scroll + reactivity contract.

## Parameters

### props

[`MenuProps`](../type-aliases/MenuProps.md)

## Returns

`Content`
