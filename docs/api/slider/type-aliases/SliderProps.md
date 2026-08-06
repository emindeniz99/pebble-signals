[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [slider](../README.md) / SliderProps

# Type Alias: SliderProps

> **SliderProps** = `object`

Defined in: [slider.ts:29](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L29)

Props for [Slider](../functions/Slider.md).

## Properties

### height?

> `optional` **height?**: `number`

Defined in: [slider.ts:39](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L39)

Track height (and thumb diameter) in px. Defaults to 24.

***

### max?

> `optional` **max?**: `number`

Defined in: [slider.ts:35](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L35)

High end of the value range. Defaults to 1.

***

### min?

> `optional` **min?**: `number`

Defined in: [slider.ts:33](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L33)

Low end of the value range. Defaults to 0.

***

### thumb?

> `optional` **thumb?**: `Color`

Defined in: [slider.ts:43](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L43)

Thumb fill color. Defaults to `"white"`.

***

### track?

> `optional` **track?**: `Color`

Defined in: [slider.ts:41](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L41)

Track fill color. Defaults to `"#555555"`.

***

### value

> **value**: `number` \| (() => `number`)

Defined in: [slider.ts:31](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L31)

The value to display. A thunk (`() => v`) makes the slider reactive; a bare number is static.

***

### width?

> `optional` **width?**: `number`

Defined in: [slider.ts:37](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/slider.ts#L37)

Track width in px. Defaults to 100.
