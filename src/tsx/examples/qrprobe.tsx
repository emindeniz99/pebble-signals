// qrprobe — the ROUND-AWARE receipt for the opt-in `runtime/qrcode` component.
// It began as the raw render probe for the host's QRCode Piu content (hostprobe
// found the global; this app proved it DRAWS — screenshots/qrprobe-gabbro.png,
// a 124px code with a quiet zone). Now that the wrapper exists it demos the
// wrapper, and the receipt it captures is a different, sharper claim:
//
//   <QR fullscreen /> on gabbro is the largest INSCRIBED square (183px), NOT the
//   260px screen — because a QR carries its finder patterns in three CORNERS and
//   a screen-sized square loses exactly those to the round bezel. A frame whose
//   code is whole, with white on all four corners inside the glass, IS the proof.
//   src/tsx/examples/qrclip.tsx renders the naive 260px version as the
//   counter-receipt (chopped corners) for the same question.
//
// Kept from the original probe: black ground, the caption strip, and the rule
// that a host failure must land ON SCREEN rather than vanish. What CHANGED (say
// it, don't hide it — Rule 12): the code is now built inside the render tree by
// the component, so a construction/layout failure is caught by render()'s
// DEFAULT error boundary and painted as a full crash screen instead of being
// squeezed into an 18-char "ERR …" caption — a strictly better receipt, and the
// same one the old header already predicted for LAYOUT failures (Place runs from
// the firmware redraw callback, long after this module returns).
//
// Layout, worked out against gabbro's circle so the caption never lands on the
// code or under the bezel: a full-bleed Container (the examples' root idiom)
// holds both; the 183px code is UNCONSTRAINED, so Piu centers it (the SDK's own
// examples/piu/qrcode/main.js relies on the same rule), leaving a 38px band at
// the bottom (260 − 221.5). The caption takes 18px of it at bottom:14 — rows
// 228..246, where the circle is still 170..117px wide, against ~97px of 14px
// Gothic. No dynamic import here, so treeshake stays on.
// Build: APP=qrprobe node build.mts
import { render } from "runtime/jsx-runtime";
import { QR } from "runtime/qrcode";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "14px Gothic", color: "white", horizontal: "center" });

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<QR string="https://repebble.com" fullscreen />
			<Label left={0} right={0} bottom={14} height={18} style={st} string="qr fullscreen" />
		</Container>
	),
	{ skin: bg, style: st },
);
