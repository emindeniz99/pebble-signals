// runtime/gauge receipt — a reactive circular gauge/dial. The fill arc's sweep
// follows a signal (up-press raises the value, down lowers it) and the centered
// percent label tracks it, proving the Gauge repaints for free: `value` is read
// inside the composed Canvas's paint, so its reads auto-track (value change →
// Canvas effect → invalidate → repaint) with no bind wiring. The app OWNS the
// value; the Gauge is display-only.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up = +0.1 (clamped ≤ 1) · down = -0.1 (clamped ≥ 0).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Gauge } from "runtime/gauge";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [value, setValue] = useState(0.5);
const up = () => setValue((v: number) => Math.min(v + 0.1, 1));
const down = () => setValue((v: number) => Math.max(v - 0.1, 0));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={up} onPressDown={down}>
			<Gauge value={value} size={120} label={(v) => Math.round(v * 100) + "%"} />
		</Container>
	),
	{ skin: bg, style: base },
);
