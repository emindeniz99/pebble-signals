// qrprobe — first render receipt for the host's QRCode Piu content, which the
// bind-coverage audit catalogued but never exercised (docs/components.md
// "Hostprobe discoveries"). hostprobe's gabbro frame already showed BOTH
// `typeof importNow("qrcode") === "object"` (the raw qrcodegen encoder) and
// `typeof QRCode === "function"` INSIDE the mod compartment; the host source
// says why the global is reachable at all —
//   build/devices/pebble/host/main.js:164   `QRCode,` in the compartment globals
//   modules/piu/Pebble/piuPebble.js:206-217 `globalThis.QRCode = Template(…)`
// — so this probe takes the DIRECT content path (`new QRCode`) over the encoder
// path: importNow("qrcode") hands back an ArrayBuffer of modules that we would
// then have to blit into a Texture ourselves, which is more code and would
// prove the ENCODER, not the content node the app surface actually offers.
//
// What modules/piu/Pebble/piuQRCode.c forces (read BEFORE writing this, Rule 1):
//  * `string` is the only extra dict key (PiuQRCodeDictionary, :81) — `maxVersion`
//    is MC-only, so Pebble always encodes at the default VERSION_MAX and eats a
//    ~7.8KB c_malloc in the app's C heap (NOT the 32KB XS arena). An on-device
//    "no memory" from there refutes the node, not our layout.
//  * `string` is REQUIRED: PiuQRCodePlace (:166) dereferences it unconditionally,
//    so a stringless QRCode is a null-deref at layout, not a catchable throw.
//  * width/height are REQUIRED: Place passes fit = min(w,h) to the encoder, which
//    RangeErrors on fit<=0 and fails "can't fit" when fit < the module count
//    (data/qrcode/qrcode.c:108). "https://repebble.com" is 20 bytes → version 2
//    → 25 modules, so 124 scales x4 to a 100px symbol inside a 12px (3-module)
//    white quiet zone — the margin is what makes the frame phone-scannable.
//  * NO skin, deliberately: with one, PiuQRCodeDraw (:97-100) assigns fillColor
//    TWICE and never strokeColor (upstream typo), leaving the module tint unset.
//    Skinless takes the else branch — white fill, black modules — the only sound
//    path in 4.17.
// Construction failures land in the caption via try/catch. LAYOUT failures can
// NOT: Place runs from the firmware redraw callback (piuView.c doUpdate →
// PiuApplicationAdjust), long after this module returns, so those surface as a
// crash frame — which is a receipt too. No dynamic import here, so treeshake
// stays on (hostprobe.tsx needs TREESHAKE_FORCE=1; this does not).
// Build: APP=qrprobe node build.mts
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "18px Gothic", color: "white", horizontal: "center" });
const [cap, setCap] = useState("qr probe");

// bottom:40 keeps the caption clear of the 124px tile AND inside gabbro's circle
// (a full-width label pinned at bottom:0 loses its ends under the round bezel).
const app = render(() => (
	<Label left={0} right={0} bottom={40} height={22} style={st} string={() => cap()} />
), { skin: bg, style: st });

// Unconstrained content centers itself in its container — the SDK's own
// examples/piu/qrcode/main.js adds the QRCode to `application` exactly like this.
try {
	app.add(new QRCode(null, { width: 124, height: 124, string: "https://repebble.com" }));
} catch (e) {
	setCap("ERR " + String((e as Error).message).slice(0, 18));
}
