// runtime/sparkline receipt — a reactive mini line chart. The series lives in a
// signal; each up-press appends a new random-ish value, proving the Sparkline
// repaints for free: `data` is read inside the composed Canvas's paint, so its
// reads auto-track (array change → Canvas effect → invalidate → repaint) with no
// bind wiring. Down-press pops the last point (down to two).
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = append · down = drop last.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Sparkline } from "runtime/sparkline";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const [data, setData] = useState([3, 7, 4, 8, 5]);
// Deterministic "growth" — no Math.random dependency; just walk a small cycle.
const next = (xs: number[]): number => ((xs[xs.length - 1] + 3) % 10) + 1;
const grow = () => setData((xs: number[]) => [...xs, next(xs)]);
const shrink = () => setData((xs: number[]) => (xs.length > 2 ? xs.slice(0, -1) : xs));

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={grow} onPressDown={shrink}>
			<Column>
				<Sparkline data={data} width={120} height={60} color="#00c0ff" thickness={2} />
				<Label string={() => "points=" + data().length} />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
