[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [draw](../README.md) / DrawContext

# Type Alias: DrawContext

> **DrawContext** = `object`

Defined in: draw.ts:49

The immediate-mode drawing surface handed to a [CanvasProps.paint](CanvasProps.md#paint)
callback. Every method rasterizes into `fillColor` spans on the owning Port.
Coordinates are Port-local (0,0 = top-left of the canvas). Colors are Piu
colors: a name (`"red"`), `#rgb`/`#rrggbb[aa]`, or a `0xRRGGBBAA` number.

## Methods

### arc()

> **arc**(`cx`, `cy`, `r`, `startDeg`, `endDeg`, `thickness`, `color`): `void`

Defined in: draw.ts:70

Stroke a ring SEGMENT — the band between radius (`r` − `thickness`) and `r`,
centered at (`cx`,`cy`), swept from `startDeg` to `endDeg`. Angles are in
DEGREES with 0 = the +x axis (3 o'clock) and INCREASING CLOCKWISE toward
6 o'clock (matching the screen's y-down axis), wrapping past 360 — so
`350`→`10` draws a 20° arc across the 0 seam, and a FULL ring is
`startDeg` 0, `endDeg` 360. `thickness` ≤ 0 clamps to 1; `r` ≤ 0 draws
nothing. Rasterized per-pixel over the bounding box: a pixel is kept when
`(r−thickness)² ≤ dx²+dy² ≤ r²` AND its angle is inside the swept range;
each row's contiguous kept pixels coalesce into ONE `fillColor` span.

#### Parameters

##### cx

`number`

##### cy

`number`

##### r

`number`

##### startDeg

`number`

##### endDeg

`number`

##### thickness

`number`

##### color

`Color`

#### Returns

`void`

***

### fillCircle()

> **fillCircle**(`cx`, `cy`, `r`, `color`): `void`

Defined in: draw.ts:53

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

Defined in: draw.ts:51

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

Defined in: draw.ts:92

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

Defined in: draw.ts:85

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

Defined in: draw.ts:58

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

Defined in: draw.ts:97

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

Defined in: draw.ts:99

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
