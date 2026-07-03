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
const hms = new Style({ font: "bold 42px Bitham", color: "white" });
const date = new Style({ font: "bold 24px Gothic", color: "#FFAA55" });

// explicit width/height = the SCALED size (2 x 60): the content box would
// otherwise stay at the PDC's 60x60 bounds and the 2x drawing would spill
const svg = new SVGImage(null, { path: "slothvec.pdc", width: 120, height: 120 });

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const two = (n: number) => (n < 10 ? "0" : "") + n;
const [hm, setHm] = useState("");
const [day, setDay] = useState("");
function tick() {
	const d = new Date();
	setHm(two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()));
	setDay(DOW[d.getDay()] + " " + d.getDate());
}
tick();
setInterval(tick, 1000);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			{svg}
			<Label style={hms} string={() => hm()} />
			<Label style={date} string={() => day()} />
		</Column>
	</Container>
), { skin: bg, style: hms });

// post-mount (Bind has run). The PDC is PRECISE paths (1/8-px, type 3), so
// the port's cx*8/tx*8 transform math is unit-correct and we can pivot:
// center at the branch grip (30,7 in 60-space), translate by the same point
// to keep the art centred, scale 2x. Screen x = content + cx + s(x-cx) + tx.
svg.center(30, 7);
svg.translate(30, 7);
svg.scale(2, 2);

// ANIMATION — the vector superpower: swinging is a pure transform (rotate
// around the branch pivot), re-rendered from the same 701B command list.
// No frames, no pixels, no extra memory. Sloths swing slowly.
let phase = 0;
setInterval(() => {
	phase += 0.25;
	svg.rotate(0.12 * Math.sin(phase));
}, 150);
