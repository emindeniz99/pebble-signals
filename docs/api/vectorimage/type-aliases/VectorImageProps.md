[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [vectorimage](../README.md) / VectorImageProps

# Type Alias: VectorImageProps

> **VectorImageProps** = `object`

Defined in: vectorimage.ts:59

Props for [VectorImage](../functions/VectorImage.md).

## Properties

### center?

> `optional` **center?**: \[`number`, `number`\]

Defined in: vectorimage.ts:90

Transform center `[cx,cy]` in viewbox units — the pivot for scale/rotate AND
the point subtracted per rule (b). Defaults to `[0,0]` (REQUIRED there, or
whole-pixel art displaces off screen). STATIC (position is
construction-time on this port).

***

### height

> **height**: `number`

Defined in: vectorimage.ts:69

Display-box height in px — the SCALED size (see [width](#width)).

***

### rotate?

> `optional` **rotate?**: `number` \| (() => `number`)

Defined in: vectorimage.ts:83

Rotation in RADIANS about the center. A bare number is CONSTANT; a THUNK is
REACTIVE. OMITTED = no rotation applied at all (identity). rotate() is
ABSOLUTE (rule d), so a `sin()` thunk swings rather than spins.

***

### scale?

> `optional` **scale?**: `number` \| (() => `number`)

Defined in: vectorimage.ts:77

Uniform scale. A bare number is CONSTANT (applied once at mount); a THUNK
(`() => n`) is REACTIVE (re-applied when a signal it reads changes).
Defaults to `1` — the forced scale(1,1) that makes the image draw at all
(rule a). `> 1` enlarges, `< 1` shrinks (path points + strokes, NOT circle
radii — rule c).

***

### src

> **src**: `string`

Defined in: vectorimage.ts:65

The PDC resource name — INCLUDE the `.pdc` suffix (`"slothvec.pdc"`). The
build derives the resource from a bare `"name.pdc"` string literal in the
app source, so passing the literal ships the asset automatically.

***

### translate?

> `optional` **translate?**: \[`number`, `number`\]

Defined in: vectorimage.ts:96

Screen translation `[tx,ty]` in viewbox units. Defaults to the `center`
point (centering + translating by the pivot keeps scaled art in place —
slothvec pivots at 30,7). STATIC.

***

### width

> **width**: `number`

Defined in: vectorimage.ts:67

Display-box width in px — the SCALED size (a 60px viewbox at 2x = 120).
