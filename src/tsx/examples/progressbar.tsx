// runtime/progressbar receipt — a reactive horizontal progress bar. The fill
// follows a signal (up-press raises it, down lowers it), proving the bar
// repaints for free: `value` is read inside the composed Canvas's paint, so its
// reads auto-track (value change → Canvas effect → invalidate → repaint) with no
// bind wiring. `value` is clamped to [0,1] by the widget; here we also clamp the
// signal so the label reads cleanly.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = +0.1 · down = -0.1.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { ProgressBar } from "runtime/progressbar";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [value, setValue] = useState(0.4);
const inc = () => setValue((v: number) => Math.min(v + 0.1, 1));
const dec = () => setValue((v: number) => Math.max(v - 0.1, 0));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={inc} onPressDown={dec}>
			<Column>
				<ProgressBar value={value} width={120} height={14} fill="#22cc55" />
				<Label string={() => "pct=" + Math.round(value() * 100)} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
