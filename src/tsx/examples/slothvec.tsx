// VECTOR sloth watchface 🦥 — the sloth is a Pebble Draw Command (PDC)
// image (assets/slothvec.pdc, ~600B of flat vector paths) authored in a
// 60x60 viewbox and rendered at 2x (120px) via SVGImage.scale(2,2): free
// resolution-independent scaling, zero pixel memory (vs the raster sloth's
// 68KB sheet + native-heap decode).
//
// HARD-WON rules for SVGImage on this port (see README "Vector images"):
//  - transforms must be applied AFTER render(): PiuSVGImageBind overwrites
//    cx/cy at mount, clobbering anything set earlier, and the image only
//    draws at all once a transform has been applied.
//  - center(0,0) is required: doTransform subtracts cx*8 from every point
//    (1/8-px units), so the default center displaces whole-pixel art off
//    screen (the "invisible circle" bug).
//  - scale() multiplies path POINTS and stroke widths but NOT circle radii
//    — scalable art must be all paths/polygons (ellipses as N-gons).
// Build: APP=slothvec ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
declare const SVGImage: any;

const bg = new Skin({ fill: "black" });
// typography aligned with the raster `sloth`: HH:MM confident white, the
// seconds the SAME 42px but dimmed grey (a quiet live tick), the date muted +
// uppercased on its own line.
const hm = new Style({ font: "bold 42px Bitham", color: "white" });
const sec = new Style({ font: "bold 42px Bitham", color: "#a0a0a0" });
const dim = new Style({ font: "18px Gothic", color: "#7a7a7a" });

// explicit width/height = the SCALED size (2 x 60): the content box would
// otherwise stay at the PDC's 60x60 bounds and the 2x drawing would spill.
// The .pdc is a PDCS SEQUENCE (4 blink frames: open/half/closed/half, the
// durations baked into the file) — the behavior is the official
// pdc-sequence pattern: start playback on display, loop by rewinding on
// finish. Frames advance natively by content time; the swing's rotate()
// re-clones from the CURRENT frame each tick, so blink + swing compose.
// Frames are selected by CONTENT TIME (PiuSVGImageSync: frame_by_elapsed).
// We drive svg.time manually from the swing timer instead of start():
// exact loop pacing, and it sidesteps a port quirk (Bind sums frame 0's
// duration for every frame, inflating the natural cycle, and elapsed past
// the real total sticks on the last frame).
const svg = new SVGImage(null, { path: "slothvec.pdc", width: 120, height: 120 });

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const two = (n: number) => (n < 10 ? "0" : "") + n;
const [hhmm, setHhmm] = useState("");
const [secs, setSecs] = useState("");
const [day, setDay] = useState("");
function tick() {
	const d = new Date();
	setHhmm(two(d.getHours()) + ":" + two(d.getMinutes()));
	setSecs(":" + two(d.getSeconds()));
	setDay(DOW[d.getDay()] + " " + d.getDate());
}
tick();
setInterval(tick, 1000);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			{svg}
			<Row>
				<Label style={hm} string={() => hhmm()} />
				<Label style={sec} string={() => secs()} />
			</Row>
			<Label style={dim} string={() => day()} />
		</Column>
	</Container>
), { skin: bg, style: hm });

// post-mount (Bind has run). The PDC is PRECISE paths (1/8-px, type 3), so
// the port's cx*8/tx*8 transform math is unit-correct and we can pivot:
// center at the branch grip (30,7 in 60-space), translate by the same point
// to keep the art centred, scale 2x. Screen x = content + cx + s(x-cx) + tx.
svg.center(30, 7);
svg.translate(30, 7);
svg.scale(2, 2);

// ANIMATION — the vector superpower, two layers from ONE timer:
//  - swing: rotate() around the branch pivot (pure transform, no pixels)
//  - blink: drive the PDCS sequence clock (svg.time) — Sync picks the
//    frame by the durations baked into the .pdc (open 2.6s, quick blink)
let phase = 0;
let t = 0;
setInterval(() => {
	phase += 0.25;
	t = (t + 150) % 2930;
	svg.time = t;
	svg.rotate(0.12 * Math.sin(phase));
}, 150);
