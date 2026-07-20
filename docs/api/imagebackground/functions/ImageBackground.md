[**signal-piu**](../../README.md)

***

[signal-piu](../../README.md) / [imagebackground](../README.md) / ImageBackground

# Function: ImageBackground()

> **ImageBackground**(`props`): `Container`

Defined in: imagebackground.ts:77

ImageBackground — children layered over a bitmap: the React Native
`<ImageBackground>` analog.

  <ImageBackground src="sloth.png" width={120} height={120}>
    <Label style={clock} string={() => time()} />   // a clock over the bitmap
  </ImageBackground>

Builds `new Texture(src)` (the ".png" suffix is MANDATORY — gotcha 19) into a
texture Skin sized `width`x`height` (anchored 0,0), rides that Skin on a
`new Container` carrying the SAME explicit width/height (gotcha 16 — a size-less
container measures 0 and draws nothing), and mounts `children` ON TOP via
appendChild (the Card composition idiom). A Piu Container paints its skin first,
then its contents, so the children render over the bitmap; a lone unanchored
child centers. `width`/`height` are construction-time (gotcha 16 / the port's
static-coordinate rule) — never reactive. Everything is built per-call at
runtime (Rule 5 — no module scope). See the module header.

## Parameters

### props

[`ImageBackgroundProps`](../type-aliases/ImageBackgroundProps.md)

## Returns

`Container`
