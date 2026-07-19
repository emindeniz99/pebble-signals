[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [draw](../README.md) / DrawContext

# Type Alias: DrawContext

> **DrawContext** = `object`

Defined in: draw.ts:47

The immediate-mode drawing surface handed to a [CanvasProps.paint](CanvasProps.md#paint)
callback. Every method rasterizes into `fillColor` spans on the owning Port.
Coordinates are Port-local (0,0 = top-left of the canvas). Colors are Piu
colors: a name (`"red"`), `#rgb`/`#rrggbb[aa]`, or a `0xRRGGBBAA` number.

## Methods

### fillCircle()

> **fillCircle**(`cx`, `cy`, `r`, `color`): `void`

Defined in: draw.ts:51

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

Defined in: draw.ts:49

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

### fillRoundRect()

> **fillRoundRect**(`x`, `y`, `w`, `h`, `r`, `color`): `void`

Defined in: draw.ts:70

Fill a rectangle with radius-`r` rounded corners. `r` clamps to
`min(r, w>>1, h>>1)`; `r` ≤ 0 falls back to a single fillRect. The middle
band is one full-width span; the top-`r`/bottom-`r` rows inset each end by
the corner circle profile (the fillCircle isqrt scanline) — no gaps.

#### Parameters

##### x

`number`

##### y

`number`

##### w

`number`

##### h

`number`

##### r

`number`

##### color

`Color`

#### Returns

`void`

***

### line()

> **line**(`x0`, `y0`, `x1`, `y1`, `thickness`, `color`): `void`

Defined in: draw.ts:63

Draw a straight line from (`x0`,`y0`) to (`x1`,`y1`), `thickness` px wide
(`thickness` ≤ 0 clamps to 1). Axis-aligned lines are ONE crisp span
centered on the fixed coordinate; diagonals step via DDA along the major
axis, stamping a `t`×`t` block per step.

#### Parameters

##### x0

`number`

##### y0

`number`

##### x1

`number`

##### y1

`number`

##### thickness

`number`

##### color

`Color`

#### Returns

`void`

***

### strokeCircle()

> **strokeCircle**(`cx`, `cy`, `r`, `color`, `thickness?`): `void`

Defined in: draw.ts:56

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

### strokeRect()

> **strokeRect**(`x`, `y`, `w`, `h`, `thickness`, `color`): `void`

Defined in: draw.ts:75

Stroke a rectangle outline as its 4 edges, each `thickness` px wide
(`thickness` ≤ 0 clamps to 1). Corners are double-painted (overlap is fine).

#### Parameters

##### x

`number`

##### y

`number`

##### w

`number`

##### h

`number`

##### thickness

`number`

##### color

`Color`

#### Returns

`void`

***

### text()

> **text**(`str`, `style`, `color`, `x`, `y`): `void`

Defined in: draw.ts:77

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
