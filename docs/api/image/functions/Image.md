[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [image](../README.md) / Image

# Function: Image()

> **Image**(`props`): `Content`

Defined in: [image.ts:90](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/image.ts#L90)

Image — a single bitmap on one Piu Content: the React Native `<Image>` analog.

  <Image src="sloth.png" width={68} height={68} />              // static bitmap

  const [f] = useState(0);                                      // sprite sheet:
  <Image src="ball.png" width={32} height={32}                 // 32px frames,
         variants={32} variant={() => f() % 4} />               // reactive index

Builds `new Texture(src)` (the ".png" suffix is MANDATORY — gotcha 19) into a
texture Skin sized `width`x`height` and rides it on a `new Content`. With
`variants` the Skin is a horizontal filmstrip and `variant` selects the frame:
a THUNK drives ONE effect that writes `content.variant` on change (idiom 5b —
the write is on the REACTIVE_PROPS whitelist, device-proven), a bare number is
applied once. `width`/`height` are construction-time (gotcha 16 / the port's
static-coordinate rule) — never reactive. Everything is built per-call at
runtime (Rule 5 — no module scope). See the module header.

## Parameters

### props

[`ImageProps`](../type-aliases/ImageProps.md)

## Returns

`Content`
