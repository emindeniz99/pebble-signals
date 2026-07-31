// runtime/clockface receipt — a reactive analog clock. The minute hand follows a
// signal (up-press advances it, down rewinds), proving the face repaints for
// free: `minutes` is read inside the composed Canvas's paint, so its reads
// auto-track (minute change → Canvas effect → invalidate → repaint) with no bind
// wiring. Hours are static here; omitting `seconds` draws no second hand.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = +5 min · down = -5 min (wrapping 0..59).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { ClockFace } from "runtime/clockface";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const [minutes, setMinutes] = useState(10);
const inc = () => setMinutes((m: number) => (m + 5) % 60);
const dec = () => setMinutes((m: number) => (m + 55) % 60);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc} onPressDown={dec}>
			<Column>
				<ClockFace hours={10} minutes={minutes} size={120} />
				<Label string={() => "10:" + String(minutes()).padStart(2, "0")} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
