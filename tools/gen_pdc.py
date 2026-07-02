#!/usr/bin/env python3
"""Minimal Pebble Draw Command (PDC) image emitter — enough to de-risk the
SVGImage vector path before pulling in the full svg2pdc toolchain.

Emits a PDCI (single draw-command image) from a tiny display list of
circles/paths. Byte layout per developer.repebble.com/guides/app-resources/
pdc-format (all little-endian):
  "PDCI" | u32 size | u8 ver=1 | u8 rsvd=0 | i16 w | i16 h | <command list>
  list:  u16 num_commands | commands...
  circle: u8 type=2 | u8 flags | u8 stroke_col | u8 stroke_w | u8 fill_col
          | u16 radius | u16 npoints=1 | i16 cx | i16 cy
  path:   u8 type=1 | u8 flags | u8 stroke_col | u8 stroke_w | u8 fill_col
          | u8 open | u8 rsvd | u16 npoints | (i16 x,i16 y)*n

Colors are Pebble GColor8 = 0bAARRGGBB (2 bits/channel). gcolor() maps an
(r,g,b) 0-255 triple to the nearest GColor8 byte, opaque.
"""
import struct


def gcolor(r, g, b, a=255):
    q = lambda v: round(v / 255 * 3)          # 0..3 per channel
    return (q(a) << 6) | (q(r) << 4) | (q(g) << 2) | q(b)


CLEAR = 0x00                                  # a=0 -> transparent


def circle(cx, cy, radius, fill, stroke=CLEAR, stroke_w=0):
    return struct.pack("<BBBBBHHhh", 2, 0, stroke, stroke_w, fill,
                       radius, 1, cx, cy)


def path(points, fill, stroke=CLEAR, stroke_w=0, closed=True):
    body = struct.pack("<BBBBBBBH", 1, 0, stroke, stroke_w, fill,
                       0 if closed else 1, 0, len(points))
    for x, y in points:
        body += struct.pack("<hh", x, y)
    return body


def image(width, height, commands):
    cmd_list = struct.pack("<H", len(commands)) + b"".join(commands)
    body = struct.pack("<BBhh", 1, 0, width, height) + cmd_list
    return b"PDCI" + struct.pack("<I", len(body)) + body


if __name__ == "__main__":
    # de-risk asset: a single tan circle. Coordinates are TOP-LEFT origin
    # (matching svg2pdc, whose translate = -viewbox origin), so a centered
    # circle in a 100x100 viewbox sits at (50,50).
    data = image(100, 100, [circle(50, 50, 44, gcolor(255, 170, 85))])
    import os
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "assets", "testcircle.pdc")
    open(out, "wb").write(data)
    print("wrote", out, len(data), "bytes")
