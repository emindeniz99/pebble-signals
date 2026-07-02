#!/usr/bin/env python3
"""Generate assets/sloth.png — a 3-frame blink sprite sheet for the sloth
watchface (examples/sloth.tsx). Each frame is FRAME x FRAME; the sheet is
3 frames wide (eyes: open / half / closed). The runtime shows one frame at
a time via the reactive `variant` prop (a horizontal FRAME-wide slice).

Design notes:
- Pebble's display is 6-bit color (2 bits/channel), so every channel snaps
  to {0, 85, 170, 255}. We author directly in that space (see palette) so
  nothing turns muddy on-device — the biggest problem with the first cut.
- A cheerful, colorful sloth: warm-orange body, cream face, the classic
  dark eye-stripes, pink cheeks, a smile, hanging from a green-leafed
  branch by clawed arms. Bright on the black watch background.

Run: python3 tools/gen_sloth.py   (writes assets/sloth.png)
"""
import os
from PIL import Image, ImageDraw

FRAME = 104
FRAMES = 3
W, H = FRAME * FRAMES, FRAME

# palette — pre-quantized to the Pebble 2-bit/channel grid {0,85,170,255}
BRANCH   = (170, 85, 0)      # brown bough
LEAF     = (0, 170, 0)       # green leaves
BODY     = (255, 170, 85)    # warm orange fur
BODY_DK  = (170, 85, 0)      # body shade / underside
FACE     = (255, 255, 170)   # cream face
STRIPE   = (170, 85, 0)      # dark eye-stripes (classic sloth mask)
EYEW     = (255, 255, 255)   # eye white
PUPIL    = (0, 0, 0)
NOSE     = (85, 0, 0)
CHEEK    = (255, 170, 170)   # rosy cheeks
MOUTH    = (85, 0, 0)
CLAW     = (255, 255, 170)   # pale claws


def ellipse(d, cx, cy, rx, ry, fill):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def draw_frame(eye):  # eye: 'open' | 'half' | 'closed'
    im = Image.new("RGB", (FRAME, FRAME), (0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = FRAME // 2

    # --- branch across the top, with a couple of leaves ---
    d.rounded_rectangle([2, 6, FRAME - 3, 17], radius=5, fill=BRANCH)
    ellipse(d, 20, 8, 9, 5, LEAF)
    ellipse(d, 84, 8, 9, 5, LEAF)
    ellipse(d, 34, 6, 6, 4, LEAF)

    # --- arms reaching up to hook the branch, with claws ---
    for sx in (30, FRAME - 30):
        d.line([sx, 46, cx + (sx - cx) // 2, 20], fill=BODY, width=9)
        ellipse(d, cx + (sx - cx) // 2, 18, 7, 6, BODY)      # paw over bough
        d.line([cx + (sx - cx) // 2 - 4, 14, cx + (sx - cx) // 2 - 4, 24],
               fill=CLAW, width=2)                            # claws
        d.line([cx + (sx - cx) // 2, 13, cx + (sx - cx) // 2, 24],
               fill=CLAW, width=2)
        d.line([cx + (sx - cx) // 2 + 4, 14, cx + (sx - cx) // 2 + 4, 24],
               fill=CLAW, width=2)

    # --- body ---
    ellipse(d, cx, 70, 32, 31, BODY)
    ellipse(d, cx, 84, 22, 16, BODY_DK)     # tummy shade

    # --- face ---
    ellipse(d, cx, 60, 28, 26, FACE)

    # --- eye-stripes (the sloth "mask": brow down through each eye) ---
    for sgn in (-1, 1):
        ex = cx + sgn * 12
        d.polygon([(ex - 9, 44), (ex + 5, 46), (ex + 7, 70),
                   (ex - 5, 70)], fill=STRIPE)

    # --- cheeks ---
    ellipse(d, cx - 20, 68, 6, 5, CHEEK)
    ellipse(d, cx + 20, 68, 6, 5, CHEEK)

    # --- eyes (blink states) ---
    for sgn in (-1, 1):
        ex, ey = cx + sgn * 12, 60
        if eye == "open":
            ellipse(d, ex, ey, 7, 8, EYEW)
            ellipse(d, ex, ey + 1, 4, 4, PUPIL)
            ellipse(d, ex - 1, ey - 2, 1, 1, EYEW)   # catch-light
        elif eye == "half":
            ellipse(d, ex, ey, 7, 8, EYEW)
            ellipse(d, ex, ey + 2, 4, 3, PUPIL)
            d.rectangle([ex - 8, ey - 9, ex + 8, ey - 1], fill=STRIPE)  # lid
        else:  # closed — a happy downward lash curve
            d.arc([ex - 7, ey - 4, ex + 7, ey + 8], 200, 340,
                  fill=PUPIL, width=2)

    # --- nose + smile ---
    ellipse(d, cx, 70, 3, 3, NOSE)
    d.arc([cx - 9, 68, cx + 9, 82], 20, 160, fill=MOUTH, width=2)
    return im


def main():
    sheet = Image.new("RGB", (W, H), (0, 0, 0))
    for i, eye in enumerate(("open", "half", "closed")):
        sheet.paste(draw_frame(eye), (i * FRAME, 0))
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, "assets", "sloth.png")
    sheet.save(out)
    print("wrote", out, sheet.size)


if __name__ == "__main__":
    main()
