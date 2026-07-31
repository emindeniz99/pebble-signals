// runtime/meter receipt — a reactive segmented meter. The lit-bar count follows
// a signal (up-press raises the level, down lowers it), proving the Meter
// repaints for free: `value` is read inside the composed Canvas's paint, so its
// reads auto-track (level change → Canvas effect → invalidate → repaint) with no
// bind wiring.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = +0.2 · down = -0.2 (clamped to [0,1]).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Meter } from "runtime/meter";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [level, setLevel] = useState(0.6);
const up = () => setLevel((v: number) => Math.min(v + 0.2, 1));
const down = () => setLevel((v: number) => Math.max(v - 0.2, 0));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={up} onPressDown={down}>
			<Column>
				<Meter value={level} width={120} height={24} segments={5} />
				<Label string={() => "level=" + Math.round(level() * 100) + "%"} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
