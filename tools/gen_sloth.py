#!/usr/bin/env python3
"""Generate assets/sloth.png — a blink sprite sheet for the sloth watchface
(examples/sloth.tsx). The shipped sheet is 2 frames (eyes open / closed) at
140px; the runtime shows one FRAME-wide slice at a time via the reactive
`variant` prop. Frame size and the frame list are overridable via the
SLOTH_FRAME / SLOTH_MODES env vars — bigger frames mean more decoded pixels
in the native app heap (NOT the XS heap), so 140px is the tested ceiling
that still leaves the watchface booting comfortably.

Design (Apple-emoji / Jony-Ive intent, within Pebble's 6-bit 64-color
display): a warm, rounded sloth hanging from a leafy branch. Volume comes
from soft OFF-CENTER radial shading (highlight up-left, shadow down-right)
rather than flat fills; cheeks are a blurred blush layer. Everything is
authored at 4x and downsampled with LANCZOS so the tone steps blend into
smooth gradients before png2bmp quantizes to the device palette.

Run: python3 tools/gen_sloth.py   (writes assets/sloth.png)
"""
import os
from PIL import Image, ImageDraw, ImageFilter

# FRAME size + which eye frames, overridable from the CLI to probe the
# native-heap ceiling (bigger frame = more decoded pixels in native RAM).
FRAME = int(os.environ.get("SLOTH_FRAME", "140"))
MODES = os.environ.get("SLOTH_MODES", "open,closed").split(",")
FRAMES = len(MODES)
S = 4                      # supersample factor
N = FRAME * S              # hi-res frame edge
K = N / 104.0              # design(104-space) -> hi-res pixels

# palette (authored smooth; the device quantizes to nearest of 64)
FUR_L   = (222, 158, 104)
FUR_M   = (176, 110, 62)
FUR_D   = (104, 58, 28)
FACE_L  = (255, 246, 214)
FACE_M  = (241, 214, 166)
FACE_D  = (206, 168, 120)
PATCH   = (120, 66, 34)
PATCH_D = (150, 90, 50)
EYE     = (38, 26, 20)
WHITE   = (255, 255, 255)
NOSE    = (70, 40, 30)
MOUTH   = (120, 66, 46)
CHEEK   = (244, 150, 150)
BR_L    = (156, 106, 58)
BR_D    = (98, 62, 32)
LEAF_L  = (120, 188, 74)
LEAF_D  = (66, 138, 50)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def blob(d, cx, cy, rx, ry, c_out, c_in, lx=0.0, ly=0.0, steps=26, shrink=0.9):
    """Soft radial-shaded ellipse: dark (c_out) at the rim easing to bright
    (c_in) at a highlight point offset by (lx,ly) fractions of the radius."""
    for i in range(steps):
        t = i / (steps - 1)
        col = lerp(c_out, c_in, t)
        rrx, rry = rx * (1 - t * shrink), ry * (1 - t * shrink)
        ox, oy = cx + lx * rx * t, cy + ly * ry * t
        d.ellipse([ox - rrx, oy - rry, ox + rrx, oy + rry], fill=col)


def s(*vals):               # scale 104-space coords to hi-res
    return tuple(int(v * K) for v in vals)


def draw_eye(d, cx, cy, mode):
    cx, cy = cx * K, cy * K
    rx, ry = 7 * K, 8 * K
    if mode == "closed":
        d.arc([cx - 7 * K, cy - 3 * K, cx + 7 * K, cy + 7 * K],
              200, 340, fill=EYE, width=int(2 * K))
        return
    # glossy dark eye with two catch-lights
    blob(d, cx, cy, rx, ry, (10, 8, 6), EYE, -0.3, -0.3, steps=14, shrink=0.7)
    d.ellipse([cx - 3 * K, cy - 4 * K, cx + K, cy], fill=WHITE)       # main gloss
    d.ellipse([cx + 2 * K, cy + 2 * K, cx + 4 * K, cy + 4 * K], fill=(220, 220, 220))
    if mode == "half":                                                # sleepy lid
        d.rectangle([cx - 9 * K, cy - 10 * K, cx + 9 * K, cy - K], fill=PATCH)


def draw_frame(mode):
    im = Image.new("RGB", (N, N), (0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = FRAME // 2

    # --- branch across the top (shaded bough) + leaf clusters ---
    blob(d, cx * K, 11 * K, 52 * K, 6 * K, BR_D, BR_L, 0, -0.4, steps=10, shrink=0.55)
    for lx, ly, r in ((20, 8, 10), (34, 5, 7), (84, 8, 10), (70, 5, 7)):
        blob(d, lx * K, ly * K, r * K, (r - 2) * K, LEAF_D, LEAF_L, -0.3, -0.4,
             steps=10, shrink=0.8)

    # --- arms up to the branch with little clawed paws ---
    for sgn in (-1, 1):
        sx = cx + sgn * 22
        d.line([s(sx, 40), s(cx + sgn * 16, 16)], fill=FUR_M, width=int(9 * K))
        blob(d, (cx + sgn * 16) * K, 15 * K, 8 * K, 7 * K, FUR_D, FUR_L,
             -0.3, -0.3, steps=12, shrink=0.75)
        for k in (-4, 0, 4):                                          # claws
            d.line([s(cx + sgn * 16 + k, 11), s(cx + sgn * 16 + k, 20)],
                   fill=FACE_L, width=int(2 * K))

    # --- ears (small fur bumps) ---
    for sgn in (-1, 1):
        blob(d, (cx + sgn * 26) * K, 34 * K, 12 * K, 12 * K, FUR_D, FUR_L,
             -0.3 * sgn, -0.3, steps=14, shrink=0.8)

    # --- head (big rounded fur mass, light from up-left) ---
    blob(d, cx * K, 58 * K, 35 * K, 34 * K, FUR_D, FUR_L, -0.32, -0.34,
         steps=30, shrink=0.92)

    # --- face mask (cream, its own soft volume) ---
    blob(d, cx * K, 63 * K, 27 * K, 26 * K, FACE_D, FACE_L, -0.28, -0.3,
         steps=26, shrink=0.9)

    # --- eye patches: soft teardrops framing the eyes ---
    for sgn in (-1, 1):
        ex = cx + sgn * 12
        blob(d, ex * K, 58 * K, 11 * K, 15 * K, PATCH, PATCH_D, 0.1 * sgn, -0.2,
             steps=16, shrink=0.85)

    # --- cheeks: blurred pink blush on its own layer ---
    blush = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blush)
    for sgn in (-1, 1):
        bd.ellipse([s(cx + sgn * 20 - 8, 68), s(cx + sgn * 20 + 8, 80)],
                   fill=CHEEK + (150,))
    blush = blush.filter(ImageFilter.GaussianBlur(int(5 * K / 2)))
    im = Image.alpha_composite(im.convert("RGBA"), blush).convert("RGB")
    d = ImageDraw.Draw(im)

    # --- eyes ---
    draw_eye(d, cx - 12, 60, mode)
    draw_eye(d, cx + 12, 60, mode)

    # --- nose + gentle smile ---
    blob(d, cx * K, 69 * K, 4 * K, 3 * K, NOSE, (110, 74, 58), -0.2, -0.3,
         steps=8, shrink=0.7)
    d.arc([s(cx - 9, 70), s(cx, 80)], 20, 150, fill=MOUTH, width=int(2 * K))
    d.arc([s(cx, 70), s(cx + 9, 80)], 30, 160, fill=MOUTH, width=int(2 * K))

    return im.resize((FRAME, FRAME), Image.LANCZOS)


def main():
    sheet = Image.new("RGB", (FRAME * FRAMES, FRAME), (0, 0, 0))
    for i, mode in enumerate(MODES):
        sheet.paste(draw_frame(mode), (i * FRAME, 0))
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, "assets", "sloth.png")
    sheet.save(out)
    print("wrote", out, sheet.size)


if __name__ == "__main__":
    main()
