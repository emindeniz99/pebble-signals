#!/usr/bin/env python3
"""Generate assets/slothvec.pdc — a flat-vector sloth as Pebble Draw
Commands, authored in a 60x60 viewbox and rendered at 2x (120px) on the
watch via SVGImage.scale(2,2). Everything is PATHS (polygons): the port's
transform scales path points + stroke widths but NOT circle radii, so
circles would break under scale. Ellipses are approximated by N-gons.

Colors are pre-quantized to Pebble's 2-bit/channel grid. Output is ~600B
— the whole animated-scalable image costs less flash than one row of the
raster sloth's pixels.

Run: python3 tools/gen_sloth_pdc.py
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_pdc import gcolor, path, image  # noqa: E402

FUR    = gcolor(170, 85, 0)
FUR_D  = gcolor(85, 85, 0)
FACE   = gcolor(255, 170, 85)
PATCH  = gcolor(85, 85, 0)
EYE    = gcolor(0, 0, 0)
NOSE   = gcolor(85, 0, 0)
LEAF   = gcolor(0, 170, 0)
CHEEK  = gcolor(255, 85, 85)


def ngon(cx, cy, rx, ry, n=14, rot=0.0):
    """Integer polygon approximating an ellipse."""
    pts = []
    for i in range(n):
        a = rot + 2 * math.pi * i / n
        pts.append((round(cx + rx * math.cos(a)), round(cy + ry * math.sin(a))))
    # dedupe consecutive equal points after rounding
    out = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    return out


cmds = [
    # branch across the top
    path([(2, 4), (58, 4), (58, 9), (2, 9)], FUR_D),
    # leaf clusters
    path(ngon(10, 6, 6, 3, 8), LEAF),
    path(ngon(50, 6, 6, 3, 8), LEAF),
    # arms reaching up to the branch
    path([(20, 30), (14, 8), (19, 8), (26, 28)], FUR),
    path([(40, 30), (46, 8), (41, 8), (34, 28)], FUR),
    # ears
    path(ngon(15, 22, 6, 6, 10), FUR_D),
    path(ngon(45, 22, 6, 6, 10), FUR_D),
    # head (big fur mass)
    path(ngon(30, 32, 19, 18, 16), FUR),
    # cream face
    path(ngon(30, 34, 14, 13, 16), FACE),
    # eye patches (angled teardrops)
    path(ngon(24, 31, 5, 7, 10, rot=0.3), PATCH),
    path(ngon(36, 31, 5, 7, 10, rot=-0.3), PATCH),
    # eyes
    path(ngon(24, 31, 2, 2, 6), EYE),
    path(ngon(36, 31, 2, 2, 6), EYE),
    # rosy cheeks
    path(ngon(20, 39, 3, 2, 6), CHEEK),
    path(ngon(40, 39, 3, 2, 6), CHEEK),
    # nose + smile (open stroked path)
    path(ngon(30, 38, 2, 2, 6), NOSE),
    path([(26, 42), (30, 44), (34, 42)], 0, stroke=NOSE, stroke_w=1, closed=False),
]

data = image(60, 60, cmds)
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "slothvec.pdc")
open(out, "wb").write(data)
print("wrote", out, len(data), "bytes,", len(cmds), "commands")
