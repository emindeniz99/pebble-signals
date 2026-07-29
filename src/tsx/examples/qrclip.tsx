// qrclip — the COUNTER-receipt for `<QR fullscreen />`. It answers the owner's
// question ("can a QR be fullscreen on a round watch?") the honest way: by
// rendering what "fullscreen" naively means — a SCREEN-SIZED square, 260×260 on
// gabbro — so the failure is visible instead of argued.
//
// Why it fails, in numbers (data/qrcode/qrcode.c: `scale = floor(fit / size)`,
// piuQRCode.c:133 centers the scaled symbol in the box). "https://repebble.com"
// is 20 bytes -> version 2 -> 25 modules:
//   * this app, fit 260  -> 10px modules, a 250px symbol whose corners sit
//     250/2·√2 = 177px from center — ~47px OUTSIDE gabbro's 130px radius. The
//     three CORNER finder patterns, the marks a scanner locks onto first, are
//     sliced by the bezel: the code looks almost fine and does not scan.
//   * qrprobe, `<QR fullscreen />` -> 183px inscribed square, 7px modules, a
//     175px symbol whose corners sit 124px from center — inside the glass with
//     ~6px to spare. Same screen, same string, whole code.
// So the answer is YES to fullscreen, but fullscreen must mean the INSCRIBED
// square (side = floor(diameter/√2)), which is what runtime/qrcode computes.
//
// Deliberately HAND-Piu (`new QRCode`), not `<QR size={screen.width} />`: this is
// the code someone writes BEFORE the component exists, so it must not depend on
// the component to make its point. (`<QR size={260} />` would draw the identical
// clipped frame — `size` is unclamped on purpose; `fullscreen` is the prop that
// does the math.)
//
// TWO acceptable receipts, both answers: (a) the expected one — an edge-to-edge
// code with visibly chopped corners; or (b) a crash/blank, because a 250px symbol
// needs a 32B×250 = 8000B mask ArrayBuffer in the 26.6KB XS arena (vs 4200B for
// the inscribed 183px and 1600B for a 124px tile). Either way the naive shape is
// refuted — an OOM is just a louder refutation. Nothing is captioned: a label
// would sit on top of the code and the bare frame IS the evidence.
// Build: APP=qrclip node build.mts
import { render, screen } from "runtime/jsx-runtime";

const bg = new Skin({ fill: "black" });

// Built INSIDE the build callback: screen.{width,height} are only valid once
// render() has created the Application (jsx-runtime sets them before build runs).
// No skin on the node — skinless is white box + black modules, the only sound
// draw path in 4.17 (see runtime/qrcode's header).
render(
	() =>
		new QRCode(null, {
			string: "https://repebble.com",
			width: screen.width,
			height: screen.height,
		}),
	{ skin: bg },
);
