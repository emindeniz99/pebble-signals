[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [image](../README.md) / ImageProps

# Type Alias: ImageProps

> **ImageProps** = `object`

Defined in: [image.ts:44](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L44)

Props for [Image](../functions/Image.md).

## Properties

### height

> **height**: `number`

Defined in: [image.ts:55](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L55)

Draw height in px. Construction-time (gotcha 16); never a thunk.

***

### src

> **src**: `string`

Defined in: [image.ts:51](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L51)

The bitmap resource — a `"name.png"` string. The `.png` suffix is MANDATORY
(`new Texture("name")` throws "Texture name not found!" on device, gotcha 19).
Pass a bare string LITERAL at the call site so the build (gen-manifest) packs
the matching asset — see src/tsx/examples/image.tsx (ships assets/sloth.png).

***

### variant?

> `optional` **variant?**: `number` \| (() => `number`)

Defined in: [image.ts:63](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L63)

Sprite frame selector, for a `variants` filmstrip. A THUNK (`() => i`) makes
the frame reactive — ONE effect writes `content.variant` on each change (the
whitelisted reactive prop, idiom 5b); a bare number is a static frame. Omit
for a plain single bitmap. Keep the index in `[0, frames)` yourself (e.g.
`() => i() % frames`, as imgwatch.tsx does) — Image does not clamp it.

***

### variants?

> `optional` **variants?**: `number`

Defined in: [image.ts:69](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L69)

Per-frame width in px for a horizontal sprite sheet — the Skin's `variants`
stride. Present = the texture is a filmstrip and `variant` picks the frame;
absent = a plain single bitmap (no `variant` concept).

***

### width

> **width**: `number`

Defined in: [image.ts:53](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L53)

Draw width in px. Construction-time (a size-less Content measures 0 — gotcha 16); never a thunk.
