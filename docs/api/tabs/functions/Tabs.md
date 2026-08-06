[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [tabs](../README.md) / Tabs

# Function: Tabs()

> **Tabs**(`props`): `Content`

Defined in: [tabs.ts:82](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/tabs.ts#L82)

Tabs — a reactive horizontal tab bar: a Row of captions, the active one lit.

  const [tab] = useState(0);
  <Tabs labels={["Home", "Stats", "Set"]} active={tab} />       // reactive
  <Tabs labels={["A", "B"]} active={1} activeFill="#004" />     // static

DISPLAY-ONLY — the app owns `active` and swaps the body; Tabs renders the bar.
Hand-builds a full-width Row of equal Label cells; the `active` cell wears the
`activeColor` text (+ optional `activeFill` Skin), driven by one effect when
`active` is a thunk (idiom 5b). See the module header.

## Parameters

### props

[`TabsProps`](../type-aliases/TabsProps.md)

## Returns

`Content`
