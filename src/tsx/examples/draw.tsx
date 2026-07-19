// runtime/draw receipt — a reactive Canvas. The filled disc's radius follows a
// signal (up/down grows/shrinks it), a ring tracks it, and a label reads the
// same signal — proving the JS-rasterized fillColor substrate paints AND that
// paint's reads auto-track (radius change → effect → invalidate → repaint).
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = grow radius · down = shrink radius.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Canvas } from "runtime/draw";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [r, setR] = useState(30);
const grow = () => setR(Math.min(r() + 8, 64));
const shrink = () => setR(Math.max(r() - 8, 8));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={grow} onPressDown={shrink}>
			<Column>
				<Canvas
					width={140}
					height={140}
					fill="black"
					paint={(g) => {
						g.fillCircle(70, 70, r(), "#e01818");
						g.strokeCircle(70, 70, 66, "white", 3);
					}}
				/>
				<Label string={() => "r=" + r()} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
