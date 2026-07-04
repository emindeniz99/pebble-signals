#!/usr/bin/env python3
"""Extract the firmware HOST's interned symbol list from a Pebble SDK debug ELF.

Why you care: at boot, every symbol in a mod archive's SYMB atom that the
host does NOT already know costs one runtime key = one slot from the exactly
saturated boot budget (playbook "The boot floor"). This tool reads the
host preparation (gxPreparation) out of the firmware image, walks its key
table, and prints every name the host interns for free. Pipe both lists
into comm(1) — or use tools/xsa-symbols.py list output — to see exactly
which of YOUR symbols are the ones that cost:

  python3 tools/host-symbols.py $SDK/gabbro/qemu/gabbro_sdk_debug.elf > /tmp/host.txt
  python3 tools/xsa-symbols.py build/mods/gabbro/mc.xsa list | tail -n +2 > /tmp/mod.txt
  comm -23 <(sort -u /tmp/mod.txt) <(sort -u /tmp/host.txt)   # = new-to-host

Layout facts (xsAll.h sxPreparation, verified on SDK 4.17 gabbro):
version[4], aliasCount, heapCount, heap*, stackCount, stack*, colors*,
keyCount, keys**, nameModulo, names**, symbolModulo, symbols**, ...
Key slots are 16-byte txSlots; a key's string pointer sits at slot+8.
"""
import struct
import subprocess
import sys


def load_elf(path):
    data = open(path, "rb").read()
    assert data[:4] == b"\x7fELF" and data[4] == 1, "need a 32-bit ELF"
    e_phoff = struct.unpack_from("<I", data, 28)[0]
    e_phentsize = struct.unpack_from("<H", data, 42)[0]
    e_phnum = struct.unpack_from("<H", data, 44)[0]
    segs = []
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        p_type, p_offset, p_vaddr, _pa, p_filesz = struct.unpack_from("<IIIII", data, off)
        if p_type == 1:
            segs.append((p_vaddr, p_offset, p_filesz))
    return data, segs


def v2o(segs, addr):
    for vaddr, offset, size in segs:
        if vaddr <= addr < vaddr + size:
            return offset + (addr - vaddr)
    raise ValueError(f"vaddr {addr:#x} not mapped")


def main():
    path = sys.argv[1]
    # gxPreparation address from the symbol table (debug ELF keeps it)
    nm = subprocess.run(["nm", path], capture_output=True, text=True).stdout
    addr = None
    for line in nm.splitlines():
        if line.endswith(" gxPreparation"):
            addr = int(line.split()[0], 16)
    assert addr is not None, "gxPreparation not in symbol table (need the _sdk_debug.elf)"

    data, segs = load_elf(path)
    words = struct.unpack_from("<16I", data, v2o(segs, addr))
    key_count, keys_ptr = words[7], words[8]
    print(f"# host keys: {key_count} (prep version {words[0] & 0xFF}.{(words[0] >> 8) & 0xFF}, "
          f"aliases {words[1]}, heap slots {words[2]})", file=sys.stderr)
    for i in range(key_count):
        slot_ptr = struct.unpack_from("<I", data, v2o(segs, keys_ptr + 4 * i))[0]
        if slot_ptr == 0:
            continue
        str_ptr = struct.unpack_from("<I", data, v2o(segs, slot_ptr + 8))[0]
        if str_ptr == 0:
            continue
        o = v2o(segs, str_ptr)
        end = data.index(b"\x00", o)
        name = data[o:end]
        # a handful of early key slots are non-string builtins whose value
        # field is not a C string — skip anything that isn't printable ASCII
        if name and all(0x20 < b < 0x7F for b in name):
            print(name.decode("ascii"))


if __name__ == "__main__":
    main()
