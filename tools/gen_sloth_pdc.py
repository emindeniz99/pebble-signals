#!/usr/bin/env python3
"""Generate assets/slothvec.pdc — a CELL-SHADED vector sloth as Pebble Draw
Commands, authored in a 60x60 viewbox and drawn at 2x (120px) on the watch via
SVGImage.scale(2,2). Everything is PATHS (polygons): the port's transform
scales path points + stroke widths but NOT circle radii, so circles break under
scale; ellipses are N-gons.

WHY IT LOOKS SHADED (not flat): PDC has NO gradient fill (verified against
developer.repebble.com/guides/app-resources/pdc-format — flat colour + stroke
only, no AA/bezier/alpha). So volume is faked the same way the raster
gen_sloth.py's blob() does it — MANY concentric flat-colour bands, dark at the
rim easing to light at a highlight offset up-left. Here each band is one PDC
polygon instead of a PIL ellipse; ~3-4 bands per mass keep it a few hundred
bytes yet read as rounded tone. Colours are pre-snapped to Pebble's 2-bit/
channel grid (64 colours) so the preview matches the device palette.

Emits BOTH the .pdc AND /tmp/slothvec_preview.png (a faithful flat, no-AA PIL
render at the device's 120px so the look can be judged without a watch).

Run: python3 tools/gen_sloth_pdc.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_pdc import gcolor, sequence, path as rawpath  # noqa: E402

# all sloth paths are PRECISE (1/8-px, type 3): required for correct rotation
# pivots — the port's transform math is in 1/8-px units.
pdc_path = lambda pts, fill, **kw: rawpath(pts, fill, precise=True, **kw)

# Palette — RGB triples pre-snapped to the {0,85,170,255} per-channel grid so
# gcolor() is lossless and the PIL preview matches the watch exactly.
BR_D = (85, 85, 0)      # branch / deepest fur shadow
BR_L = (170, 85, 0)
FUR_D = (85, 85, 0)     # fur: dark rim -> mid -> light crown (3 bands)
FUR_M = (170, 85, 0)
FUR_L = (255, 170, 85)
FACE_D = (255, 170, 85)  # cream face: shadow -> light -> tiny highlight
FACE_L = (255, 255, 170)
FACE_H = (255, 255, 255)
PATCH = (170, 85, 0)    # eye-patch teardrop (mid brown, frames the eyes)
EYE = (0, 0, 0)
CATCH = (255, 255, 255)  # eye catch-light
NOSE = (85, 0, 0)
CHEEK = (255, 85, 85)   # rosy blush
LEAF_D = (0, 85, 0)
LEAF_L = (0, 170, 0)


def sh(pts, fill=None, stroke=None, sw=0, closed=True):
    """One flat shape descriptor consumed by BOTH emitters."""
    return (pts, fill, stroke, sw, closed)


def ngon(cx, cy, rx, ry, n=16, rot=0.0):
    pts = []
    for i in range(n):
        a = rot + 2 * math.pi * i / n
        pts.append((round(cx + rx * math.cos(a)), round(cy + ry * math.sin(a))))
    return [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]


def mass(cx, cy, rx, ry, tones, lx=-0.30, ly=-0.34, n=18, shrink=0.58):
    """A rounded volume as concentric flat bands: tones dark->light, each a
    smaller N-gon nudged toward the (lx,ly) highlight. This is blob() as
    polygons — the cell-shading that stands in for a gradient."""
    out, k = [], len(tones)
    for i, rgb in enumerate(tones):
        t = i / (k - 1) if k > 1 else 0.0
        rrx, rry = rx * (1 - shrink * t), ry * (1 - shrink * t)
        ox, oy = cx + lx * rx * t, cy + ly * ry * t
        out.append(sh(ngon(round(ox), round(oy), round(rrx), round(rry), n), fill=rgb))
    return out


def eyes(mode):
    """open (round pupil + catch-light), half (lid band + squashed pupil),
    closed (happy stroked arcs)."""
    if mode == "open":
        return [
            sh(ngon(24, 31, 3, 4, 14), fill=EYE),     # tall round pupils
            sh(ngon(36, 31, 3, 4, 14), fill=EYE),
            sh(ngon(23, 30, 2, 2, 8), fill=CATCH),    # clearer catch-light up-left
            sh(ngon(35, 30, 2, 2, 8), fill=CATCH),
        ]
    if mode == "half":
        return [
            sh([(21, 28), (27, 28), (27, 31), (21, 31)], fill=PATCH),
            sh([(33, 28), (39, 28), (39, 31), (33, 31)], fill=PATCH),
            sh(ngon(24, 32, 3, 1, 8), fill=EYE),
            sh(ngon(36, 32, 3, 1, 8), fill=EYE),
        ]
    return [  # closed: gentle downward curves
        sh([(22, 31), (24, 33), (26, 31)], stroke=EYE, sw=1, closed=False),
        sh([(34, 31), (36, 33), (38, 31)], stroke=EYE, sw=1, closed=False),
    ]


def frame(mode):
    S = []
    # branch (2 tones) + leaf clusters (2 tones each)
    S += [sh([(2, 3), (58, 3), (58, 8), (2, 8)], fill=BR_D),
          sh([(2, 3), (58, 3), (58, 5), (2, 5)], fill=BR_L)]
    for cx in (10, 50):
        S += [sh(ngon(cx, 6, 6, 3, 8), fill=LEAF_D),
              sh(ngon(cx - 1, 5, 4, 2, 8), fill=LEAF_L)]
    # arms reaching to the branch
    S += [sh([(20, 30), (14, 8), (19, 8), (26, 28)], fill=FUR_M),
          sh([(40, 30), (46, 8), (41, 8), (34, 28)], fill=FUR_M)]
    # ears (rounder, lit from up-left like the head)
    S += mass(15, 22, 6, 6, [FUR_M, FUR_L], n=16)
    S += mass(45, 22, 6, 6, [FUR_M, FUR_L], n=16)
    # head — 2 clean fur bands (mid brown -> light crown), high N-gon for a
    # smooth silhouette. The 64-colour grid has no true dark brown (it snaps to
    # olive/maroon), so depth comes from the light crown + the cream-face
    # contrast, not a dark rim.
    S += mass(30, 33, 21, 20, [FUR_M, FUR_L], n=32)
    # cream face — 3 bands (shadow -> light -> up-left highlight crescent)
    S += mass(30, 35, 14, 13, [FACE_D, FACE_L, FACE_H], n=32, shrink=0.66)
    # eye-patch teardrops framing the eyes
    S += [sh(ngon(24, 31, 5, 7, 12, rot=0.3), fill=PATCH),
          sh(ngon(36, 31, 5, 7, 12, rot=-0.3), fill=PATCH)]
    # eyes
    S += eyes(mode)
    # rosy cheeks + nose + smile
    S += [sh(ngon(20, 39, 3, 2, 8), fill=CHEEK),
          sh(ngon(40, 39, 3, 2, 8), fill=CHEEK),
          sh(ngon(30, 38, 2, 2, 8), fill=NOSE),
          sh([(26, 42), (30, 44), (34, 42)], stroke=NOSE, sw=1, closed=False)]
    return S


def to_pdc(shapes):
    cmds = []
    for pts, fill, stroke, sw, closed in shapes:
        cmds.append(pdc_path(pts, gcolor(*fill) if fill else 0,
                             stroke=gcolor(*stroke) if stroke else 0x00,
                             stroke_w=sw, closed=closed))
    return cmds


def to_png(frames_shapes, w, h, scale=2, zoom=4):
    """Faithful flat, no-AA preview at the device's 120px, then nearest-upscaled
    for viewing. Draws the SAME shapes/colours the watch will."""
    from PIL import Image, ImageDraw
    strip = Image.new("RGB", (w * scale * len(frames_shapes), h * scale), (0, 0, 0))
    for fi, shapes in enumerate(frames_shapes):
        im = Image.new("RGB", (w * scale, h * scale), (0, 0, 0))
        d = ImageDraw.Draw(im)
        for pts, fill, stroke, sw, closed in shapes:
            P = [(x * scale, y * scale) for x, y in pts]
            if fill is not None and len(P) >= 3:
                d.polygon(P, fill=fill)
            if stroke is not None:
                d.line(P + ([P[0]] if closed else []), fill=stroke, width=max(1, sw * scale))
        strip.paste(im, (fi * w * scale, 0))
    return strip.resize((strip.width * zoom // scale, strip.height * zoom // scale), Image.NEAREST)


# PDCS blink sequence — hold open, quick half/closed/half.
MODES = [("open", 2600), ("half", 90), ("closed", 150), ("half", 90)]
frames = [(dur, to_pdc(frame(m))) for m, dur in MODES]
data = sequence(60, 60, frames)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "assets", "slothvec.pdc")
open(out, "wb").write(data)
print("wrote", out, len(data), "bytes,", len(frames), "frames")

# faithful preview strip (open / half / closed), device palette, no AA
try:
    prev = to_png([frame("open"), frame("half"), frame("closed")], 60, 60)
    prev.save("/tmp/slothvec_preview.png")
    print("preview /tmp/slothvec_preview.png", prev.size)
except ImportError:
    pass
