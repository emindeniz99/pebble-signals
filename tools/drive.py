#!/usr/bin/env python3
"""Deterministic emulator driver for signal-piu development.

Opens ONE direct QemuTransport connection to the running qemu-pebble and
uses it to press buttons, capture app logs, and screendump via the qemu
monitor. This bypasses pypkjs entirely, which matters because the pebble
tool's channel (install auto-launch, emu-button, logs) degrades after any
firmware reboot and silently drops button presses — every "flaky crash"
we chased for hours was really a lost launch keypress. Kill pypkjs first
(the qemu port is single-client): pkill -9 -f pypkjs

Usage: drive.py <platform> action...
  b:<name>       click button (select/up/down/back)
  s:<sec>        sleep
  d:<name>       screendump to <scratch>/<name>.ppm via qemu monitor
  listen:<sec>   just listen for logs
"""
import json, sys, time, threading
import glob, os
for cand in glob.glob(os.path.expanduser("~/.local/share/uv/tools/pebble-tool/lib/python*/site-packages")):
    sys.path.insert(0, cand)
from libpebble2.communication import PebbleConnection
from libpebble2.communication.transports.qemu import QemuTransport, MessageTargetQemu
from libpebble2.communication.transports.qemu.protocol import QemuPacket, QemuButton
from libpebble2.protocol.logs import AppLogShippingControl, AppLogMessage

platform = sys.argv[1]
info = json.load(open("/tmp/pb-emulator.json"))[platform]["4.17"]
port = info["qemu"]["port"]

pebble = PebbleConnection(QemuTransport("localhost", port))
pebble.connect()
threading.Thread(target=pebble.run_sync, daemon=True).start()
time.sleep(0.8)
pebble.send_packet(AppLogShippingControl(enable=True))

def on_log(packet):
    try:
        fn = packet.filename.split(chr(0))[0]
        msg = packet.message.split(chr(0))[0]
        print(f"LOG [{fn}:{packet.line_number}] {msg}", flush=True)
    except Exception as e:
        print("LOG decode err", e, flush=True)

pebble.register_endpoint(AppLogMessage, on_log)

BUTTONS = {"back": 1, "up": 2, "select": 4, "down": 8}

import socket as _socket
_moninfo = info["qemu"]["monitor"]
def dump(name):
    m = _socket.socket(); m.settimeout(5)
    m.connect(("localhost", _moninfo)); time.sleep(0.15)
    try: m.recv(4096)
    except Exception: pass
    m.send(f"screendump /tmp/signal-piu-drive/{name}.ppm\n".encode())
    time.sleep(0.6)
    try: m.recv(8192)
    except Exception: pass
    m.close()
    print(f"DUMP {name}", flush=True)

def send_qemu(payload):
    pebble.transport.send_packet(payload, target=MessageTargetQemu())

def click(name):
    state = BUTTONS[name]
    send_qemu(QemuButton(state=state))
    time.sleep(0.12)
    send_qemu(QemuButton(state=0))
    print(f"BTN {name}", flush=True)

for action in sys.argv[2:]:
    kind, _, val = action.partition(":")
    if kind == "b":
        click(val)
    elif kind == "s":
        time.sleep(float(val))
    elif kind == "listen":
        time.sleep(float(val))
    elif kind == "d":
        dump(val)
print("drive done", flush=True)
