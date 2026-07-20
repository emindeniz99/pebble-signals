[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [numberfield](../README.md) / NumberFieldProps

# Type Alias: NumberFieldProps

> **NumberFieldProps** = `object`

Defined in: numberfield.ts:62

Props for [NumberField](../functions/NumberField.md).

## Properties

### affordance?

> `optional` **affordance?**: `boolean`

Defined in: numberfield.ts:80

Show the `+`/`-` affordance hints above/below the number. Defaults to `true`.

***

### affordanceColor?

> `optional` **affordanceColor?**: `Color`

Defined in: numberfield.ts:82

Affordance hint color. Defaults to `"#808080"`.

***

### affordanceFont?

> `optional` **affordanceFont?**: `string`

Defined in: numberfield.ts:84

Affordance hint font. Defaults to `"24px Gothic"` (a valid Pebble key — Rule 4).

***

### color?

> `optional` **color?**: `Color`

Defined in: numberfield.ts:78

Value text color. Defaults to `"white"`.

***

### font?

> `optional` **font?**: `string`

Defined in: numberfield.ts:76

Value font. Defaults to `"bold 42px Bitham"` (a valid Pebble key — Rule 4).

***

### height?

> `optional` **height?**: `number`

Defined in: numberfield.ts:68

Field height in px. Defaults to 120. Split 1/4 : 1/2 : 1/4 across the +/value/- rows.

***

### max?

> `optional` **max?**: `number`

Defined in: numberfield.ts:72

Upper display bound — the shown value never rises above it. Omit for no ceiling.

***

### min?

> `optional` **min?**: `number`

Defined in: numberfield.ts:70

Lower display bound — the shown value never drops below it. Omit for no floor.

***

### unit?

> `optional` **unit?**: `string`

Defined in: numberfield.ts:74

Suffix appended after the number (e.g. `"%"`). Omit for none.

***

### value

> **value**: `number` \| (() => `number`)

Defined in: numberfield.ts:64

The number to display. A thunk (`() => n`) makes it reactive; a bare number is static. Clamped into `[min,max]` for display when those are given.

***

### width?

> `optional` **width?**: `number`

Defined in: numberfield.ts:66

Field width in px. Defaults to the screen width (a width-less Column measures 0 — gotcha 16).
