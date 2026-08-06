[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [picker](../README.md) / Picker

# Function: Picker()

> **Picker**(`props`): `Content`

Defined in: [picker.ts:104](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L104)

Picker — a reactive value carousel: the current option centered and bold, its
neighbors faded above and below (a 3-row window), on a Column of Labels.

  const [i, setI] = useState(0);
  <Picker options={FRUITS} selected={i} wrap />       // reactive carousel
  <Picker options={["A","B","C"]} selected={1} />     // static, no wrap

DISPLAY-ONLY — the app owns `selected` and moves it (e.g. up/down buttons);
the Picker renders the window and CLAMPS the index into range (Rule 8).
Hand-builds a full-width/height Column of three Labels; a thunk `selected` is
driven by one effect that re-strings the rows (idiom 5b). See the module
header for the fixed-style / wrap / gotcha-16 contract.

## Parameters

### props

[`PickerProps`](../type-aliases/PickerProps.md)

## Returns

`Content`
