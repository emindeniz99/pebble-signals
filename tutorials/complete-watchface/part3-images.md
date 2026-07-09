# Part 3 — images (bitmaps and vectors)

Goal: artwork on the face — and animated, since a static PNG is rarely the
point of a watchface.

## Bitmaps — `Texture` + reactive `skin`

Drop PNGs in `assets/`, name them in a `Texture`, and swap skins through a
signal (this is the shipped `imgwatch` example — an animated color bitmap
plus a live clock; receipts `imgwatch-red.png`/`imgwatch-blue.png`):

```tsx
const skinA = new Skin({ texture: new Texture("ball0.png"), x: 0, y: 0, width: 64, height: 64 });
const skinB = new Skin({ texture: new Texture("ball1.png"), x: 0, y: 0, width: 64, height: 64 });

const [frame, setFrame] = useState(0);
setInterval(() => setFrame((f) => f + 1), 450);

<Content width={64} height={64} skin={() => (frame() % 2 ? skinB : skinA)} />
```

- `gen-manifest` derives the resource entries from the `new Texture("…")`
  literals — nothing to declare by hand; the png2bmp pipeline compiles each
  PNG into flash.
- The **reactive `skin` binding is the animation primitive**: a frame-swap
  is one signal write, no re-layout. (Writing `visible` crashes this port;
  swapping skins does not — measured.)
- Sprite sheets beat file pairs when frames share a palette: one `Texture`,
  several `Skin`s with different `x/y` offsets into it — the polished
  `sloth` face animates its blink that way.

## Vectors — PDC via `SVGImage`

For line art that must scale (round 260px gabbro vs rect 200px emery),
bitmaps cost a size variant each; a **PDC** (Pebble Draw Command) file is
resolution-free and tiny. The `slothvec` face draws a 2.8KB PDC at 2× with
zero pixel RAM, swings and blinks by driving its transform reactively —
receipts `slothvec-gabbro.png`/`slothvec-emery.png`.

The port gotcha worth its own line: apply SVGImage transforms POST-mount
(inside a behavior/effect), never in the construction dict — every official
example does it that way, and the bind step clobbers construction-time
transform state (the SVGImage saga, project CLAUDE.md Rule 1).

## Cost model

Pixels live in flash; the ARENA cost of an image is just its Piu node.
What kills faces is not the artwork but per-frame allocation — animate by
swapping prebuilt `Skin`s (allocation-free per frame, the `imgwatch`/`sloth`
shape), never by constructing skins inside a binding.

Next: [Part 4 — a settings page](part4-settings.md).
