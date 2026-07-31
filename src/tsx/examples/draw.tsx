// runtime/draw receipt + primitive sampler. The reactive disc's radius follows a
// signal (up/down grows/shrinks it) — proving the JS-rasterized fillColor
// substrate paints AND that paint's reads auto-track (radius change → effect →
// invalidate → repaint). The static primitives around it exercise every
// rasterizer at once (ONE Port paints many): fillRoundRect, strokeRect, line
// (H/V/diagonal), fillCircle, strokeCircle.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = grow radius · down = shrink radius.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Canvas } from "runtime/draw";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [r, setR] = useState(24);
const grow = () => setR(Math.min(r() + 6, 40));
const shrink = () => setR(Math.max(r() - 6, 6));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={grow} onPressDown={shrink}>
			<Column>
				<Canvas
					width={150}
					height={150}
					fill="black"
					paint={(g) => {
						// static sampler of the new primitives
						g.fillRoundRect(8, 8, 60, 40, 10, "#1560bd"); // rounded panel
						g.strokeRect(80, 8, 60, 40, 2, "#f0a000"); // outlined box
						g.line(8, 60, 142, 60, 2, "#00a000"); // crisp horizontal
						g.line(8, 66, 142, 96, 3, "#8000c0"); // diagonal
						// reactive disc + tracking ring (grows/shrinks with r())
						g.fillCircle(75, 112, r(), "#e01818");
						g.strokeCircle(75, 112, 34, "white", 2);
						// a reactive gauge arc — sweeps 0..(r-mapped) degrees clockwise
						g.arc(75, 112, 44, 135, 135 + r() * 5, 5, "#00d0ff");
					}}
				/>
				<Label string={() => "r=" + r()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
