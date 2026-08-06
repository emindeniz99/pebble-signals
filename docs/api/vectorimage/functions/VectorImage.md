[**pebble-signals**](../../README.md)

***

[pebble-signals](../../README.md) / [vectorimage](../README.md) / VectorImage

# Function: VectorImage()

> **VectorImage**(`props`): `Content`

Defined in: [vectorimage.ts:120](https://github.com/emindeniz99/pebble-signals/blob/main/src/embeddedjs/runtime/vectorimage.ts#L120)

VectorImage — a resolution-independent PDC vector image with post-mount
transforms, on ONE host `SVGImage` node (zero pixel RAM).

  // static: a 60px viewbox drawn at 2x, pivoted at the branch grip
  <VectorImage src="slothvec.pdc" width={120} height={120}
    center={[30, 7]} translate={[30, 7]} scale={2} />

  // reactive: a slow swing — VectorImage re-applies the rotate thunk on change
  const [angle, setAngle] = useState(0);
  <VectorImage src="slothvec.pdc" width={120} height={120}
    center={[30, 7]} translate={[30, 7]} scale={2} rotate={() => angle()} />

`scale`/`rotate` take a bare number (constant) or a thunk (reactive — read a
signal inside and it re-applies on change); `center`/`translate` are static
`[x,y]` pivot/offset tuples. ALL transforms are applied AFTER mount (in a Piu
`onDisplaying` hook) — MANDATORY on this port; see the module header for the
four hard SVGImage rules (the invisible-circle saga). Pass the SCALED
width/height (a viewbox drawn at 2x needs twice the box). Returns the SVGImage
node (a Content); drop it straight into a Column/Container.

## Parameters

### props

[`VectorImageProps`](../type-aliases/VectorImageProps.md)

## Returns

`Content`
