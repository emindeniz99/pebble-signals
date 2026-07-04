#!/usr/bin/env python3
"""Count (or list) the symbols a mod archive ships.

Why you care: at boot, fxMapArchive interns EVERY symbol in the archive's
SYMB atom into the machine — each name the firmware host doesn't already
know costs a runtime key, and keys allocate slot-side. At a saturated app
class ONE new symbol is fatal (measured: `"zk0" in skin` dies, `"fill" in
skin` boots — see README gotcha 15 correction). Budget symbols, not
archive kilobytes.

Usage:
  python3 tools/xsa-symbols.py build/mods/gabbro/mc.xsa        # count
  python3 tools/xsa-symbols.py build/mods/gabbro/mc.xsa list   # names too
"""
import struct
import sys


def atoms(buf, off, end):
    while off < end - 8:
        size = struct.unpack(">I", buf[off : off + 4])[0]
        yield buf[off + 4 : off + 8].decode("latin1"), off + 8, off + size
        off += size


def main():
    path = sys.argv[1]
    buf = open(path, "rb").read()
    size = struct.unpack(">I", buf[0:4])[0]
    assert buf[4:8] == b"XS_A", f"not a mod archive: {buf[4:8]!r}"
    for tag, s, e in atoms(buf, 8, size):
        if tag != "SYMB":
            continue
        count = struct.unpack("<H", buf[s : s + 2])[0]
        names = buf[s + 2 : e].split(b"\x00")[:-1]
        print(f"{path}: SYMB count={count}")
        if len(sys.argv) > 2:
            for n in names:
                print(" ", n.decode("latin1"))
        return
    print(f"{path}: no SYMB atom found", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
