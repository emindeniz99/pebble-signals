[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [picker](../README.md) / PickerProps

# Type Alias: PickerProps

> **PickerProps** = `object`

Defined in: [picker.ts:69](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L69)

Props for [Picker](../functions/Picker.md).

## Properties

### activeColor?

> `optional` **activeColor?**: `Color`

Defined in: [picker.ts:81](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L81)

Current (centered) text color. Defaults to `"white"`.

***

### color?

> `optional` **color?**: `Color`

Defined in: [picker.ts:79](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L79)

Faded neighbor (prev/next) text color. Defaults to `"#808080"`.

***

### font?

> `optional` **font?**: `string`

Defined in: [picker.ts:83](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L83)

Current row font — a valid Pebble system font key. Defaults to `"24px Gothic"`.

***

### height?

> `optional` **height?**: `number`

Defined in: [picker.ts:77](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L77)

Picker height in px (the 3 rows split it evenly). Defaults to 96.

***

### options

> **options**: `string`[]

Defined in: [picker.ts:71](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L71)

The option strings, in list order. The Picker shows a sliding 3-row window onto them.

***

### selected

> **selected**: `number` \| (() => `number`)

Defined in: [picker.ts:73](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L73)

The centered (current) option's index — an INTEGER. A thunk (`() => i`) makes it reactive; a bare number is static. Clamped to `[0, options.length-1]`.

***

### sideFont?

> `optional` **sideFont?**: `string`

Defined in: [picker.ts:85](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L85)

Neighbor rows font — a valid Pebble system font key. Defaults to `"18px Gothic"`.

***

### width?

> `optional` **width?**: `number`

Defined in: [picker.ts:75](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L75)

Picker width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16).

***

### wrap?

> `optional` **wrap?**: `boolean`

Defined in: [picker.ts:87](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/picker.ts#L87)

Carousel wrap: `true` makes the list circular (last↔first neighbors); `false` leaves out-of-range neighbors blank. Defaults to `false`.
