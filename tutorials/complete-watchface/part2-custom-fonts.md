# Part 2 — custom fonts

Goal: your own typeface on the watch. The system table has about ten usable
keys (Gothic 14/18/24/28/36, Bitham 18/34/42, Roboto 21/49, Droid 28 — the
build's fontcheck knows them all); everything else comes from a TTF you ship.

## The whole recipe

1. Put the TTF at `src/tsx/examples/<app>/fonts/<Family>-<Suffix>.ttf`,
   where `<Suffix>` is `Regular`, `Bold`, `Italic`, or `BoldItalic`:

   ```
   src/tsx/examples/myface/fonts/LiberationSerif-Bold.ttf
   ```

2. Write the style string you'd expect:

   ```tsx
   const serif = new Style({ font: "bold 32px LiberationSerif", color: "white" });
   ```

That's it — the build does the rest (this shipped as the `fontface` example;
receipt `screenshots/fontface-gabbro.png` shows the serif clock next to
system Gothic).

## What actually happens (so the costs make sense)

- `gen-manifest` sees a `font:` literal that isn't a system key, finds the
  matching TTF by the `<Family>-<Suffix>` rule, and emits a font resource
  entry into the mod manifest.
- The toolchain's **fontbm** rasterizes the TTF at your requested size into
  a glyph atlas: `LiberationSerif-Bold-32.fnt` + `.png`, compiled into the
  mod archive.
- On the watch, the port's font lookup tries the system table first and then
  falls back to exactly those archive resources — this is the same mechanism
  the official `words` example uses.

The suffix naming is not a convention we invented: the port BUILDS the lookup
path as `<Family>-<Weight><Italic>` from your style string (`bold` →
`Bold`, `italic bold` → `BoldItalic`, neither → `Regular`), so the file name
must match what the string implies.

## Cost model — flash, not arena

The atlas lives in **flash** with the rest of the archive, not in the 32KB
JS arena. `fontface`'s archive grew ~13KB → ~23KB for a full-ASCII 95-glyph
atlas at 32px. If flash matters (real watches give a mod 256KB of
resources), trim the atlas: a clock needs only `"0123456789:"`. The build's
default is full printable ASCII; a `characters` override is a size
optimization to request when you need it.

## Fail-loud stays on

`fontcheck` (gotcha 20: an invalid font renders BLANK, no error) still fails
the build for any family that has neither a system key nor a TTF behind it —
a typo in the family name is a build error, not a blank watch.

Mind the license: ship only fonts you may redistribute (the example uses
Liberation Serif, SIL OFL — its license file sits next to the TTF).

Next: [Part 3 — images](part3-images.md).
