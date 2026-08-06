[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [imagebackground](../README.md) / ImageBackgroundProps

# Type Alias: ImageBackgroundProps

> **ImageBackgroundProps** = `object`

Defined in: [imagebackground.ts:42](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/imagebackground.ts#L42)

Props for [ImageBackground](../functions/ImageBackground.md).

## Properties

### children?

> `optional` **children?**: [`JSXNode`](../../jsx-runtime/type-aliases/JSXNode.md)

Defined in: [imagebackground.ts:56](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/imagebackground.ts#L56)

Content mounted OVER the bitmap. appendChild flattens arrays and skips nullish, so an omitted child is a safe no-op (an empty backdrop).

***

### height

> **height**: `number`

Defined in: [imagebackground.ts:54](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/imagebackground.ts#L54)

Backdrop height in px. Construction-time (gotcha 16); sizes BOTH the Skin and the Container; never a thunk.

***

### src

> **src**: `string`

Defined in: [imagebackground.ts:50](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/imagebackground.ts#L50)

The backdrop bitmap resource — a `"name.png"` string. The `.png` suffix is
MANDATORY (`new Texture("name")` throws "Texture name not found!" on device,
gotcha 19). Pass a bare string LITERAL at the call site so the build
(gen-manifest) packs the matching asset — see src/tsx/examples/imagebackground.tsx
(ships assets/sloth.png).

***

### width

> **width**: `number`

Defined in: [imagebackground.ts:52](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/imagebackground.ts#L52)

Backdrop width in px. Construction-time (a size-less container measures 0 — gotcha 16); sizes BOTH the texture Skin and the Container; never a thunk.
