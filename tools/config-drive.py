#!/usr/bin/env python3
"""Headless config-page driver — the Clay flow with no browser.

Speaks the phonesim (pypkjs) websocket protocol directly:
  send 0x0a 0x01                    -> pkjs gets "showConfiguration",
                                       calls Pebble.openURL(<page url>)
  recv 0x0a 0x01 <len:be32> <url>   -> pypkjs broadcasts the page URL
  send 0x0a 0x02 <len:be32> <query> -> pkjs gets "webviewclosed" with
                                       e.response = <query>
pkjs then forwards the (URL-encoded) settings JSON to the watch as
AppMessage key 10000 (src/pkjs/index.ts); examples/config.tsx applies it.

Usage: config-drive.py <platform> '<settings json>'
  e.g. config-drive.py gabbro '{"text":"hi","invert":1}'

NOTE: pypkjs must be RUNNING (it is right after `pebble install`; do NOT
pkill it first — this is the opposite requirement from drive.py, which
talks to the qemu port pypkjs occupies).
"""
import json, struct, sys, time
import glob, os
for cand in glob.glob(os.path.expanduser("~/.local/share/uv/tools/pebble-tool/lib/python*/site-packages")):
    sys.path.insert(0, cand)
import websocket  # websocket-client, vendored by pebble-tool
from urllib.parse import quote

platform, settings = sys.argv[1], sys.argv[2]
json.loads(settings)  # fail loud on bad JSON before touching the emulator
port = json.load(open("/tmp/pb-emulator.json"))[platform]["4.17"]["pypkjs"]["port"]

ws = websocket.create_connection(f"ws://localhost:{port}/", timeout=10)
ws.send(b"\x0a\x01", opcode=websocket.ABNF.OPCODE_BINARY)  # open config

# wait for the openURL broadcast (0x0a 0x01 <len> <url>); other traffic
# (relayed pebble protocol, 0x00/0x01 frames) is skipped
url = None
deadline = time.time() + 10
while time.time() < deadline:
    frame = ws.recv()
    if isinstance(frame, (bytes, bytearray)) and len(frame) > 6 and frame[0] == 0x0A and frame[1] == 0x01:
        (n,) = struct.unpack_from(">I", frame, 2)
        url = frame[6 : 6 + n].decode("utf-8")
        break
if url is None:
    print("config-drive: no openURL broadcast — is the config app installed & pkjs ready?")
    sys.exit(1)
print(f"config-drive: pkjs opened {url}")

# answer as if the page closed with our settings (pkjs decodeURIComponent()s)
query = quote(settings).encode("utf-8")
ws.send(b"\x0a\x02" + struct.pack(">I", len(query)) + query, opcode=websocket.ABNF.OPCODE_BINARY)
print(f"config-drive: sent webviewclosed response ({settings})")
ws.close()
