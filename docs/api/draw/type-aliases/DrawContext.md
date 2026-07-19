[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [draw](../README.md) / DrawContext

# Type Alias: DrawContext

> **DrawContext** = `object`

Defined in: draw.ts:43

The immediate-mode drawing surface handed to a [CanvasProps.paint](CanvasProps.md#paint)
callback. Every method rasterizes into `fillColor` spans on the owning Port.
Coordinates are Port-local (0,0 = top-left of the canvas). Colors are Piu
colors: a name (`"red"`), `#rgb`/`#rrggbb[aa]`, or a `0xRRGGBBAA` number.

## Methods

### fillCircle()

> **fillCircle**(`cx`, `cy`, `r`, `color`): `void`

Defined in: draw.ts:47

Fill a solid disc of radius `r` centered at (`cx`,`cy`). r ≤ 0 draws nothing.

#### Parameters

##### cx

`number`

##### cy

`number`

##### r

`number`

##### color

`Color`

#### Returns

`void`

***

### fillRect()

> **fillRect**(`x`, `y`, `w`, `h`, `color`): `void`

Defined in: draw.ts:45

Fill an axis-aligned rectangle. Negative width/height are clamped to 0.

#### Parameters

##### x

`number`

##### y

`number`

##### w

`number`

##### h

`number`

##### color

`Color`

#### Returns

`void`

***

### strokeCircle()

> **strokeCircle**(`cx`, `cy`, `r`, `color`, `thickness?`): `void`

Defined in: draw.ts:52

Stroke a circle outline of radius `r`, `thickness` pixels wide (default 1),
grown INWARD from `r`. Rasterized as the difference of two discs.

#### Parameters

##### cx

`number`

##### cy

`number`

##### r

`number`

##### color

`Color`

##### thickness?

`number`

#### Returns

`void`

***

### text()

> **text**(`str`, `style`, `color`, `x`, `y`): `void`

Defined in: draw.ts:54

Draw a text string at (`x`,`y`) in `style`/`color` (passthrough to drawString).

#### Parameters

##### str

`string`

##### style

`Style`

##### color

`Color`

##### x

`number`

##### y

`number`

#### Returns

`void`
