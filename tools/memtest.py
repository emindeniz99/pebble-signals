#!/usr/bin/env python3
"""On-device memory audit for pebble-signals.

Opens ONE direct QemuTransport connection (kill pypkjs first — the qemu
port is single-client), enables app-log shipping, RELAUNCHES the app so
its XS machine starts while a log listener is attached (the firmware
clears kModdableCreationFlagLogInstrumentation at machine creation
otherwise and no stats ever stream), then samples the per-second
instrumentation while idling and while driving buttons.

Reports slot/chunk/stack usage, the post-GC floor, headroom against the
firmware-fixed 32KB arena, and exits nonzero if the app dies or usage
crosses the red line. Wire into CI as: pnpm run test:mem

Usage: memtest.py [platform] [--idle SEC] [--presses N]
       memtest.py [platform] --ramp [--max N] [--min N]

--ramp is the limit finder: it presses `up` once per step (each press adds
one todo row in the demo) and logs slot/chunk after every item until the
machine dies (fxAbort reboots the firmware — instrumentation stops and the
screen leaves the app). The output is the exact item count at the cliff,
so after adding a runtime feature you rerun this and immediately see how
far the ceiling moved. --min N fails the run (exit 6) if the app dies
before reaching N items — set it to the last measured limit minus margin
to use the ramp as a regression canary.
"""
import glob, json, os, re, socket, struct, sys, threading, time

for cand in glob.glob(os.path.expanduser("~/.local/share/uv/tools/pebble-tool/lib/python*/site-packages")):
    sys.path.insert(0, cand)
from libpebble2.communication import PebbleConnection
from libpebble2.communication.transports.qemu import QemuTransport, MessageTargetQemu
from libpebble2.communication.transports.qemu.protocol import QemuButton
from libpebble2.protocol.logs import AppLogShippingControl, AppLogMessage

ARENA = 32768          # firmware-fixed static arena (measured, SDK 4.17)
STACK = 6144           # fixed stack carve-out
RED_LINE = 0.90        # fail if the POST-GC FLOOR exceeds this share of the
                       # heap budget (the pre-GC peak naturally rides the
                       # ceiling — GC reclaiming it is healthy; a high floor
                       # means live objects, which GC cannot help)

platform = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "gabbro"
def arg(name, default):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default
idle_sec = arg("--idle", 12)
presses = arg("--presses", 8)
RAMP = "--ramp" in sys.argv

info = json.load(open("/tmp/pb-emulator.json"))[platform]["4.17"]
pebble = PebbleConnection(QemuTransport("localhost", info["qemu"]["port"]))
pebble.connect()
threading.Thread(target=pebble.run_sync, daemon=True).start()
time.sleep(0.8)
pebble.send_packet(AppLogShippingControl(enable=True))

samples = []           # dicts parsed from "instruments:" trace lines
death = {"seen": False}

def on_log(packet):
    try:
        msg = packet.message.split(chr(0))[0]
    except Exception:
        return
    if "fxAbort" in msg or "Exception" in msg:
        death["seen"] = True
        print(f"!! {msg}", flush=True)
    m = re.search(r"instruments: ([\d,\-]+)", msg)
    if not m:
        return
    f = m.group(1).split(",")
    if len(f) < 14:
        return
    samples.append({
        "free": int(f[6]), "chunkUsed": int(f[7]), "chunkAvail": int(f[8]),
        "slotUsed": int(f[9]), "slotAvail": int(f[10]),
        "stackUsed": int(f[11]), "gc": int(f[13]),
    })

pebble.register_endpoint(AppLogMessage, on_log)

BTN = {"back": 1, "up": 2, "select": 4, "down": 8}
def click(name, hold=0.12, settle=0.6):
    pebble.transport.send_packet(QemuButton(state=BTN[name]), target=MessageTargetQemu())
    time.sleep(hold)
    pebble.transport.send_packet(QemuButton(state=0), target=MessageTargetQemu())
    time.sleep(settle)

# Screen probe via the qemu monitor: the demo renders on black; launcher,
# menu and timeline are light. Lets the relaunch be state-aware instead of
# a blind button sequence (a `back` on the launcher opens the timeline!).
MONITOR = info["qemu"]["monitor"]
PPM = "/tmp/pebble-signals-memtest.ppm"

def screen_is_app():
    try:
        os.remove(PPM)                 # never parse a STALE dump
    except OSError:
        pass
    m = socket.socket(); m.settimeout(5)
    m.connect(("localhost", MONITOR)); time.sleep(0.15)
    try: m.recv(4096)
    except Exception: pass
    m.send(f"screendump {PPM}\n".encode()); time.sleep(0.6)
    try: m.recv(8192)
    except Exception: pass
    m.close()
    if not os.path.exists(PPM):
        print("[memtest] warn: screendump failed; assuming launcher", flush=True)
        return False
    with open(PPM, "rb") as fh:            # P6 header: magic, WxH, maxval
        assert fh.readline().strip() == b"P6"
        w, h = map(int, fh.readline().split())
        fh.readline()
        fh.seek(3 * (h // 2 * w + w // 2), 1)   # center pixel
        r, g, b = struct.unpack("BBB", fh.read(3))
    return (r + g + b) / 3 < 80

# Relaunch so the machine starts with the listener attached.
print(f"[memtest] relaunching app on {platform}...", flush=True)
if screen_is_app():
    click("back", settle=1.5)             # close the running app
click("select", settle=1.5)               # launcher -> menu
click("select", settle=2.0)               # menu -> app (stats stream)
if not screen_is_app():                    # menu may have timed out mid-way
    click("select", settle=1.5)
    click("select", settle=2.0)

# ---- ramp mode: add items until the machine dies -------------------------
if RAMP:
    max_items = arg("--max", 40)
    min_items = arg("--min", 0)
    budget = ARENA - STACK
    time.sleep(4)                       # settle; collect a baseline sample
    if not samples:
        print("[memtest] FAIL: no instrumentation received — is the app the "
              "top item in the launcher menu, and was pypkjs killed?", flush=True)
        sys.exit(2)
    prev = samples[-1]
    items = 0                           # the M9+ demo starts with an EMPTY store
    def used(s):
        return s["slotUsed"] + s["chunkUsed"]
    print(f"[memtest] ramp: adding one todo per step until the arena dies "
          f"(budget {budget} B)", flush=True)
    print(f"  item {items:3d}: slot {prev['slotUsed']:5d} + chunk {prev['chunkUsed']:5d}"
          f" = {used(prev):5d} B ({used(prev)/budget:4.0%})  [baseline]", flush=True)
    died = False
    while items < max_items:
        n0 = len(samples)
        try:
            click("up", settle=0.4)     # adds one todo row
        except Exception as e:
            print(f"  !! button send failed ({e}) — firmware gone", flush=True)
            died = True
            break
        # instrumentation streams ~1 sample/sec while the machine is alive;
        # silence after a press means fxAbort rebooted the firmware
        t0 = time.time()
        while len(samples) == n0 and time.time() - t0 < 6:
            time.sleep(0.3)
        if death["seen"]:
            died = True
            break
        # grace: instrumentation streams ~1/sec independently of button
        # processing, so the sample that unblocked us may PREDATE the press;
        # give a lethal press time to surface its abort before crediting
        time.sleep(1.2)
        if death["seen"]:
            died = True
            break
        if len(samples) == n0:
            time.sleep(2)               # let a reboot settle; monitor survives it
            alive = False
            try:
                alive = screen_is_app()
            except Exception:
                pass
            if not alive:
                died = True
                break
            print("[memtest] FAIL: screen still on app but instrumentation "
                  "stalled — tooling channel broke, rerun on a fresh chain", flush=True)
            sys.exit(3)
        items += 1
        s = samples[-1]
        delta = used(s) - used(prev)
        print(f"  item {items:3d}: slot {s['slotUsed']:5d} + chunk {s['chunkUsed']:5d}"
              f" = {used(s):5d} B ({used(s)/budget:4.0%})  [{delta:+d} B]", flush=True)
        prev = s
    if died:
        print(f"[memtest] DIED adding item {items + 1} "
              f"(last alive: {items} items)", flush=True)
        print(f"  last sample before death: slot {prev['slotUsed']} + chunk "
              f"{prev['chunkUsed']} = {used(prev)} B ({used(prev)/budget:.0%} of "
              f"budget), heap grown to slot {prev['slotAvail']} + chunk "
              f"{prev['chunkAvail']} B", flush=True)
        if items < min_items:
            print(f"[memtest] FAIL: died below the --min {min_items} regression "
                  f"floor", flush=True)
            sys.exit(6)
        print(f"[memtest] LIMIT = {items} items survive on this build", flush=True)
        sys.exit(0)
    print(f"[memtest] survived all {items} items without dying — raise --max "
          f"to find the cliff", flush=True)
    sys.exit(0)

t0 = time.time()
while time.time() - t0 < idle_sec:
    time.sleep(0.5)
idle = list(samples)
if not idle:
    print("[memtest] FAIL: no instrumentation received — is the app the "
          "top item in the launcher menu, and was pypkjs killed?", flush=True)
    sys.exit(2)

def floor(rows):       # post-GC floor: min across samples (GC troughs)
    return {k: min(r[k] for r in rows) for k in rows[0]}
def peak(rows):
    return {k: max(r[k] for r in rows) for k in rows[0]}

fi, pi = floor(idle), peak(idle)
print(f"[memtest] idle over {len(idle)} samples:", flush=True)
print(f"  slot  used {fi['slotUsed']}..{pi['slotUsed']} B  (heap grown to {pi['slotAvail']} B)", flush=True)
print(f"  chunk used {fi['chunkUsed']}..{pi['chunkUsed']} B  (avail {pi['chunkAvail']} B)", flush=True)
print(f"  stack used {pi['stackUsed']} B of {STACK} B", flush=True)

n0 = len(samples)
print(f"[memtest] driving {presses} interactions...", flush=True)
seq = ["select", "up", "select", "down", "select", "up", "select", "down"]
for i in range(presses):
    click(seq[i % len(seq)], settle=0.8)
time.sleep(4)
active = samples[n0:]
if not active:
    print("[memtest] FAIL: instrumentation stopped during interaction (app died)", flush=True)
    sys.exit(3)
fa, pa = floor(active), peak(active)
print(f"[memtest] under load ({len(active)} samples):", flush=True)
print(f"  slot  used {fa['slotUsed']}..{pa['slotUsed']} B  (heap grown to {pa['slotAvail']} B)", flush=True)
print(f"  chunk used {fa['chunkUsed']}..{pa['chunkUsed']} B", flush=True)
print(f"  GCs during load: {sum(r['gc'] for r in active)}", flush=True)

# Headroom model (all measured elsewhere in the README): the arena is
# 32768B; stack takes 6144B; slot and chunk heaps grow into the rest.
# What is not yet claimed by either heap is the remaining growth room.
grow_room = ARENA - STACK - pa["slotAvail"] - pa["chunkAvail"]
budget = ARENA - STACK
# min/max over per-sample SUMS: independent per-field minima can understate
# the true floor (min(a)+min(b) <= min(a+b)) and falsely PASS the red line
peak_usage = max(r["slotUsed"] + r["chunkUsed"] for r in active)
floor_usage = min(r["slotUsed"] + r["chunkUsed"] for r in active)
peak_share = peak_usage / budget
floor_share = floor_usage / budget
print(f"[memtest] arena math: {ARENA}B arena - {STACK}B stack = {budget}B for heaps", flush=True)
print(f"  pre-GC peak:   slot {pa['slotUsed']} + chunk {pa['chunkUsed']} = {peak_usage} B ({peak_share:.0%})", flush=True)
print(f"  post-GC floor: slot {fa['slotUsed']} + chunk {fa['chunkUsed']} = {floor_usage} B ({floor_share:.0%})", flush=True)
print(f"  transient (reclaimable by GC): {peak_usage - floor_usage} B", flush=True)
print(f"  unclaimed arena: {max(grow_room, 0)} B", flush=True)

if death["seen"]:
    print("[memtest] FAIL: abort/exception observed", flush=True)
    sys.exit(4)
if floor_share > RED_LINE:
    print(f"[memtest] FAIL: post-GC floor {floor_share:.0%} exceeds red line {RED_LINE:.0%}", flush=True)
    sys.exit(5)
print(f"[memtest] PASS — floor {floor_share:.0%} of budget; {budget - floor_usage} B above the floor, "
      f"{budget - peak_usage} B at the worst observed instant", flush=True)
